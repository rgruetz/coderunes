import type { Session } from "./session.js";

export async function requireAuth(
  req: { session?: Session },
  next: () => Promise<void>,
): Promise<void> {
  if (!req.session) throw new Error("unauth");
  await next();
}

export default function noop(): void {}
