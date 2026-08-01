import fs from "node:fs";
import path from "node:path";
import { db } from "../src/server/db";

const file = path.join(process.cwd(), "data", "finanzas.db");
const args = process.argv.slice(2);

async function main() {
  if (args.includes("--hard")) {
    if (fs.existsSync(file)) fs.rmSync(file);
    console.log("🗑 Base eliminada (--hard)");
  } else {
    await db.run("DELETE FROM transactions");
    await db.run("DELETE FROM categories");
    await db.run("DELETE FROM budgets");
    await db.run("DELETE FROM fixed_expenses");
    await db.run("DELETE FROM goals");
    console.log("🗑 Datos eliminados (sin --hard se conservan migraciones)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
