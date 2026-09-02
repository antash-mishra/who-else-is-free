package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestPlacesAutocompleteRestrictsResultsToViewerCountry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var sent autocompleteRequest
	handler := &PlacesHandler{
		apiKey: "test-key",
		client: &http.Client{Transport: roundTripperFunc(func(request *http.Request) (*http.Response, error) {
			if request.URL.String() != placesAutocompleteURL {
				t.Fatalf("unexpected Places URL: %s", request.URL)
			}
			if err := json.NewDecoder(request.Body).Decode(&sent); err != nil {
				t.Fatalf("decode Places request: %v", err)
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body: io.NopCloser(bytes.NewBufferString(`{
					"suggestions": []
				}`)),
			}, nil
		})},
	}

	router := gin.New()
	router.GET("/api/places/autocomplete", handler.autocomplete)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/places/autocomplete?input=Dublin&country=US", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if sent.Input != "Dublin" {
		t.Fatalf("input = %q, want Dublin", sent.Input)
	}
	if !reflect.DeepEqual(sent.IncludedRegionCodes, []string{"us"}) {
		t.Fatalf("includedRegionCodes = %#v, want []string{\"us\"}", sent.IncludedRegionCodes)
	}
}

func TestPlacesAutocompleteAllowsFallbackWhenViewerCountryIsUnavailable(t *testing.T) {
	if got := includedRegionCode(" "); got != nil {
		t.Fatalf("empty country yielded %#v, want nil", got)
	}
	if got := includedRegionCode("Ireland"); got != nil {
		t.Fatalf("invalid country yielded %#v, want nil", got)
	}
}
