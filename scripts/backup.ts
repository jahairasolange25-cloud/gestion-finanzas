/* Backup de la BD: copia física si es local (file:).
 * Para Turso usa el CLI oficial: `turso db dump <nombre-db>`.
 * Uso: npm run db:backup
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

async function main() {
  const url =
    process.env.DATABASE_URL ??
    `file:${path.join(process.cwd(), "data", "finanzas.db")}`;

  if (!url.startsWith("file:")) {
    console.error(
      "DATABASE_URL remota: usa `turso db dump <nombre-db>` para el backup.",
    );
    process.exit(1);
  }

  const client = createClient({ url });
  const res = await client.execute("SELECT 1");
  if (res.rows.length !== 1) throw new Error("La BD no responde");

  const backupsDir = path.join(process.cwd(), "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const dest = path.join(backupsDir, `finanzas-${stamp}.db`);
  fs.copyFileSync(fileURLToPath(new URL(url)), dest);
  console.log(`Backup creado: ${dest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
