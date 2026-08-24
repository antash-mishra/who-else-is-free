package main

import (
	"context"
	"errors"
	"testing"
)

func seedNotificationActionEvent(t *testing.T, repo *EventRepository, ownerID int64, groupType string) int64 {
	t.Helper()
	result, err := repo.db.ExecContext(context.Background(), `
		INSERT INTO events (
			user_id, title, location, time, event_date, description, gender, min_age, max_age,
			date_label, group_type, cover_key
		) VALUES (?, 'Hike', 'Trail', '10:00', '2099-01-01', '', 'Everyone', 18, 99, 'Today', ?, 'sports-badminton-1');
	`, ownerID, groupType)
	if err != nil {
		t.Fatalf("insert event: %v", err)
	}
	eventID, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("event id: %v", err)
	}
	return eventID
}

func seedNotificationActionUser(t *testing.T, repo *EventRepository, name string) int64 {
	t.Helper()
	user, err := repo.CreateUserWithPassword(context.Background(), name, name+"@notification-actions.test", "pw")
	if err != nil {
		t.Fatalf("create user %s: %v", name, err)
	}
	return user.ID
}

func seedNotificationActionConversation(
	t *testing.T,
	repo *EventRepository,
	eventID, ownerID int64,
	members ...int64,
) int64 {
	t.Helper()
	title := "Hike"
	conversation, err := repo.CreateConversation(context.Background(), &title, ownerID, members, &eventID)
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	return conversation.ID
}

func TestResolveNotificationAction_ActiveChatMarksOwnedRowHandled(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	memberID := seedNotificationActionUser(t, repo, "member")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID, memberID)
	notification, err := repo.CreateNotification(ctx, Notification{
		UserID: memberID, Type: NotificationTypeChatMessage, EventID: &eventID,
		ConversationID: &conversationID, Title: "Hike", Body: "Host: hello",
	})
	if err != nil {
		t.Fatalf("create notification: %v", err)
	}

	resolution, err := repo.ResolveNotificationAction(ctx, memberID, NotificationActionResolveInput{
		NotificationIDs: []int64{notification.ID}, MarkHandled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Status != NotificationActionActive || resolution.Destination != NotificationDestinationChat {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.ConversationID == nil || *resolution.ConversationID != conversationID {
		t.Fatalf("conversation = %v, want %d", resolution.ConversationID, conversationID)
	}
	rows, err := repo.ListNotifications(ctx, memberID, 20, 0)
	if err != nil || len(rows) != 1 || !rows[0].Read {
		t.Fatalf("handled rows = %+v err=%v", rows, err)
	}
}

func TestResolveNotificationAction_RejectsCrossOwnerAndMixedGroups(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	otherID := seedNotificationActionUser(t, repo, "other")
	one := int64(10)
	two := int64(20)
	first, _ := repo.CreateNotification(ctx, Notification{
		UserID: 1, Type: NotificationTypeChatMessage, ConversationID: &one, Title: "One", Body: "B",
	})
	second, _ := repo.CreateNotification(ctx, Notification{
		UserID: 1, Type: NotificationTypeChatMessage, ConversationID: &two, Title: "Two", Body: "B",
	})

	_, err := repo.ResolveNotificationAction(ctx, otherID, NotificationActionResolveInput{NotificationIDs: []int64{first.ID}})
	if !errors.Is(err, ErrNotificationActionNotFound) {
		t.Fatalf("cross-owner err = %v", err)
	}
	_, err = repo.ResolveNotificationAction(ctx, 1, NotificationActionResolveInput{
		NotificationIDs: []int64{first.ID, second.ID},
	})
	if !errors.Is(err, ErrNotificationActionInvalid) {
		t.Fatalf("mixed-group err = %v", err)
	}
}

func TestResolveNotificationAction_DeletedEventIsUnavailableAndRead(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	notification, err := repo.CreateNotification(ctx, Notification{
		UserID: hostID, Type: NotificationTypeJoinRequestCreated, EventID: &eventID,
		Title: "Hike", Body: "Alice wants to join your event",
	})
	if err != nil {
		t.Fatalf("create notification: %v", err)
	}
	if err := repo.Delete(ctx, eventID, hostID); err != nil {
		t.Fatalf("delete event: %v", err)
	}

	resolution, err := repo.ResolveNotificationAction(ctx, hostID, NotificationActionResolveInput{
		NotificationIDs: []int64{notification.ID}, MarkHandled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Status != NotificationActionUnavailable || resolution.Reason == nil || *resolution.Reason != NotificationReasonEventDeleted {
		t.Fatalf("resolution = %+v", resolution)
	}
	rows, _ := repo.ListNotifications(ctx, hostID, 20, 0)
	if len(rows) != 1 || !rows[0].Read || rows[0].ActionState != NotificationActionUnavailable {
		t.Fatalf("persisted rows = %+v", rows)
	}
	count, _ := repo.CountUnreadNotifications(ctx, hostID)
	if count != 0 {
		t.Fatalf("unread count = %d", count)
	}
}

func TestResolveNotificationAction_MixedJoinGroupKeepsPendingDestination(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	firstRequesterID := seedNotificationActionUser(t, repo, "first")
	secondRequesterID := seedNotificationActionUser(t, repo, "second")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID)
	firstRequest, err := repo.CreateJoinRequest(ctx, eventID, firstRequesterID, "first")
	if err != nil {
		t.Fatalf("first request: %v", err)
	}
	firstNotification, _ := repo.CreateNotification(ctx, Notification{
		UserID: hostID, Type: NotificationTypeJoinRequestCreated, EventID: &eventID,
		ConversationID: &conversationID, JoinRequestID: &firstRequest.ID, Title: "Hike", Body: "First wants to join your event",
	})
	if _, err := repo.DenyJoinRequest(ctx, eventID, firstRequesterID, hostID); err != nil {
		t.Fatalf("deny first: %v", err)
	}
	secondRequest, err := repo.CreateJoinRequest(ctx, eventID, secondRequesterID, "second")
	if err != nil {
		t.Fatalf("second request: %v", err)
	}
	secondNotification, _ := repo.CreateNotification(ctx, Notification{
		UserID: hostID, Type: NotificationTypeJoinRequestCreated, EventID: &eventID,
		ConversationID: &conversationID, JoinRequestID: &secondRequest.ID, Title: "Hike", Body: "Second wants to join your event",
	})

	resolution, err := repo.ResolveNotificationAction(ctx, hostID, NotificationActionResolveInput{
		NotificationIDs: []int64{firstNotification.ID, secondNotification.ID}, MarkHandled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Status != NotificationActionActive || resolution.Destination != NotificationDestinationJoinRequests {
		t.Fatalf("resolution = %+v", resolution)
	}
}

func TestResolveNotificationAction_SinglePendingRequestOpensRequest(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	requesterID := seedNotificationActionUser(t, repo, "single-pending")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Single")
	request, err := repo.CreateJoinRequest(ctx, eventID, requesterID, "hello")
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	notification, err := repo.CreateNotification(ctx, Notification{
		UserID: hostID, Type: NotificationTypeJoinRequestCreated, EventID: &eventID,
		JoinRequestID: &request.ID, Title: "Hike", Body: "Requester wants to join your event",
	})
	if err != nil {
		t.Fatalf("create notification: %v", err)
	}

	resolution, err := repo.ResolveNotificationAction(ctx, hostID, NotificationActionResolveInput{
		NotificationIDs: []int64{notification.ID}, MarkHandled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Status != NotificationActionActive || resolution.Destination != NotificationDestinationJoinRequests {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.EventID == nil || *resolution.EventID != eventID {
		t.Fatalf("event = %v, want %d", resolution.EventID, eventID)
	}
}

func TestResolveNotificationAction_ApprovalUsesValidatedReplacementConversation(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	memberID := seedNotificationActionUser(t, repo, "replacement")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Single")
	oldConversationID := seedNotificationActionConversation(t, repo, eventID, hostID, memberID)
	notification, _ := repo.CreateNotification(ctx, Notification{
		UserID: memberID, Type: NotificationTypeJoinRequestApproved, EventID: &eventID,
		ConversationID: &oldConversationID, Title: "Hike", Body: "Approved",
	})
	if _, err := repo.db.ExecContext(ctx, `DELETE FROM conversations WHERE id = ?;`, oldConversationID); err != nil {
		t.Fatalf("delete old conversation: %v", err)
	}
	replacementID := seedNotificationActionConversation(t, repo, eventID, hostID, memberID)

	resolution, err := repo.ResolveNotificationAction(ctx, memberID, NotificationActionResolveInput{
		NotificationIDs: []int64{notification.ID}, MarkHandled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Destination != NotificationDestinationChat || resolution.ConversationID == nil || *resolution.ConversationID != replacementID {
		t.Fatalf("resolution = %+v, replacement=%d", resolution, replacementID)
	}
}

func TestResolveNotificationAction_InactiveChatNeverReactivates(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	memberID := seedNotificationActionUser(t, repo, "inactive-chat")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID, memberID)
	reason := NotificationReasonAccessRemoved
	notification, err := repo.CreateNotification(ctx, Notification{
		UserID: memberID, Type: NotificationTypeChatMessage, EventID: &eventID,
		ConversationID: &conversationID, Title: "Hike", Body: "Host: old message",
		ActionState: NotificationActionUnavailable, ActionReason: &reason,
	})
	if err != nil {
		t.Fatalf("create inactive notification: %v", err)
	}

	resolution, err := repo.ResolveNotificationAction(ctx, memberID, NotificationActionResolveInput{
		NotificationIDs: []int64{notification.ID}, MarkHandled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Status != NotificationActionUnavailable || resolution.Destination != NotificationDestinationEvents {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.Reason == nil || *resolution.Reason != NotificationReasonAccessRemoved {
		t.Fatalf("reason = %v", resolution.Reason)
	}
}

func TestResolveNotificationAction_PreservesResolvedRequestReason(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	requesterID := seedNotificationActionUser(t, repo, "resolved-request")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Single")
	request, err := repo.CreateJoinRequest(ctx, eventID, requesterID, "hello")
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	reason := NotificationReasonRequestDenied
	notification, err := repo.CreateNotification(ctx, Notification{
		UserID: hostID, Type: NotificationTypeJoinRequestCreated, EventID: &eventID,
		JoinRequestID: &request.ID, Title: "Hike", Body: "Requester wants to join",
		ActionState: NotificationActionResolved, ActionReason: &reason,
	})
	if err != nil {
		t.Fatalf("create resolved notification: %v", err)
	}

	resolution, err := repo.ResolveNotificationAction(ctx, hostID, NotificationActionResolveInput{
		NotificationIDs: []int64{notification.ID}, MarkHandled: true,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Status != NotificationActionResolved || resolution.Destination != NotificationDestinationEventDetails {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.Reason == nil || *resolution.Reason != NotificationReasonRequestDenied {
		t.Fatalf("reason = %v", resolution.Reason)
	}
}

func TestResolveNotificationAction_IDLessHintNeverBypassesMembership(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	outsiderID := seedNotificationActionUser(t, repo, "outsider")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID)

	resolution, err := repo.ResolveNotificationAction(ctx, outsiderID, NotificationActionResolveInput{
		Type: NotificationTypeChatMessage, ConversationID: &conversationID,
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolution.Status != NotificationActionUnavailable || resolution.Reason == nil || *resolution.Reason != NotificationReasonAccessRemoved {
		t.Fatalf("resolution = %+v", resolution)
	}
}

func TestResolveNotificationAction_IDLessChatRejectsMismatchedEventHint(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	memberID := seedNotificationActionUser(t, repo, "hint-member")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	otherEventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID, memberID)

	_, err := repo.ResolveNotificationAction(ctx, memberID, NotificationActionResolveInput{
		Type: NotificationTypeChatMessage, EventID: &otherEventID, ConversationID: &conversationID,
	})
	if !errors.Is(err, ErrNotificationActionInvalid) {
		t.Fatalf("mismatched event hint err = %v", err)
	}
}

func TestRemoveEventMemberEagerlyInvalidatesMemberActions(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	memberID := seedNotificationActionUser(t, repo, "removed")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID, memberID)
	_, _ = repo.CreateNotification(ctx, Notification{
		UserID: memberID, Type: NotificationTypeChatMessage, EventID: &eventID,
		ConversationID: &conversationID, Title: "Hike", Body: "Host: hello",
	})

	if err := repo.RemoveEventMemberWithReason(ctx, eventID, memberID, NotificationReasonAccessRemoved); err != nil {
		t.Fatalf("remove member: %v", err)
	}
	rows, _ := repo.ListNotifications(ctx, memberID, 20, 0)
	if len(rows) != 1 || rows[0].ActionState != NotificationActionUnavailable || !rows[0].Read {
		t.Fatalf("rows = %+v", rows)
	}
	if rows[0].ActionReason == nil || *rows[0].ActionReason != NotificationReasonAccessRemoved {
		t.Fatalf("reason = %v", rows[0].ActionReason)
	}
}

func TestDeleteUserAccountResolvesStableRequesterTask(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	requesterID := seedNotificationActionUser(t, repo, "deleted-requester")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	seedNotificationActionConversation(t, repo, eventID, hostID)
	request, err := repo.CreateJoinRequest(ctx, eventID, requesterID, "hello")
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	_, _ = repo.CreateNotification(ctx, Notification{
		UserID: hostID, Type: NotificationTypeJoinRequestCreated, EventID: &eventID,
		JoinRequestID: &request.ID, Title: "Hike", Body: "Requester wants to join your event",
	})

	if _, err := repo.DeleteUserAccount(ctx, requesterID); err != nil {
		t.Fatalf("delete requester: %v", err)
	}
	rows, _ := repo.ListNotifications(ctx, hostID, 20, 0)
	if len(rows) != 1 || rows[0].ActionState != NotificationActionResolved || !rows[0].Read {
		t.Fatalf("host rows = %+v", rows)
	}
	if rows[0].ActionReason == nil || *rows[0].ActionReason != NotificationReasonRequesterDeleted {
		t.Fatalf("reason = %v", rows[0].ActionReason)
	}
}

func TestEventGroupTypeChangeInvalidatesExactChatTasks(t *testing.T) {
	repo := newNotificationsTestRepo(t)
	ctx := context.Background()
	hostID := int64(1)
	memberID := seedNotificationActionUser(t, repo, "topology-member")
	eventID := seedNotificationActionEvent(t, repo, hostID, "Group")
	conversationID := seedNotificationActionConversation(t, repo, eventID, hostID, memberID)
	_, _ = repo.CreateNotification(ctx, Notification{
		UserID: memberID, Type: NotificationTypeChatMessage, EventID: &eventID,
		ConversationID: &conversationID, Title: "Hike", Body: "Host: hello",
	})

	_, err := repo.Update(ctx, eventID, hostID, UpdateEventParams{
		Title: "Hike", Location: "Trail", Time: "10:00", EventDate: "2099-01-01",
		Description: "", Gender: "Everyone", MinAge: 18, MaxAge: 99,
		DateLabel: "Today", GroupType: "Single", ScheduledAt: "",
	})
	if err != nil {
		t.Fatalf("change group type: %v", err)
	}
	rows, _ := repo.ListNotifications(ctx, memberID, 20, 0)
	if len(rows) != 1 || rows[0].ActionState != NotificationActionUnavailable || !rows[0].Read {
		t.Fatalf("rows = %+v", rows)
	}
	if rows[0].ActionReason == nil || *rows[0].ActionReason != NotificationReasonConversationReplaced {
		t.Fatalf("reason = %v", rows[0].ActionReason)
	}
}
