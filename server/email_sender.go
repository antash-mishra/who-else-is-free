package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// emailSender delivers sign-in codes. Implementations must never log the
// recipient address.
type emailSender interface {
	SendLoginCode(ctx context.Context, to, code string) error
}

const cloudflareAPIBaseURL = "https://api.cloudflare.com/client/v4"

// cloudflareEmailSender sends through Cloudflare Email Sending's REST API.
type cloudflareEmailSender struct {
	accountID   string
	apiToken    string
	fromAddress string
	fromName    string
	baseURL     string
	client      *http.Client
}

// newEmailSenderFromEnv returns the Cloudflare sender when it is configured, a
// development sender that logs codes when EMAIL_LOGIN_DEV_LOG_CODES=1, and nil
// otherwise (email sign-in then reports itself unavailable).
func newEmailSenderFromEnv() emailSender {
	accountID := strings.TrimSpace(os.Getenv("CLOUDFLARE_ACCOUNT_ID"))
	apiToken := strings.TrimSpace(os.Getenv("CLOUDFLARE_EMAIL_API_TOKEN"))
	fromAddress := strings.TrimSpace(os.Getenv("EMAIL_LOGIN_FROM"))
	if accountID != "" && apiToken != "" && fromAddress != "" {
		fromName := strings.TrimSpace(os.Getenv("EMAIL_LOGIN_FROM_NAME"))
		if fromName == "" {
			fromName = "weif"
		}
		return &cloudflareEmailSender{
			accountID:   accountID,
			apiToken:    apiToken,
			fromAddress: fromAddress,
			fromName:    fromName,
			baseURL:     cloudflareAPIBaseURL,
			client:      &http.Client{Timeout: 10 * time.Second},
		}
	}
	if strings.TrimSpace(os.Getenv("EMAIL_LOGIN_DEV_LOG_CODES")) == "1" {
		log.Printf("WARNING: EMAIL_LOGIN_DEV_LOG_CODES is on — email sign-in codes are written to the log instead of being sent. Never enable in production.")
		return devLogEmailSender{}
	}
	return nil
}

func loginCodeSubject(code string) string {
	return "Your weif code: " + code
}

func loginCodeText(code string) string {
	return "Your weif sign-in code is " + code + ".\n\n" +
		"It expires in 10 minutes. If you didn't ask for this, you can ignore this email.\n"
}

func loginCodeHTML(code string) string {
	escaped := html.EscapeString(code)
	return `<p>Your weif sign-in code is</p>` +
		`<p style="font-size:28px;font-weight:600;letter-spacing:6px;">` + escaped + `</p>` +
		`<p>It expires in 10 minutes. If you didn't ask for this, you can ignore this email.</p>`
}

type cloudflareSendResponse struct {
	Success bool `json:"success"`
	Errors  []struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"errors"`
	Result struct {
		PermanentBounces     []string `json:"permanent_bounces"`
		SuppressedRecipients []string `json:"suppressed_recipients"`
	} `json:"result"`
}

func containsAddress(list []string, address string) bool {
	for _, candidate := range list {
		if strings.EqualFold(strings.TrimSpace(candidate), address) {
			return true
		}
	}
	return false
}

func (s *cloudflareEmailSender) SendLoginCode(ctx context.Context, to, code string) error {
	payload, err := json.Marshal(map[string]any{
		"to":      to,
		"from":    map[string]string{"address": s.fromAddress, "name": s.fromName},
		"subject": loginCodeSubject(code),
		"text":    loginCodeText(code),
		"html":    loginCodeHTML(code),
	})
	if err != nil {
		return fmt.Errorf("encode email: %w", err)
	}

	url := fmt.Sprintf("%s/accounts/%s/email/sending/send", strings.TrimRight(s.baseURL, "/"), s.accountID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build email request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiToken)
	req.Header.Set("Content-Type", "application/json")

	client := s.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return fmt.Errorf("read email response: %w", err)
	}

	var decoded cloudflareSendResponse
	_ = json.Unmarshal(raw, &decoded)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !decoded.Success {
		codes := make([]string, 0, len(decoded.Errors))
		for _, apiErr := range decoded.Errors {
			codes = append(codes, fmt.Sprintf("%d", apiErr.Code))
		}
		return fmt.Errorf("email provider rejected send: status %d, error codes [%s]", resp.StatusCode, strings.Join(codes, ","))
	}
	if containsAddress(decoded.Result.PermanentBounces, to) || containsAddress(decoded.Result.SuppressedRecipients, to) {
		return errors.New("email provider did not accept the recipient")
	}
	return nil
}

// devLogEmailSender writes codes to the log for local development only.
type devLogEmailSender struct{}

func (devLogEmailSender) SendLoginCode(_ context.Context, _ string, code string) error {
	log.Printf("email-login dev code: %s", code)
	return nil
}
