import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import * as schema from "../db/schema";
import type { Db } from "../db";
import type { Context } from "../context";
import { hashPassword } from "../auth";
import { createSession } from "../session";

let seq = 0;

/** Crea una BD SQLite en memoria con las migraciones aplicadas. */
export async function createTestDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  return db;
}

/** Contexto con request simulado: cookie de sesión, origin y host configurables. */
export function makeCtx(
  db: Db,
  opts: { cookie?: string; origin?: string; host?: string } = {},
): Context {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", `mf_session=${opts.cookie}`);
  if (opts.origin) headers.set("origin", opts.origin);
  headers.set("host", opts.host ?? "localhost");
  const req = new NextRequest("http://localhost/api/trpc", { headers });
  return { db, req, cookies: [], requestId: randomUUID() };
}

export async function createTestUser(
  db: Db,
  username = "admin",
  password = "secreto123",
): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await db.insert(schema.users).values({
    id,
    username,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  }).run();
  return id;
}

/** Crea una sesión real y devuelve el token (para simular login). */
export async function mintSession(db: Db, userId: string): Promise<string> {
  const { token } = await createSession(db, userId);
  return token;
}

export async function seedCategory(
  db: Db,
  overrides: Partial<typeof schema.categories.$inferInsert> = {},
) {
  const row = {
    id: `cat-${seq++}`,
    name: `Categoría ${seq}`,
    type: "expense" as const,
    icon: "tag",
    color: "#6366f1",
    sortOrder: 0,
    isActive: true,
    isSystem: false,
    createdAt: Date.now(),
    ...overrides,
  };
  await db.insert(schema.categories).values(row).run();
  return row;
}
