package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const placesRequestTimeout = 5 * time.Second
const placesAutocompleteURL = "https://places.googleapis.com/v1/places:autocomplete"
const placesDetailsURL = "https://places.googleapis.com/v1/places/%s"

type PlacesHandler struct {
	apiKey string
	client *http.Client
}

func NewPlacesHandler() *PlacesHandler {
	return &PlacesHandler{
		apiKey: os.Getenv("GOOGLE_PLACES_API_KEY"),
		client: &http.Client{Timeout: placesRequestTimeout},
	}
}

type autocompletePrediction struct {
	PlaceID        string `json:"placePrediction"`
	Text           textValue `json:"text"`
	StructuredFormat struct {
		MainText      textValue `json:"mainText"`
		SecondaryText textValue `json:"secondaryText"`
	} `json:"structuredFormat"`
}

type textValue struct {
	Text string `json:"text"`
}

type autocompleteRequest struct {
	Input               string   `json:"input"`
	SessionToken        string   `json:"sessionToken,omitempty"`
	IncludedRegionCodes []string `json:"includedRegionCodes,omitempty"`
}

type autocompleteResponse struct {
	Suggestions []struct {
		PlacePrediction struct {
			PlaceID        string `json:"placeId"`
			Text           textValue `json:"text"`
			StructuredFormat struct {
				MainText      textValue `json:"mainText"`
				SecondaryText textValue `json:"secondaryText"`
			} `json:"structuredFormat"`
		} `json:"placePrediction"`
	} `json:"suggestions"`
}

type placeDetailResponse struct {
	ID               string `json:"id"`
	DisplayName      textValue `json:"displayName"`
	FormattedAddress string `json:"formattedAddress"`
	Location         struct {
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
	} `json:"location"`
}

type simplifiedPrediction struct {
	PlaceID        string `json:"placeId"`
	MainText       string `json:"mainText"`
	SecondaryText  string `json:"secondaryText"`
}

type simplifiedDetail struct {
	PlaceID          string  `json:"placeId"`
	DisplayName      string  `json:"displayName"`
	FormattedAddress string  `json:"formattedAddress"`
	Latitude         float64 `json:"latitude"`
	Longitude        float64 `json:"longitude"`
}

func includedRegionCode(value string) []string {
	countryCode := strings.ToLower(strings.TrimSpace(value))
	if len(countryCode) != 2 || countryCode[0] < 'a' || countryCode[0] > 'z' || countryCode[1] < 'a' || countryCode[1] > 'z' {
		return nil
	}
	return []string{countryCode}
}

func (h *PlacesHandler) autocomplete(c *gin.Context) {
	input := c.Query("input")
	if input == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "input query parameter is required"})
		return
	}

	if len(input) < 2 {
		c.JSON(http.StatusOK, gin.H{"predictions": []simplifiedPrediction{}})
		return
	}

	if h.apiKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "places api not configured"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), placesRequestTimeout)
	defer cancel()

	reqBody := autocompleteRequest{
		Input:               input,
		IncludedRegionCodes: includedRegionCode(c.Query("country")),
	}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
		return
	}

	req, err := http.NewRequestWithContext(ctx, "POST", placesAutocompleteURL, bytes.NewReader(jsonBody))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", h.apiKey)

	resp, err := h.client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "places request failed"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read places response"})
		return
	}

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "places api error", "status": resp.StatusCode, "body": string(body)})
		return
	}

	var result autocompleteResponse
	if err := json.Unmarshal(body, &result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse places response"})
		return
	}

	predictions := make([]simplifiedPrediction, 0, len(result.Suggestions))
	for _, s := range result.Suggestions {
		predictions = append(predictions, simplifiedPrediction{
			PlaceID:       s.PlacePrediction.PlaceID,
			MainText:      s.PlacePrediction.StructuredFormat.MainText.Text,
			SecondaryText: s.PlacePrediction.StructuredFormat.SecondaryText.Text,
		})
	}

	c.JSON(http.StatusOK, gin.H{"predictions": predictions})
}

func (h *PlacesHandler) details(c *gin.Context) {
	placeID := c.Query("placeId")
	if placeID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "placeId query parameter is required"})
		return
	}

	if h.apiKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "places api not configured"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), placesRequestTimeout)
	defer cancel()

	url := fmt.Sprintf(placesDetailsURL, placeID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
		return
	}

	req.Header.Set("X-Goog-Api-Key", h.apiKey)
	req.URL.RawQuery = "fields=id,displayName,formattedAddress,location"

	resp, err := h.client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "places request failed"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read places response"})
		return
	}

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "places api error", "status": resp.StatusCode, "body": string(body)})
		return
	}

	var result placeDetailResponse
	if err := json.Unmarshal(body, &result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse places response"})
		return
	}

	c.JSON(http.StatusOK, simplifiedDetail{
		PlaceID:          result.ID,
		DisplayName:      result.DisplayName.Text,
		FormattedAddress: result.FormattedAddress,
		Latitude:         result.Location.Latitude,
		Longitude:        result.Location.Longitude,
	})
}
