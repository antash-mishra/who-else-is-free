import { fireEvent, render } from "@testing-library/react-native";

import HelpScreen from "@screens/HelpScreen";
import { mockNavigation } from "../../__tests__/mocks/mockModules";

describe("HelpScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the help menu", () => {
    const { getByText } = render(<HelpScreen />);

    expect(getByText("Help")).toBeTruthy();
    expect(getByText("Contact us")).toBeTruthy();
    expect(getByText("FAQ")).toBeTruthy();
    expect(getByText("Feedback")).toBeTruthy();
  });

  it("opens the contact screen", () => {
    const { getByText } = render(<HelpScreen />);

    fireEvent.press(getByText("Contact us"));

    expect(mockNavigation.navigate).toHaveBeenCalledWith("HelpContact");
  });

  it("opens the FAQ screen", () => {
    const { getByText } = render(<HelpScreen />);

    fireEvent.press(getByText("FAQ"));

    expect(mockNavigation.navigate).toHaveBeenCalledWith("HelpFAQ");
  });

  it("opens the feedback screen", () => {
    const { getByText } = render(<HelpScreen />);

    fireEvent.press(getByText("Feedback"));

    expect(mockNavigation.navigate).toHaveBeenCalledWith("HelpFeedback");
  });

  it("goes back from the header button", () => {
    const { getByLabelText } = render(<HelpScreen />);

    fireEvent.press(getByLabelText("Go back"));

    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
