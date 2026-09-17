import type { Role, UserSession } from "../types/auth";

export function hasAnyRole(session: Pick<UserSession, "groups">, roles: Role[]): boolean {
  return roles.some((role) => session.groups.includes(role));
}

export const ROLE_HOME: Record<Role, string> = {
  Administrator: "/",
  Manager: "/",
  TA: "/calendar",
  Panel: "/calendar",
};
