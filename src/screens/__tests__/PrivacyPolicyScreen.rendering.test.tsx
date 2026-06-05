import { fireEvent, render } from "@testing-library/react-native";

import PrivacyPolicyScreen from "@screens/PrivacyPolicyScreen";
import { mockNavigation } from "../../__tests__/mocks/mockModules";

describe("PrivacyPolicyScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the privacy policy content from the markdown source", () => {
    const { getAllByText, getByLabelText, getByText } = render(<PrivacyPolicyScreen />);

    expect(getByText("Help")).toBeTruthy();
    expect(getByText("WEIF PRIVACY POLICY")).toBeTruthy();
    expect(getByText("Last updated June 15, 2026")).toBeTruthy();
    expect(getByText("TABLE OF CONTENTS")).toBeTruthy();
    expect(getAllByText("WHAT INFORMATION DO WE COLLECT?").length).toBeGreaterThanOrEqual(1);
    expect(getByText("Google API Services User Data Policy")).toBeTruthy();
    expect(getAllByText("xyz@weif.com").length).toBeGreaterThanOrEqual(1);

    fireEvent.press(getByLabelText("Jump to WHAT INFORMATION DO WE COLLECT?"));

    fireEvent.press(getByLabelText("Go back"));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
