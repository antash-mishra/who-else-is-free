package main

import (
    "context"
    "encoding/json"
    "errors"
    "log"
    "net/http"
    "strconv"
    "strings"
    "time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ChatHub owns the in-memory broker that orchestrates WebSocket traffic.
// It keeps long-lived goroutines, channels, and lookup tables that decide
// which connected clients should receive which conversation events.
type ChatHub struct {
	repo          *EventRepository
	signer        *tokenSigner
	register      chan *ChatClient            // fan-in of freshly upgraded sockets
	unregister    chan *ChatClient            // fan-in of disconnecting sockets
	broadcast     chan chatBroadcast          // queue of conversation payloads to fan back out
	membership    chan membershipUpdate       // join/leave notifications from the HTTP layer
	subscriptions map[int64]map[*ChatClient]struct{} // conversationID -> live clients in that room
	clientsByUser map[int64]map[*ChatClient]struct{} // userID -> live sockets for that user
}

// chatBroadcast represents a message that should be fanned out to listeners.
type chatBroadcast struct {
	conversationID int64
	payload        []byte
}

type membershipUpdate struct {
	conversationID int64
	userID         int64
	action         string
}

type membershipEvent struct {
	Type           string `json:"type"`
	ConversationID int64  `json:"conversationId"`
	UserID         int64  `json:"userId"`
	Action         string `json:"action"`
}

// ChatClient wraps a single WebSocket connection and bookkeeping that helps the
// hub keep track of which conversations this socket should hear about.
type ChatClient struct {
    hub             *ChatHub
    conn            *websocket.Conn
    send            chan []byte
    userID          int64
    subscriptions   map[int64]struct{}
    messageHistory  []time.Time
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
		membership:    make(chan membershipUpdate, 16),
		subscriptions: make(map[int64]map[*ChatClient]struct{}),
		clientsByUser: make(map[int64]map[*ChatClient]struct{}),
	}
}

// Run processes register/unregister/broadcast events on the hub.
func (h *ChatHub) Run() {
	for {
		select {
		case client := <-h.register:
			// A connection just completed the WS handshake: mirror the user's
			// conversation memberships into the hub's lookup table.
			for conversationID := range client.subscriptions {
				if _, ok := h.subscriptions[conversationID]; !ok {
					h.subscriptions[conversationID] = make(map[*ChatClient]struct{})
				}
				h.subscriptions[conversationID][client] = struct{}{}
			}
			h.attachClient(client)
		case client := <-h.unregister:
			// A connection has gone away: close it if needed and remove every
			// pointer to it so the GC can reclaim the client.
			if err := client.conn.Close(); err != nil {
				log.Printf("chat client close error: %v", err)
			}
			h.detachClient(client)
			for conversationID := range client.subscriptions {
                if subs, ok := h.subscriptions[conversationID]; ok {
                    delete(subs, client)
                    if len(subs) == 0 {
                        delete(h.subscriptions, conversationID)
                    }
                }
            }
		case msg := <-h.broadcast:
			// Persisted message payloads are fanned out to every subscribed client.
			h.pushToConversation(msg.conversationID, msg.payload)
		case update := <-h.membership:
			// HTTP handlers report membership churn through this channel so the hub
			// can update live sockets and emit `conversation:membership` events.
			h.applyMembershipUpdate(update)
		}
	}
}

func (h *ChatHub) attachClient(client *ChatClient) {
	if _, ok := h.clientsByUser[client.userID]; !ok {
		h.clientsByUser[client.userID] = make(map[*ChatClient]struct{})
	}
	h.clientsByUser[client.userID][client] = struct{}{}
}

func (h *ChatHub) detachClient(client *ChatClient) {
	if peers, ok := h.clientsByUser[client.userID]; ok {
		delete(peers, client)
		if len(peers) == 0 {
			delete(h.clientsByUser, client.userID)
		}
	}
}

func (h *ChatHub) pushToConversation(conversationID int64, payload []byte) {
	subs := h.subscriptions[conversationID]
	if subs == nil {
		return
	}
	for client := range subs {
		select {
		case client.send <- payload:
		default:
			close(client.send)
			delete(subs, client)
			h.detachClient(client)
		}
	}
	if len(subs) == 0 {
		delete(h.subscriptions, conversationID)
	}
}

func (h *ChatHub) applyMembershipUpdate(update membershipUpdate) {
	switch update.action {
	case "added":
		// Ensure the conversation has a subscriber set, then mirror the new
		// membership down to any sockets owned by the joining user.
		if _, ok := h.subscriptions[update.conversationID]; !ok {
			h.subscriptions[update.conversationID] = make(map[*ChatClient]struct{})
		}
		if clients, ok := h.clientsByUser[update.userID]; ok {
			for client := range clients {
                client.subscriptions[update.conversationID] = struct{}{}
                h.subscriptions[update.conversationID][client] = struct{}{}
            }
        }
	case "removed":
		// Remove the conversation from each socket owned by the departing user
		// and drop any room set that becomes empty.
		if clients, ok := h.clientsByUser[update.userID]; ok {
			if subs, ok := h.subscriptions[update.conversationID]; ok {
				for client := range clients {
					delete(client.subscriptions, update.conversationID)
					delete(subs, client)
                }
                if len(subs) == 0 {
                    delete(h.subscriptions, update.conversationID)
                }
            }
        }
	default:
		log.Printf("unknown membership action: %s", update.action)
		return
	}

	event := membershipEvent{
		Type:           "conversation:membership",
		ConversationID: update.conversationID,
		UserID:         update.userID,
		Action:         update.action,
	}
	payload, err := json.Marshal(event)
	if err != nil {
		log.Printf("marshal membership event failed: %v", err)
		return
	}
	h.pushToConversation(update.conversationID, payload)
}

func (h *ChatHub) NotifyMembership(conversationID, userID int64, action string) {
	update := membershipUpdate{
		conversationID: conversationID,
		userID:         userID,
		action:         action,
	}
	select {
	case h.membership <- update:
	default:
		go func() {
			h.membership <- update
		}()
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

	// Upgrade the HTTP request into a WebSocket connection. From here on the
	// client and server communicate using frames handled by read/write pumps.
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

	// Registration hands the client to the hub goroutine. From this point the
	// hub owns the lifecycle and the pumps keep the socket alive.
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

	// Loop forever until the client disconnects or an unrecoverable error occurs.
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

	// The writer listens on the buffered send channel and flushes frames back to
	// the mobile clients. The periodic ping keeps intermediaries from closing the
	// connection when idle.
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
	now := time.Now()
	if !c.allowMessage(now) {
		log.Printf("user %d exceeded message rate limit", c.userID)
		c.send <- []byte(`{"type":"system:error","code":"rate_limited"}`)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	// Authorize against the DB to ensure the sender is still a member. This keeps
	// the hub's in-memory view honest even if membership changes while the socket
	// was offline or before the hub processed a membership update.
	allowed, err := c.hub.repo.IsConversationMember(ctx, inbound.ConversationID, c.userID)
	if err != nil {
		log.Printf("membership check failed: %v", err)
		return
	}
    if !allowed {
        log.Printf("user %d attempted to send to conversation %d without membership", c.userID, inbound.ConversationID)
        return
    }

    params := CreateMessageParams{
        ConversationID: inbound.ConversationID,
        SenderID:       c.userID,
        Body:           inbound.Body,
        DeliveryStatus: "sent",
    }

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

// RegisterChatRoutes mounts all chat-related REST endpoints under the provided
// router group. The caller is expected to attach authentication middleware
// before invoking this so that handlers can read the session from context.
func RegisterChatRoutes(router *gin.RouterGroup, repo *EventRepository, hub *ChatHub) {
	handler := &ChatHTTPHandler{repo: repo, hub: hub}

	router.GET("/conversations", handler.listConversations)
	router.GET("/conversations/:id/messages", handler.listMessages)
	router.POST("/conversations", handler.createConversation)
	router.POST("/events/:id/chat/requests", handler.requestJoin)
	router.POST("/events/:id/chat/requests/:userId/approve", handler.approveJoin)
	router.POST("/events/:id/chat/requests/:userId/deny", handler.denyJoin)
	router.DELETE("/events/:id/chat/members/:userId", handler.removeMember)
}

type ChatHTTPHandler struct {
    repo *EventRepository
    hub  *ChatHub
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

type joinRequestResponse struct {
	Request ConversationJoinRequest `json:"request"`
}

// createConversation provisions a new conversation (optionally titled) and
// ensures the creator is a member. The request body accepts an optional title
// and a list of member IDs. The creator is automatically included if omitted.
//
// Responses:
//  - 201 with a hydrated ConversationSummary on success
//  - 401 if the caller has no session
//  - 400 for invalid JSON
//  - 500 for repository/database failures
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

	convo, err := h.repo.CreateConversation(ctx, payload.Title, claims.UserID, payload.MemberIDs, nil)
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

// listConversations returns all conversations visible to the current user,
// enriched with participants, last message preview, unread counts, and
// optional event metadata.
//
// Responses:
//  - 200 with a list of ConversationSummary items
//  - 401 if the caller has no session
//  - 500 for repository/database failures
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

// listMessages returns the most recent messages for a conversation the user
// can access. It validates membership, supports basic limit/offset paging, and
// advances the caller's read cursor to the newest returned message.
//
// Query params: `limit` (default 20), `offset` (default 0).
// Responses:
//  - 200 with a chronologically ordered message list
//  - 401 if the caller has no session
//  - 400 for invalid conversation id
//  - 403 if the user is not a member of the conversation
//  - 500 for repository/database failures
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

// requestJoin creates a pending request for the current user to join an event's
// group conversation. The event must exist and have a chat conversation. If the
// user is already a member or a request is pending, a conflict is returned.
//
// Responses:
//  - 201 with the created join request
//  - 401 if the caller has no session
//  - 400 for invalid event id
//  - 404 if the event or its conversation is missing
//  - 409 if a request already exists or the user is already a member
//  - 500 for repository/database failures
func (h *ChatHTTPHandler) requestJoin(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	eventIDParam := c.Param("id")
	eventID, err := strconv.ParseInt(eventIDParam, 10, 64)
	if err != nil || eventID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	req, err := h.repo.CreateJoinRequest(ctx, eventID, claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrEventNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		case errors.Is(err, ErrAlreadyConversationMember):
			c.JSON(http.StatusConflict, gin.H{"error": "already a member of this chat"})
		case errors.Is(err, ErrJoinRequestExists):
			c.JSON(http.StatusConflict, gin.H{"error": "a pending request already exists"})
		case errors.Is(err, ErrConversationNotFound):
			c.JSON(http.StatusInternalServerError, gin.H{"error": "chat conversation missing for event"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create join request"})
		}
		return
	}

	c.JSON(http.StatusCreated, joinRequestResponse{Request: *req})
}

// approveJoin allows the event host to approve a user's pending join request.
// On success, the user is added to the event's conversation and the hub is
// notified so any active sockets for that user start receiving events.
//
// Responses:
//  - 200 with the approved request and `conversationId`
//  - 401 if the caller has no session
//  - 400 for invalid path params
//  - 403 if the caller is not the event host
//  - 404 if the event or pending request is not found
//  - 409 if the user is already a member
//  - 500 for repository/database failures
func (h *ChatHTTPHandler) approveJoin(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	eventIDParam := c.Param("id")
	eventID, err := strconv.ParseInt(eventIDParam, 10, 64)
	if err != nil || eventID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	userIDParam := c.Param("userId")
	userID, err := strconv.ParseInt(userIDParam, 10, 64)
	if err != nil || userID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	req, err := h.repo.ApproveJoinRequest(ctx, eventID, userID, claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrEventNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		case errors.Is(err, ErrNotEventHost):
			c.JSON(http.StatusForbidden, gin.H{"error": "only the event host can approve requests"})
		case errors.Is(err, ErrJoinRequestNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "pending request not found"})
		case errors.Is(err, ErrAlreadyConversationMember):
			c.JSON(http.StatusConflict, gin.H{"error": "user already a member"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to approve join request"})
		}
		return
	}

	convo, err := h.repo.GetConversationByEventID(ctx, eventID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load conversation"})
		return
	}

	h.hub.NotifyMembership(convo.ID, userID, "added")

	c.JSON(http.StatusOK, gin.H{
		"request":        req,
		"conversationId": convo.ID,
	})
}

// denyJoin allows the event host to deny a user's pending join request.
// This does not alter conversation membership and simply records the denial.
//
// Responses:
//  - 200 with the updated (denied) request
//  - 401 if the caller has no session
//  - 400 for invalid path params
//  - 403 if the caller is not the event host
//  - 404 if the event or pending request is not found
//  - 500 for repository/database failures
func (h *ChatHTTPHandler) denyJoin(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	eventIDParam := c.Param("id")
	eventID, err := strconv.ParseInt(eventIDParam, 10, 64)
	if err != nil || eventID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	userIDParam := c.Param("userId")
	userID, err := strconv.ParseInt(userIDParam, 10, 64)
	if err != nil || userID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	req, err := h.repo.DenyJoinRequest(ctx, eventID, userID, claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrEventNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		case errors.Is(err, ErrNotEventHost):
			c.JSON(http.StatusForbidden, gin.H{"error": "only the event host can deny requests"})
		case errors.Is(err, ErrJoinRequestNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "pending request not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to deny join request"})
		}
		return
	}

	c.JSON(http.StatusOK, joinRequestResponse{Request: *req})
}

// removeMember removes a user from an event's group conversation. Only the
// event host can remove others; any user can remove themselves (leave). The
// hub is notified so live sockets stop receiving that conversation's events.
//
// Responses:
//  - 204 on success
//  - 401 if the caller has no session
//  - 400 for invalid path params or trying to remove the host
//  - 403 if not authorized to update membership
//  - 404 if the event or target membership is not found
//  - 500 for repository/database failures
func (h *ChatHTTPHandler) removeMember(c *gin.Context) {
	claims, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
		return
	}

	eventIDParam := c.Param("id")
	eventID, err := strconv.ParseInt(eventIDParam, 10, 64)
	if err != nil || eventID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return
	}

	userIDParam := c.Param("userId")
	userID, err := strconv.ParseInt(userIDParam, 10, 64)
	if err != nil || userID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	event, err := h.repo.GetEventByID(ctx, eventID)
	if err != nil {
		if errors.Is(err, ErrEventNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		return
	}

	if claims.UserID != event.UserID && claims.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to update membership"})
		return
	}

	if err := h.repo.RemoveEventMember(ctx, eventID, userID); err != nil {
		switch {
		case errors.Is(err, ErrCannotRemoveHost):
			c.JSON(http.StatusBadRequest, gin.H{"error": "event host cannot leave the event chat"})
		case errors.Is(err, ErrNotConversationMember):
			c.JSON(http.StatusNotFound, gin.H{"error": "user is not part of this chat"})
		case errors.Is(err, ErrEventNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update membership"})
		}
		return
	}

	convo, err := h.repo.GetConversationByEventID(ctx, eventID)
	if err == nil {
		h.hub.NotifyMembership(convo.ID, userID, "removed")
	}

	c.Status(http.StatusNoContent)
}
// containsInt64 reports whether target is present in values. Small helper used
// when constructing membership lists.
func containsInt64(values []int64, target int64) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}
