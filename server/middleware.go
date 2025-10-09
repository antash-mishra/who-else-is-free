package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type contextKey string

const sessionContextKey contextKey = "chatSession"

func bearerTokenFromHeader(header string) string {
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 {
		return ""
	}
	if !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func sessionMiddleware(signer *tokenSigner) gin.HandlerFunc {
    // sessionMiddleware is applied to REST routes that require authentication.
    // It pulls the bearer token, validates it, and stashes the claims on the context
    // so handlers can trust the user identity.
    return func(c *gin.Context) {
        token := bearerTokenFromHeader(c.GetHeader("Authorization"))
        if token == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
            return
		}

		claims, err := signer.verify(token)
		if err != nil {
			status := http.StatusUnauthorized
			if err == errExpiredToken {
				status = http.StatusUnauthorized
			}
			c.AbortWithStatusJSON(status, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set(string(sessionContextKey), claims)
		c.Next()
	}
}

func sessionFromContext(c *gin.Context) (*sessionClaims, bool) {
    // Helpers return the claims previously injected by sessionMiddleware.
    value, ok := c.Get(string(sessionContextKey))
    if !ok {
        return nil, false
    }
	claims, ok := value.(*sessionClaims)
	return claims, ok
}
