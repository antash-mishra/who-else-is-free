import React from "react";
import { render, screen } from "@testing-library/react-native";

import UserAvatar from "../UserAvatar";

describe("UserAvatar", () => {
  it("renders fallback initials when no avatar is available", () => {
    render(<UserAvatar name="Ada Lovelace" testID="user-avatar" />);

    expect(screen.getByTestId("user-avatar")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
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
