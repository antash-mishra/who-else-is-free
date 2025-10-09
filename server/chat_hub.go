package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ChatHub owns the WebSocket broker state for conversations.
type ChatHub struct {
	repo          *EventRepository
	signer        *tokenSigner
	register      chan *ChatClient
	unregister    chan *ChatClient
	broadcast     chan chatBroadcast
	subscriptions map[int64]map[*ChatClient]struct{}
}

// chatBroadcast represents a message that should be fanned out to listeners.
type chatBroadcast struct {
	conversationID int64
	payload        []byte
}

// ChatClient wraps a single WebSocket connection and its subscriptions.
type ChatClient struct {
	hub            *ChatHub
	conn           *websocket.Conn
	send           chan []byte
	userID         int64
	subscriptions  map[int64]struct{}
	messageHistory []time.Time
}

const (
    // messageRateWindow/messageRateLimit implement a simple anti-spam window.
    messageRateWindow      = 10 * time.Second
	messageRateLimit       = 30
	messageHistoryCapacity = 64
)

type inboundEnvelope struct {
	Type           string `json:"type"`
	ConversationID int64  `json:"conversationId"`
	Body           string `json:"body"`
	TempID         string `json:"tempId"`
}

type outboundMessage struct {
	Type    string         `json:"type"`
	TempID  string         `json:"tempId,omitempty"`
	Message messagePayload `json:"message"`
}

type messagePayload struct {
	ID             int64  `json:"id"`
	ConversationID int64  `json:"conversationId"`
	SenderID       int64  `json:"senderId"`
	Body           string `json:"body"`
	CreatedAt      string `json:"createdAt"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func NewChatHub(repo *EventRepository, signer *tokenSigner) *ChatHub {
	return &ChatHub{
		repo:          repo,
		signer:        signer,
		register:      make(chan *ChatClient),
		unregister:    make(chan *ChatClient),
		broadcast:     make(chan chatBroadcast),
		subscriptions: make(map[int64]map[*ChatClient]struct{}),
	}
}

// Run processes register/unregister/broadcast events on the hub.
func (h *ChatHub) Run() {
	for {
		select {
		case client := <-h.register:
			for conversationID := range client.subscriptions {
				if _, ok := h.subscriptions[conversationID]; !ok {
					h.subscriptions[conversationID] = make(map[*ChatClient]struct{})
				}
				h.subscriptions[conversationID][client] = struct{}{}
			}
		case client := <-h.unregister:
			if err := client.conn.Close(); err != nil {
				log.Printf("chat client close error: %v", err)
			}
			for conversationID := range client.subscriptions {
				if subs, ok := h.subscriptions[conversationID]; ok {
					delete(subs, client)
					if len(subs) == 0 {
						delete(h.subscriptions, conversationID)
					}
				}
			}
		case msg := <-h.broadcast:
			subs := h.subscriptions[msg.conversationID]
			for client := range subs {
				select {
				case client.send <- msg.payload:
				default:
					close(client.send)
					delete(subs, client)
				}
			}
		}
	}
}

// handleWebSocket authenticates via token query param and upgrades to WS.
func (h *ChatHub) handleWebSocket(c *gin.Context) {
	token := c.Query("token")
	if strings.TrimSpace(token) == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token is required"})
		return
	}

	claims, err := h.signer.verify(token)
	if err != nil {
		status := http.StatusUnauthorized
		if err == errExpiredToken {
			status = http.StatusUnauthorized
		}
		c.JSON(status, gin.H{"error": "invalid or expired token"})
		return
	}

	userID := claims.UserID

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()
	conversations, err := h.repo.ListConversations(ctx, userID)
	if err != nil {
		log.Printf("list conversations failed: %v", err)
		conn.Close()
		return
	}

	client := &ChatClient{
		hub:           h,
		conn:          conn,
		send:          make(chan []byte, 8),
		userID:        userID,
		subscriptions: make(map[int64]struct{}),
	}

	for _, convo := range conversations {
		client.subscriptions[convo.ID] = struct{}{}
	}

	h.register <- client

	go client.writePump()
	client.readPump()
}

// readPump listens for incoming frames and dispatches recognized commands.
func (c *ChatClient) readPump() {
	defer func() {
		c.hub.unregister <- c
	}()
	c.conn.SetReadLimit(1024)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	for {
		_, payload, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("readPump error: %v", err)
			}
			break
		}

		var inbound inboundEnvelope
		if err := json.Unmarshal(payload, &inbound); err != nil {
			log.Printf("invalid inbound payload: %v", err)
			continue
		}

		switch inbound.Type {
		case "message:send":
			c.handleSend(inbound)
		case "ping":
			c.send <- []byte(`{"type":"pong"}`)
		default:
			log.Printf("unknown message type: %s", inbound.Type)
		}
	}
}

// writePump forwards outbound chat events and keep-alive pings.
func (c *ChatClient) writePump() {
	ticker := time.NewTicker(50 * time.Second)
	defer func() {
		ticker.Stop()
		if err := c.conn.Close(); err != nil {
			log.Printf("writePump close error: %v", err)
		}
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleSend validates membership, stores, and broadcasts a message.
func (c *ChatClient) handleSend(inbound inboundEnvelope) {
	if inbound.ConversationID == 0 || strings.TrimSpace(inbound.Body) == "" {
		return
	}
	if _, ok := c.subscriptions[inbound.ConversationID]; !ok {
		log.Printf("user %d attempted to send to conversation %d without membership", c.userID, inbound.ConversationID)
		return
	}

	now := time.Now()
	if !c.allowMessage(now) {
		log.Printf("user %d exceeded message rate limit", c.userID)
		c.send <- []byte(`{"type":"system:error","code":"rate_limited"}`)
		return
	}

	params := CreateMessageParams{
		ConversationID: inbound.ConversationID,
		SenderID:       c.userID,
		Body:           inbound.Body,
		DeliveryStatus: "sent",
	}

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	msg, err := c.hub.repo.CreateMessage(ctx, params)
	if err != nil {
		log.Printf("create message failed: %v", err)
		return
	}

	if err := c.hub.repo.UpdateReadState(ctx, msg.ConversationID, c.userID, msg.ID); err != nil {
		log.Printf("update read state after send failed: %v", err)
	}

	envelope := outboundMessage{
		Type:   "message:new",
		TempID: inbound.TempID,
		Message: messagePayload{
			ID:             msg.ID,
			ConversationID: msg.ConversationID,
			SenderID:       msg.SenderID,
			Body:           msg.Body,
			CreatedAt:      msg.CreatedAt.Format(time.RFC3339Nano),
		},
	}

	payload, err := json.Marshal(envelope)
	if err != nil {
		log.Printf("marshal outbound failed: %v", err)
		return
	}

	c.hub.broadcast <- chatBroadcast{conversationID: msg.ConversationID, payload: payload}
}

// allowMessage implements a sliding window limiter to curb rapid sends.
func (c *ChatClient) allowMessage(now time.Time) bool {
	windowStart := now.Add(-messageRateWindow)
	filtered := c.messageHistory[:0]
	for _, ts := range c.messageHistory {
		if ts.After(windowStart) {
			filtered = append(filtered, ts)
		}
	}
	c.messageHistory = filtered

	if len(c.messageHistory) >= messageRateLimit {
		return false
	}

	c.messageHistory = append(c.messageHistory, now)
	if len(c.messageHistory) > messageHistoryCapacity {
		c.messageHistory = c.messageHistory[len(c.messageHistory)-messageHistoryCapacity:]
	}
	return true
}

func RegisterChatRoutes(router *gin.RouterGroup, repo *EventRepository) {
	handler := &ChatHTTPHandler{repo: repo}

	router.GET("/conversations", handler.listConversations)
	router.GET("/conversations/:id/messages", handler.listMessages)
	router.POST("/conversations", handler.createConversation)
}

type ChatHTTPHandler struct {
	repo *EventRepository
}

type createConversationRequest struct {
	Title     *string `json:"title"`
	MemberIDs []int64 `json:"memberIds"`
}

type createConversationResponse struct {
	Conversation ConversationSummary `json:"conversation"`
}

type listConversationResponse struct {
	Conversations []ConversationSummary `json:"conversations"`
}

type listMessagesResponse struct {
	Messages []messagePayload `json:"messages"`
}

func (h *ChatHTTPHandler) createConversation(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	var payload createConversationRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	convo, err := h.repo.CreateConversation(ctx, payload.Title, claims.UserID, payload.MemberIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create conversation"})
		return
	}

	summary, err := h.repo.hydrateConversationSummary(ctx, *convo, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conversation details"})
		return
	}

	c.JSON(http.StatusCreated, createConversationResponse{Conversation: summary})
}

func (h *ChatHTTPHandler) listConversations(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	conversations, err := h.repo.ListConversations(ctx, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conversations"})
		return
	}

	c.JSON(http.StatusOK, listConversationResponse{Conversations: conversations})
}

func (h *ChatHTTPHandler) listMessages(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	conversationIDParam := c.Param("id")
	conversationID, err := strconv.ParseInt(conversationIDParam, 10, 64)
	if err != nil || conversationID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	limitParam := c.DefaultQuery("limit", "20")
	offsetParam := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitParam)
	if err != nil {
		limit = 20
	}
	offset, err := strconv.Atoi(offsetParam)
	if err != nil {
		offset = 0
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	isMember, err := h.repo.IsConversationMember(ctx, conversationID, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
		return
	}
	if !isMember {
		c.JSON(http.StatusForbidden, gin.H{"error": "conversation access denied"})
		return
	}

	messages, err := h.repo.ListMessages(ctx, conversationID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load messages"})
		return
	}

	if len(messages) > 0 {
		latest := messages[0]
		if err := h.repo.UpdateReadState(ctx, conversationID, claims.UserID, latest.ID); err != nil {
			log.Printf("update read state failed: %v", err)
		}
	}

	payloads := make([]messagePayload, 0, len(messages))
	for _, msg := range messages {
		payloads = append(payloads, messagePayload{
			ID:             msg.ID,
			ConversationID: msg.ConversationID,
			SenderID:       msg.SenderID,
			Body:           msg.Body,
			CreatedAt:      msg.CreatedAt.Format(time.RFC3339Nano),
		})
	}

	c.JSON(http.StatusOK, listMessagesResponse{Messages: payloads})
}

func containsInt64(values []int64, target int64) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}
