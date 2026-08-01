import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "../src/server/db";

const migrationsFolder = path.join(process.cwd(), "drizzle");

migrate(db, { migrationsFolder })
  .then(() => {
    console.log("✓ Migraciones aplicadas");
    process.exit(0);
  })
  .catch((err) => {
    console.error("✗ Error en migración:", err);
    process.exit(1);
  });
