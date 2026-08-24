package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const requestTimeout = 5 * time.Second
const updatedEventDetailMessage = "Plan details updated"
const eventDeletedPushBody = "The host deleted this event."

type EventHandler struct {
	repo *EventRepository
	hub  *ChatHub
}

func NewEventHandler(repo *EventRepository, hub ...*ChatHub) *EventHandler {
	handler := &EventHandler{repo: repo}
	if len(hub) > 0 {
		handler.hub = hub[0]
	}
	return handler
}

func (h *EventHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.GET("/events", h.listEvents)
	group.GET("/covers", h.listCovers)
}

func (h *EventHandler) RegisterProtectedRoutes(group *gin.RouterGroup) {
	group.POST("/events", h.createEvent)
	group.GET("/events/past", h.listUserPastEvents)
	group.GET("/events/:id/members", h.listEventMembers)
	group.GET("/events/:id", h.getEvent)
	group.PUT("/events/:id", h.updateEvent)
	group.DELETE("/events/:id", h.deleteEvent)
}

func (h *EventHandler) listEvents(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	var viewerUserID int64
	token := bearerTokenFromHeader(c.GetHeader("Authorization"))
	if token != "" {
		signer, signerErr := newTokenSignerFromEnv()
		if signerErr == nil {
			if claims, verifyErr := signer.verify(token); verifyErr == nil {
				viewerUserID = claims.UserID
			}
		}
	}

	events, err := h.repo.ListForViewer(ctx, viewerUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch events"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": events})
}

func (h *EventHandler) listCovers(c *gin.Context) {
	options := listCoverOptions()
	baseURL := requestBaseURL(c)
	for i := range options {
		options[i].URL = baseURL + "/assets/covers/" + options[i].FileName
	}
	c.JSON(http.StatusOK, gin.H{
		"data":       options,
		"categories": listCoverCategories(),
	})
}

func (h *EventHandler) listUserPastEvents(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	events, err := h.repo.ListUserPastEvents(ctx, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch past events"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": events})
}

func (h *EventHandler) getEvent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	event, err := h.repo.GetEventByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		}
		return
	}

	canView, err := h.canViewEvent(ctx, event, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		return
	}
	if !canView {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": event})
}

func (h *EventHandler) listEventMembers(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	event, err := h.repo.GetEventByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		}
		return
	}

	canView, err := h.canViewEvent(ctx, event, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		return
	}
	if !canView {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	if event.UserID != claims.UserID {
		isMember, err := h.isEventConversationMember(ctx, id, claims.UserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
			return
		}
		if !isMember {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
			return
		}
	}

	members, err := h.repo.ListEventMembers(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event members"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (h *EventHandler) canViewEvent(ctx context.Context, event *Event, viewerUserID int64) (bool, error) {
	if event.UserID == viewerUserID {
		return true, nil
	}

	blocked, err := h.repo.AreUsersBlocked(ctx, event.UserID, viewerUserID)
	if err != nil {
		return false, err
	}
	if blocked {
		return false, nil
	}

	if isEventPast(event, time.Now()) {
		return h.isEventConversationMember(ctx, event.ID, viewerUserID)
	}

	return true, nil
}

func (h *EventHandler) isEventConversationMember(ctx context.Context, eventID, userID int64) (bool, error) {
	members, err := h.repo.ListEventConversationMembers(ctx, eventID)
	if err != nil {
		return false, err
	}
	for _, member := range members {
		if member.UserID == userID {
			return true, nil
		}
	}
	return false, nil
}

func isEventPast(event *Event, now time.Time) bool {
	if event.ScheduledAt != nil {
		return event.ScheduledAt.Before(now.UTC())
	}
	parsedDate, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(event.EventDate), now.Location())
	if err != nil {
		return false
	}
	return startOfDay(parsedDate).Before(startOfDay(now))
}

func (h *EventHandler) createEvent(c *gin.Context) {
	var payload CreateEventParams
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	payload.UserID = claims.UserID

	if payload.MaxAge < payload.MinAge {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max_age must be greater than or equal to min_age"})
		return
	}

	now := time.Now()

	// If scheduled_at is provided, validate it and normalize legacy fields.
	if payload.ScheduledAt != "" {
		scheduledTime, err := parseScheduledAt(payload.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.ScheduledAt = formatScheduledAtUTC(scheduledTime)

		eventDate, timeStr, dateLabel, err := normalizeScheduledLegacyFields(
			payload.EventDate,
			payload.Time,
			payload.DateLabel,
			now,
		)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.EventDate = eventDate
		payload.Time = timeStr
		payload.DateLabel = dateLabel
	} else {
		// Fall back to legacy validation
		eventDate, normalizedLabel, _, err := normalizeEventSchedule(payload.EventDate, payload.Time, now)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.EventDate = eventDate
		payload.DateLabel = normalizedLabel
	}

	payload.GroupType = strings.TrimSpace(payload.GroupType)
	if payload.GroupType == "" {
		payload.GroupType = "Single"
	}
	coverKey, ok := normalizeCoverKey(payload.CoverKey)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid cover_key"})
		return
	}
	payload.CoverKey = coverKey

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	id, err := h.repo.Create(ctx, payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create event"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *EventHandler) updateEvent(c *gin.Context) {
	var payload UpdateEventParams
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if payload.MaxAge < payload.MinAge {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max_age must be greater than or equal to min_age"})
		return
	}

	if payload.CoverKey != nil {
		value, ok := normalizeCoverKey(*payload.CoverKey)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid cover_key"})
			return
		}
		payload.CoverKey = &value
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	// Get user from session
	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	now := time.Now()

	// If scheduled_at is provided, validate it and normalize legacy fields.
	if payload.ScheduledAt != "" {
		scheduledTime, err := parseScheduledAt(payload.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.ScheduledAt = formatScheduledAtUTC(scheduledTime)

		eventDate, timeStr, dateLabel, err := normalizeScheduledLegacyFields(
			payload.EventDate,
			payload.Time,
			payload.DateLabel,
			now,
		)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.EventDate = eventDate
		payload.Time = timeStr
		payload.DateLabel = dateLabel
	} else {
		// Fall back to legacy validation
		eventDate, normalizedLabel, _, err := normalizeEventSchedule(payload.EventDate, payload.Time, now)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload.EventDate = eventDate
		payload.DateLabel = normalizedLabel
	}

	payload.GroupType = strings.TrimSpace(payload.GroupType)
	if payload.GroupType == "" {
		payload.GroupType = "Single"
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	transition, err := h.repo.Update(ctx, id, claims.UserID, payload)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found or not owned by user"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update event"})
		}
		return
	}

	if h.hub != nil && transition != nil {
		for _, member := range transition.RemovedMemberships {
			h.hub.NotifyMembership(member.ConversationID, member.UserID, "removed")
		}
		for _, member := range transition.AddedMemberships {
			h.hub.NotifyMembership(member.ConversationID, member.UserID, "added")
		}
	}

	if transition != nil {
		h.emitEventUpdateChatMessages(ctx, id, claims.UserID, transition.PostMigrationConversationIDs)
	}

	c.JSON(http.StatusOK, gin.H{"message": "event updated"})
}

func (h *EventHandler) emitEventUpdateChatMessages(ctx context.Context, eventID, hostUserID int64, conversationIDs []int64) {
	if h.hub == nil {
		return
	}

	if len(conversationIDs) == 0 {
		return
	}

	seenConversationIDs := make(map[int64]struct{}, len(conversationIDs))
	for _, conversationID := range conversationIDs {
		if conversationID == 0 {
			continue
		}
		if _, seen := seenConversationIDs[conversationID]; seen {
			continue
		}
		seenConversationIDs[conversationID] = struct{}{}

		message, err := h.repo.CreateMessage(ctx, CreateMessageParams{
			ConversationID: conversationID,
			SenderID:       hostUserID,
			Body:           updatedEventDetailMessage,
			DeliveryStatus: "sent",
			Kind:           MessageKindSystem,
		})
		if err != nil {
			log.Printf(
				"failed to create event update message for event %d conversation %d: %v",
				eventID,
				conversationID,
				err,
			)
			continue
		}

		h.hub.emitChatMessage(message, "")
	}
}

func (h *EventHandler) deleteEvent(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	// Get user from session
	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	event, err := h.repo.GetEventByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found or not owned by user"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		}
		return
	}
	if event.UserID != claims.UserID {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found or not owned by user"})
		return
	}

	members, membersErr := h.repo.ListEventConversationMembers(ctx, id)
	if membersErr != nil {
		log.Printf("failed to list event members for deletion notification (event %d): %v", id, membersErr)
	}

	affectedMembers := make([]EventConversationMember, 0, len(members))
	recipientIDs := make([]int64, 0, len(members))
	seenRecipients := make(map[int64]struct{}, len(members))
	for _, member := range members {
		if member.UserID == claims.UserID {
			continue
		}
		affectedMembers = append(affectedMembers, member)
		if _, seen := seenRecipients[member.UserID]; seen {
			continue
		}
		seenRecipients[member.UserID] = struct{}{}
		recipientIDs = append(recipientIDs, member.UserID)
	}

	err = h.repo.Delete(ctx, id, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found or not owned by user"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete event"})
		}
		return
	}

	if h.hub != nil {
		for _, member := range affectedMembers {
			h.hub.NotifyMembership(member.ConversationID, member.UserID, "removed")
		}
		if len(recipientIDs) > 0 {
			h.hub.recordAndSendPushToUsers(recipientIDs, map[string]string{
				"type":    "event.deleted",
				"eventId": strconv.FormatInt(id, 10),
				"title":   event.Title,
				"body":    eventDeletedPushBody,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "event deleted"})
}

func normalizeCoverKey(value string) (string, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return defaultCoverKey, true
	}
	return trimmed, isValidCoverKey(trimmed)
}

func requestBaseURL(c *gin.Context) string {
	proto := strings.TrimSpace(c.GetHeader("X-Forwarded-Proto"))
	if proto == "" {
		proto = "http"
		if c.Request.TLS != nil {
			proto = "https"
		}
	}
	host := strings.TrimSpace(c.GetHeader("X-Forwarded-Host"))
	if host == "" {
		host = c.Request.Host
	}
	return proto + "://" + host
}

type reportEventBody struct {
	Reason string `json:"reason" binding:"required"`
}

func (h *EventHandler) reportEvent(c *gin.Context) {
	claims, exists := sessionFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	idStr := c.Param("id")
	eventID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	var payload reportEventBody
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reason := strings.TrimSpace(payload.Reason)
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reason is required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	// Verify event exists
	_, err = h.repo.GetEventByID(ctx, eventID)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		return
	}

	report, err := h.repo.CreateEventReport(ctx, eventID, claims.UserID, reason)
	if err != nil {
		if errors.Is(err, ErrReportAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": "you have already reported this event"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit report"})
		return
	}

	convo, convoErr := h.repo.findUserConversationForEventPublic(ctx, eventID, claims.UserID)
	if convoErr != nil && !errors.Is(convoErr, ErrConversationNotFound) {
		log.Printf("failed to find reporter conversation for event %d user %d: %v", eventID, claims.UserID, convoErr)
	}

	// Reporter should be detached from event participation after report submission.
	removeErr := h.repo.RemoveEventMember(ctx, eventID, claims.UserID)
	if removeErr != nil &&
		!errors.Is(removeErr, ErrNotConversationMember) &&
		!errors.Is(removeErr, ErrCannotRemoveHost) {
		log.Printf("failed to remove reporter %d from event %d: %v", claims.UserID, eventID, removeErr)
	}

	if removeErr == nil && convo != nil && h.hub != nil {
		h.hub.NotifyMembership(convo.ID, claims.UserID, "removed")
	}

	// Silently cancel any pending join request for this user/event and resolve
	// the matching host task when stable identity is available.
	pendingRequest, pendingErr := h.repo.GetPendingJoinRequest(ctx, eventID, claims.UserID)
	if err := h.repo.CancelJoinRequest(ctx, eventID, claims.UserID); err == nil && pendingErr == nil {
		if resolveErr := h.repo.ResolveJoinRequestNotifications(
			ctx,
			eventID,
			pendingRequest.ID,
			NotificationActionResolved,
			NotificationReasonRequestCancelled,
		); resolveErr != nil {
			log.Printf("notifications: resolve reported-event request %d failed: %v", pendingRequest.ID, resolveErr)
		}
	}

	c.JSON(http.StatusCreated, gin.H{"report": report})
}
