function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  demoMode: String(import.meta.env.VITE_DEMO_MODE).toLowerCase() === "true",
  // Accept either a bare hostname (e.g. from the `cognito_domain` terraform output) or a
  // full URL (e.g. copy-pasted with an "https://" prefix) - callers always prepend "https://"
  // themselves, so a doubled scheme here would silently break every token request.
  cognitoDomain: stripScheme(import.meta.env.VITE_COGNITO_DOMAIN ?? ""),
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "",
  cognitoRedirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI ?? "",
  cognitoLogoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI ?? "",
  cognitoApiScopes: import.meta.env.VITE_COGNITO_API_SCOPES ?? "",
  demoRoles: (import.meta.env.VITE_DEMO_ROLES ?? "Administrator,Manager,TA,Panel")
    .split(",")
    .map((x: string) => x.trim())
    .filter(Boolean),
};
