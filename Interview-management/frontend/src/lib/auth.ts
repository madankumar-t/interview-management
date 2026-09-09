import { config } from "./config";
import type { UserSession } from "../types/auth";

const SESSION_KEY = "ims-session";
const PKCE_KEY = "ims-pkce-verifier";

function parseJwt(token: string): Record<string, unknown> {
  const base = token.split(".")[1];
  if (!base) {
    return {};
  }
  return JSON.parse(atob(base));
}

export function getSession(): UserSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as UserSession;
}

export function setSession(session: UserSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function login(): void {
  if (config.demoMode) {
    setSession({
      sub: "demo-admin-1",
      email: "demo.admin@example.com",
      groups: config.demoRoles as UserSession["groups"],
      accessToken: "demo-token",
    });
    return;
  }
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  sessionStorage.setItem(PKCE_KEY, verifier);
  const challengePromise = crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then((buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  );
  challengePromise.then((challenge) => {
    const authorizeUrl = new URL(`https://${config.cognitoDomain}/oauth2/authorize`);
    authorizeUrl.searchParams.set("client_id", config.cognitoClientId);
    authorizeUrl.searchParams.set("response_type", "code");
    const extraScopes = config.cognitoApiScopes ? ` ${config.cognitoApiScopes}` : "";
    authorizeUrl.searchParams.set("scope", `openid email profile${extraScopes}`.trim());
    authorizeUrl.searchParams.set("redirect_uri", config.cognitoRedirectUri);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("code_challenge", challenge);
    window.location.assign(authorizeUrl.toString());
  });
}

export async function handleAuthCallback(): Promise<UserSession | null> {
  if (config.demoMode) {
    return getSession();
  }
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) {
    return null;
  }
  const verifier = sessionStorage.getItem(PKCE_KEY);
  if (!verifier) {
    return null;
  }
  const tokenResponse = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.cognitoClientId,
      code,
      redirect_uri: config.cognitoRedirectUri,
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) {
    return null;
  }
  const tokenJson = (await tokenResponse.json()) as { access_token: string };
  const accessToken = tokenJson.access_token;
  const claims = parseJwt(accessToken);
  const rawGroups = claims["cognito:groups"];
  const groups = (Array.isArray(rawGroups) ? rawGroups : []) as UserSession["groups"];
  const session: UserSession = {
    sub: String(claims.sub ?? ""),
    email: String(claims.email ?? ""),
    groups,
    accessToken,
  };
  setSession(session);
  window.history.replaceState({}, "", "/");
  return session;
}

export function logout(): void {
  clearSession();
  if (!config.demoMode && config.cognitoDomain && config.cognitoClientId && config.cognitoLogoutUri) {
    const logoutUrl = new URL(`https://${config.cognitoDomain}/logout`);
    logoutUrl.searchParams.set("client_id", config.cognitoClientId);
    logoutUrl.searchParams.set("logout_uri", config.cognitoLogoutUri);
    window.location.assign(logoutUrl.toString());
  }
}
