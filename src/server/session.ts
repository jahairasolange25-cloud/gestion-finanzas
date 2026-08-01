import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Db } from "./db";
import { sessions, users } from "./db/schema";
import type { Session, User } from "./db/schema";
import {
  MAX_SESSIONS_PER_USER,
  SESSION_COOKIE,
  SESSION_REFRESH_MS,
  SESSION_TTL_MS,
  createSessionToken,
  sha256,
} from "./auth";

export type AuthContext = { user: User; session: Session };

/** Resuelve la sesión a partir de la cookie; valida y renueva si falta poco. */
export async function getSession(
  db: Db,
  req: NextRequest | undefined,
): Promise<AuthContext | null> {
  const token = req?.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .get();
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
    return null;
  }
  if (row.session.expiresAt - now < SESSION_REFRESH_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: now + SESSION_TTL_MS })
      .where(eq(sessions.id, row.session.id))
      .run();
  }
  return { user: row.user, session: row.session };
}

/** Crea una sesión nueva; si se excede el máximo, elimina la más antigua. */
export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; tokenHash: string }> {
  const { token, tokenHash } = createSessionToken();
  const existing = await db
    .select({ id: sessions.id, createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(asc(sessions.createdAt))
    .all();
  if (existing.length >= MAX_SESSIONS_PER_USER) {
    await db.delete(sessions).where(eq(sessions.id, existing[0].id)).run();
  }
  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash,
    expiresAt: Date.now() + SESSION_TTL_MS,
    createdAt: Date.now(),
  }).run();
  return { token, tokenHash };
}
