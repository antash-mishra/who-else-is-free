export type PushData = {
  type?: string;
  conversationId?: string;
  eventId?: string;
  title?: string;
  body?: string;
  senderName?: string;
  senderId?: string;
};

type PushNavigator = {
  isReady: () => boolean;
  navigate: (routeName: string, params?: unknown) => void;
};

export const handleNotificationTap = (
  data: PushData,
  setActiveConversation: (id: number | null) => void,
  navigator: PushNavigator,
) => {
  if (!navigator.isReady()) {
    return;
  }

  const normalizedType = (data.type ?? "").trim().toLowerCase();

  switch (normalizedType) {
    case "chat.message": {
      const conversationId = data.conversationId
        ? Number(data.conversationId)
        : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        navigator.navigate("ChatThread");
      }
      break;
    }
    case "join_request.created": {
      const conversationId = data.conversationId
        ? Number(data.conversationId)
        : undefined;
      const eventId = data.eventId ? Number(data.eventId) : undefined;
      const title = data.title ?? "";
      if (conversationId && eventId) {
        navigator.navigate("JoinRequests", {
          conversationId,
          eventId,
          title,
        });
      } else if (eventId) {
        navigator.navigate("EventDetails", {
          eventId: String(eventId),
          origin: "MyEvents",
        });
      }
      break;
    }
    case "join_request.approved": {
      const conversationId = data.conversationId
        ? Number(data.conversationId)
        : null;
      if (conversationId) {
        setActiveConversation(conversationId);
        navigator.navigate("ChatThread");
      }
      break;
    }
    case "join_request.denied": {
      navigator.navigate("Main", {
        screen: "Messages",
      });
      break;
    }
    case "event.deleted":
    case "event_deleted":
    case "event.member_removed":
    case "event.member.removed": {
      navigator.navigate("Main", {
        screen: "Events",
      });
      break;
    }
  }
};
