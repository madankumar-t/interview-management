import { afterEach, describe, expect, it, vi } from "vitest";

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

import { getSession, handleAuthCallback, passwordResetUrl } from "./auth";

function token(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims))}.signature`;
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("login identity", () => {
  it("uses ID-token name and email when completing login", async () => {
    sessionStorage.setItem("ims-pkce-verifier", "verifier");
    window.history.replaceState({}, "", "/auth/callback?code=example");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: token({ sub: "panel-sub", "cognito:groups": ["Panel"] }),
        id_token: token({ email: "panel@example.com", name: "Panel Member" }),
      }),
    }));

    const session = await handleAuthCallback();

    expect(session?.name).toBe("Panel Member");
    expect(session?.email).toBe("panel@example.com");
    expect(session?.groups).toEqual(["Panel"]);
  });

  it("recovers the username of an existing session without an email claim", () => {
    localStorage.setItem("ims-session", JSON.stringify({
      sub: "panel-sub", email: "", groups: ["Panel"], accessToken: token({ username: "panel@example.com" }),
    }));

    expect(getSession()?.email).toBe("panel@example.com");
  });
});

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
