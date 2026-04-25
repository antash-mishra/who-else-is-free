import React from "react";
import { render, screen } from "@testing-library/react-native";

import UserAvatar from "../UserAvatar";

describe("UserAvatar", () => {
  it("renders fallback initials when no avatar is available", () => {
    render(<UserAvatar name="Ada Lovelace" testID="user-avatar" />);

    expect(screen.getByTestId("user-avatar")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("uses centered fallback text styles for letter avatars", () => {
    render(<UserAvatar name="Ada Lovelace" />);

    const initials = screen.getByText("A");
    const style = Array.isArray(initials.props.style)
      ? Object.assign({}, ...initials.props.style)
      : initials.props.style;

    expect(style.textAlign).toBe("center");
    expect(style.textAlignVertical).toBe("center");
  });

  it("supports multi-letter initials when requested", () => {
    render(<UserAvatar name="Ada Lovelace" maxInitials={2} />);

    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("hides fallback initials when an avatar is provided", () => {
    render(
      <UserAvatar
        avatar="https://example.com/avatar.png"
        name="Ada Lovelace"
        testID="user-avatar"
      />,
    );

    expect(screen.getByTestId("user-avatar")).toBeTruthy();
    expect(screen.queryByText("A")).toBeNull();
  });
});
