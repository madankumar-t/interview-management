export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  demoMode: String(import.meta.env.VITE_DEMO_MODE).toLowerCase() === "true",
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN ?? "",
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "",
  cognitoRedirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI ?? "",
  cognitoLogoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI ?? "",
  cognitoApiScopes: import.meta.env.VITE_COGNITO_API_SCOPES ?? "",
  demoRoles: (import.meta.env.VITE_DEMO_ROLES ?? "Administrator,Manager,TA,Panel")
    .split(",")
    .map((x: string) => x.trim())
    .filter(Boolean),
};
