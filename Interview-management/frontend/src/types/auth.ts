export type Role = "Administrator" | "Manager" | "TA" | "Panel";

export interface UserSession {
  sub: string;
  email: string;
  groups: Role[];
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

