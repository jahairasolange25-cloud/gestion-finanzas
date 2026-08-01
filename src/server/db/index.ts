import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url =
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "data", "finanzas.db")}`;

const client = createClient({ url });

export const db = drizzle(client, { schema });

export type Db = typeof db;
