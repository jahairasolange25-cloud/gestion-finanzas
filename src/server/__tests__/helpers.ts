import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema";
import type { Db } from "../db";

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
