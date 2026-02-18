import { handleNotificationTap, PushData } from "../pushRouting";

describe("pushRouting", () => {
  const createNavigator = (isReady = true) => ({
    isReady: jest.fn(() => isReady),
    navigate: jest.fn(),
  });

  it("routes event.deleted taps to Events tab", () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();
    const data: PushData = { type: "event.deleted", eventId: "123" };

    handleNotificationTap(data, setActiveConversation, navigator);

    expect(setActiveConversation).not.toHaveBeenCalled();
    expect(navigator.navigate).toHaveBeenCalledWith("Main", {
      screen: "Events",
    });
  });

  it("routes event.member_removed taps to Events tab", () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();
    const data: PushData = { type: "event.member_removed", eventId: "123" };

    handleNotificationTap(data, setActiveConversation, navigator);

    expect(setActiveConversation).not.toHaveBeenCalled();
    expect(navigator.navigate).toHaveBeenCalledWith("Main", {
      screen: "Events",
    });
  });

  it("routes event_deleted taps to Events tab", () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();
    const data: PushData = { type: "event_deleted", eventId: "123" };

    handleNotificationTap(data, setActiveConversation, navigator);

    expect(setActiveConversation).not.toHaveBeenCalled();
    expect(navigator.navigate).toHaveBeenCalledWith("Main", {
      screen: "Events",
    });
  });

  it("routes mixed-case event.deleted taps to Events tab", () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();
    const data: PushData = { type: " Event.Deleted ", eventId: "123" };

    handleNotificationTap(data, setActiveConversation, navigator);

    expect(setActiveConversation).not.toHaveBeenCalled();
    expect(navigator.navigate).toHaveBeenCalledWith("Main", {
      screen: "Events",
    });
  });

  it("keeps existing join_request.denied routing intact", () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();
    const data: PushData = { type: "join_request.denied" };

    handleNotificationTap(data, setActiveConversation, navigator);

    expect(navigator.navigate).toHaveBeenCalledWith("Main", {
      screen: "Messages",
    });
  });

  it("does not navigate when navigation is not ready", () => {
    const navigator = createNavigator(false);
    const setActiveConversation = jest.fn();
    const data: PushData = { type: "event.deleted", eventId: "123" };

    handleNotificationTap(data, setActiveConversation, navigator);

    expect(navigator.navigate).not.toHaveBeenCalled();
    expect(setActiveConversation).not.toHaveBeenCalled();
  });
});
