package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type ProfileHandler struct {
	repo *EventRepository
}

func NewProfileHandler(repo *EventRepository) *ProfileHandler {
	return &ProfileHandler{repo: repo}
}

type updateProfileRequest struct {
	Name   string  `json:"name" binding:"required,min=1"`
	Gender string  `json:"gender" binding:"required,oneof=Female Male"`
	Age    int     `json:"age" binding:"required,gte=13,lte=120"`
	Avatar *string `json:"avatar"`
}

func (h *ProfileHandler) UpdateProfile(c *gin.Context) {
	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID := claims.UserID

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fetch current user to check if gender/age are already set
	existingUser, err := h.repo.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		log.Printf("profile update: failed to fetch user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch user"})
		return
	}

	// Gender and age are immutable once set
	if existingUser.Gender != nil && *existingUser.Gender != req.Gender {
		c.JSON(http.StatusBadRequest, gin.H{"error": "gender cannot be changed once set"})
		return
	}
	if existingUser.Age != nil && *existingUser.Age != req.Age {
		c.JSON(http.StatusBadRequest, gin.H{"error": "age cannot be changed once set"})
		return
	}

	gender := req.Gender
	age := req.Age

	params := UpdateProfileParams{
		Name:   req.Name,
		Gender: &gender,
		Age:    &age,
		Avatar: req.Avatar,
	}

	user, err := h.repo.UpdateUserProfile(c.Request.Context(), userID, params)
	if err != nil {
		log.Printf("profile update: failed to update user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}

	userResponse := gin.H{
		"id":               user.ID,
		"name":             user.Name,
		"email":            user.Email,
		"profile_complete": user.ProfileComplete,
	}
	if user.Gender != nil {
		userResponse["gender"] = *user.Gender
	}
	if user.Age != nil {
		userResponse["age"] = *user.Age
	}
	if user.Avatar != nil {
		userResponse["avatar"] = *user.Avatar
	}

	c.JSON(http.StatusOK, gin.H{"user": userResponse})
}
