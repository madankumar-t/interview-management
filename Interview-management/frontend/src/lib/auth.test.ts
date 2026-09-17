import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  config: {
    demoMode: false,
    cognitoDomain: "example.auth.us-east-2.amazoncognito.com",
    cognitoClientId: "client-id",
    cognitoRedirectUri: "https://app.example.com/auth/callback",
    cognitoLogoutUri: "https://app.example.com",
    cognitoApiScopes: "api/read api/write",
  },
}));

import { passwordResetUrl } from "./auth";

describe("passwordResetUrl", () => {
  it("builds the Cognito hosted forgot-password URL", () => {
    const url = new URL(passwordResetUrl());

    expect(url.origin).toBe("https://example.auth.us-east-2.amazoncognito.com");
    expect(url.pathname).toBe("/forgotPassword");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/auth/callback");
    expect(url.searchParams.get("scope")).toContain("api/read");
  });
});
