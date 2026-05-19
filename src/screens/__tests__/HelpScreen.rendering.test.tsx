import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import HelpScreen from "@screens/HelpScreen";
import { mockNavigation } from "../../__tests__/mocks/mockModules";

const mockAuthFetch = jest.fn();

jest.mock("@context/AuthContext", () => ({
  useAuth: () => ({
    authFetch: mockAuthFetch,
  }),
}));

jest.spyOn(Alert, "alert");

describe("HelpScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue({}),
    });
  });

  it("renders Contact us by default", () => {
    const { getByLabelText, getByText, queryByLabelText } =
      render(<HelpScreen />);

    expect(getByText("Help")).toBeTruthy();
    expect(getByText("Need help or something not working?")).toBeTruthy();
    expect(getByLabelText("Help message")).toBeTruthy();
    expect(queryByLabelText("Reply email address")).toBeNull();
  });

  it("renders the FAQ tab when selected", () => {
    const { getByText, queryByText } = render(<HelpScreen />);

    fireEvent.press(getByText("FAQ"));

    expect(getByText("Help")).toBeTruthy();
    expect(getByText("What is WEIF?")).toBeTruthy();
    expect(getByText("What kind of plans can I post?")).toBeTruthy();
    expect(getByText("When can I post plans?")).toBeTruthy();
    expect(getByText("Can I join 1:1 or group plans?")).toBeTruthy();
    expect(getByText("How does chat work?")).toBeTruthy();
    expect(getByText("What happens after I join a plan?")).toBeTruthy();
    expect(getByText("Why don’t I see many events?")).toBeTruthy();
    expect(getByText("Is WEIF safe?")).toBeTruthy();
    expect(getByText("How do I report someone?")).toBeTruthy();
    expect(getByText("What if no one joins my plan?")).toBeTruthy();
    expect(getByText("How do I contact support?")).toBeTruthy();
    expect(
      queryByText(
        "WEIF (Who Else Is Free) helps you find people to do spontaneous plans with - like coffee, gigs, walks, drinks, cinema, or anything last-minute.",
      ),
    ).toBeNull();
  });

  it("expands FAQ answers as an accordion", () => {
    const { getByText, queryByText } = render(<HelpScreen />);

    fireEvent.press(getByText("FAQ"));
    fireEvent.press(getByText("What is WEIF?"));

    expect(
      getByText(
        "WEIF (Who Else Is Free) helps you find people to do spontaneous plans with - like coffee, gigs, walks, drinks, cinema, or anything last-minute.",
      ),
    ).toBeTruthy();

    fireEvent.press(getByText("What kind of plans can I post?"));

    expect(
      queryByText(
        "WEIF (Who Else Is Free) helps you find people to do spontaneous plans with - like coffee, gigs, walks, drinks, cinema, or anything last-minute.",
      ),
    ).toBeNull();
    expect(
      getByText(
        "Anything social or activity-based. If it’s something you can do with others, you can post it, for example:",
      ),
    ).toBeTruthy();
    expect(getByText("Coffee or food")).toBeTruthy();
    expect(getByText("Classes or activities")).toBeTruthy();
  });

  it("switches to contact us and submits the form", async () => {
    const { getAllByText, getByLabelText, getByText, queryByLabelText } =
      render(<HelpScreen />);

    expect(queryByLabelText("Reply email address")).toBeNull();
    fireEvent.changeText(
      getByLabelText("Help message"),
      "I need help with my account.",
    );
    fireEvent.press(getAllByText("Urgent safety issue")[1]);
    fireEvent.press(getByText("I want a reply"));
    expect(getByLabelText("Reply email address")).toBeTruthy();
    fireEvent.changeText(getByLabelText("Reply email address"), "me@example.com");
    fireEvent.press(getByText("Send"));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/help-submissions"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            type: "contact",
            message: "I need help with my account.",
            urgent_safety_issue: true,
            wants_reply: true,
            reply_email: "me@example.com",
          }),
        }),
      );
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Message sent",
      "Thanks. We will get back to you as soon as we can.",
    );
  });

  it("switches to feedback and submits the form", async () => {
    const { getByLabelText, getByText } = render(<HelpScreen />);

    fireEvent.press(getByText("Feedback"));
    expect(getByText("Got ideas or thoughts?")).toBeTruthy();
    expect(getByText("Ideas for new features")).toBeTruthy();

    fireEvent.changeText(getByLabelText("Help message"), "Add calendar sync.");
    fireEvent.press(getByText("Send feedback"));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/help-submissions"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            type: "feedback",
            message: "Add calendar sync.",
          }),
        }),
      );
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Feedback sent",
      "Thanks for helping us improve Who else is free.",
    );
  });

  it("goes back from the header button", () => {
    const { getByLabelText } = render(<HelpScreen />);

    fireEvent.press(getByLabelText("Go back"));

    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
