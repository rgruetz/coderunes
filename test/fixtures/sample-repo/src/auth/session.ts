/**
 * Session creation and persistence.
 * @module auth/session
 */

export interface SessionOptions {
  ttlSeconds: number;
  rolling?: boolean;
}

export interface Session {
  id: string;
  userId: string;
}

export function createSession(userId: string, opts?: SessionOptions): Session {
  return { id: "abc", userId };
}

export class SessionStore {
  private map = new Map<string, Session>();

  get(id: string): Session | undefined {
    return this.map.get(id);
  }

  put(s: Session): void {
    this.map.set(s.id, s);
  }
}

export type SessionId = string;

const internal = "private";
function helper() {
  return internal;
}
helper();
