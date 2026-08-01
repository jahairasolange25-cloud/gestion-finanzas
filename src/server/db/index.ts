import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url =
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "data", "finanzas.db")}`;

if (url.startsWith("libsql://") && !process.env.TURSO_AUTH_TOKEN) {
  throw new Error(
    "DATABASE_URL remota (libsql://) requiere TURSO_AUTH_TOKEN",
  );
}

const client = createClient({
  url,
  authToken: url.startsWith("libsql://")
    ? process.env.TURSO_AUTH_TOKEN
    : undefined,
});

export const db = drizzle(client, { schema });

export type Db = typeof db;
