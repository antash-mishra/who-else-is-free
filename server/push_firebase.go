package main

import (
	"context"
	"fmt"
	"log"
	"os"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// PushNotification describes a single notification to be delivered.
type PushNotification struct {
	Token string            // FCM device token
	Data  map[string]string // data-only payload (no notification block)
}

// PushSender is the interface used by the hub to send push notifications.
type PushSender interface {
	Send(ctx context.Context, notification PushNotification) error
	SendBatch(ctx context.Context, notifications []PushNotification) error
}

// --- FCM implementation ---

type fcmPushSender struct {
	client *messaging.Client
}

// NewFCMPushSender initialises a Firebase Cloud Messaging sender.
// It reads credentials from FIREBASE_CREDENTIALS_JSON (raw JSON string,
// preferred for cloud deployments) or FIREBASE_CREDENTIALS_FILE (file path).
func NewFCMPushSender(ctx context.Context) (PushSender, error) {
	var opt option.ClientOption
	if credsJSON := os.Getenv("FIREBASE_CREDENTIALS_JSON"); credsJSON != "" {
		opt = option.WithCredentialsJSON([]byte(credsJSON))
	} else if credsFile := os.Getenv("FIREBASE_CREDENTIALS_FILE"); credsFile != "" {
		opt = option.WithCredentialsFile(credsFile)
	} else {
		return nil, fmt.Errorf("neither FIREBASE_CREDENTIALS_JSON nor FIREBASE_CREDENTIALS_FILE set")
	}

	app, err := firebase.NewApp(ctx, nil, opt)
	if err != nil {
		return nil, fmt.Errorf("init firebase app: %w", err)
	}

	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("init firebase messaging: %w", err)
	}

	return &fcmPushSender{client: client}, nil
}

func (s *fcmPushSender) Send(ctx context.Context, n PushNotification) error {
	msg := &messaging.Message{
		Token: n.Token,
		Data:  n.Data,
		Android: &messaging.AndroidConfig{
			Priority: "high",
			Notification: &messaging.AndroidNotification{
				Title: n.Data["title"],
				Body:  n.Data["body"],
				Sound: "default",
			},
		},
		APNS: &messaging.APNSConfig{
			Headers: map[string]string{
				"apns-priority": "10",
			},
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{
					ContentAvailable: true,
					MutableContent:   true,
					Sound:            "default",
					Badge:            intPtr(1),
					Alert: &messaging.ApsAlert{
						Title: n.Data["title"],
						Body:  n.Data["body"],
					},
				},
			},
		},
	}

	_, err := s.client.Send(ctx, msg)
	if err != nil {
		return fmt.Errorf("fcm send: %w", err)
	}
	return nil
}

func (s *fcmPushSender) SendBatch(ctx context.Context, notifications []PushNotification) error {
	if len(notifications) == 0 {
		return nil
	}

	msgs := make([]*messaging.Message, 0, len(notifications))
	for _, n := range notifications {
		msgs = append(msgs, &messaging.Message{
			Token: n.Token,
			Data:  n.Data,
			Android: &messaging.AndroidConfig{
				Priority: "high",
				Notification: &messaging.AndroidNotification{
					Title: n.Data["title"],
					Body:  n.Data["body"],
					Sound: "default",
				},
			},
			APNS: &messaging.APNSConfig{
				Headers: map[string]string{
					"apns-priority": "10",
				},
				Payload: &messaging.APNSPayload{
					Aps: &messaging.Aps{
						ContentAvailable: true,
						MutableContent:   true,
						Sound:            "default",
						Badge:            intPtr(1),
						Alert: &messaging.ApsAlert{
							Title: n.Data["title"],
							Body:  n.Data["body"],
						},
					},
				},
			},
		})
	}

	response, err := s.client.SendEach(ctx, msgs)
	if err != nil {
		return fmt.Errorf("fcm send batch: %w", err)
	}
	if response.FailureCount > 0 {
		for _, r := range response.Responses {
			if r.Error != nil {
				log.Printf("fcm batch item error: %v", r.Error)
			}
		}
	}
	return nil
}

func intPtr(n int) *int { return &n }

// --- No-op implementation ---

type noopPushSender struct{}

func NewNoopPushSender() PushSender {
	return &noopPushSender{}
}

func (s *noopPushSender) Send(_ context.Context, _ PushNotification) error {
	return nil
}

func (s *noopPushSender) SendBatch(_ context.Context, _ []PushNotification) error {
	return nil
}

// InitPushSender creates the appropriate PushSender based on config.
// Returns a no-op sender when Firebase is not configured.
func InitPushSender(ctx context.Context) PushSender {
	if os.Getenv("PUSH_ENABLED") != "true" {
		log.Println("push notifications disabled (PUSH_ENABLED != true)")
		return NewNoopPushSender()
	}

	sender, err := NewFCMPushSender(ctx)
	if err != nil {
		log.Printf("push notifications disabled: %v", err)
		return NewNoopPushSender()
	}

	log.Println("push notifications enabled (FCM)")
	return sender
}
