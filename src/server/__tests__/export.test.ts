import { beforeEach, describe, expect, it } from "vitest";
import { transactions } from "../db/schema";
import { exportRouter } from "../routers/export";
import {
  createTestDb,
  seedCategory,
  createTestUser,
  mintSession,
  makeCtx,
} from "./helpers";
import type { Db } from "../db";

type Caller = ReturnType<typeof exportRouter.createCaller>;

describe("exportRouter.csv", () => {
  let db: Db;
  let caller: Caller;

  beforeEach(async () => {
    db = await createTestDb();
    const catId = (await seedCategory(db, { name: "Alimentación" })).id;
    const ts = (d: string) => new Date(`${d}T12:00:00`).getTime();
    const row = {
      type: "expense" as const,
      amountCents: 1250,
      year: 2026,
      month: 8,
      quarter: 3,
      semester: 2,
      weekIso: 31,
      day: 15,
      dayOfWeek: 6,
      hour: 12,
      createdAt: ts("2026-08-15"),
      updatedAt: ts("2026-08-15"),
    };
    await db.insert(transactions).values([
      { ...row, id: "1", categoryId: catId, concept: "Mercado", date: "2026-08-15", ts: ts("2026-08-15") },
      { ...row, id: "2", categoryId: null, concept: 'Dijo "hola"', note: "nota; con punto y coma", date: "2026-08-16", ts: ts("2026-08-16") },
      { ...row, id: "3", type: "income", amountCents: 500000, categoryId: null, concept: "Sueldo", date: "2026-08-01", ts: ts("2026-08-01") },
    ]).run();

    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    caller = exportRouter.createCaller(makeCtx(db, { cookie: token }));
  });

  it("exporta BOM + cabecera y una fila por transacción con `;`", async () => {
    const res = await caller.csv({});
    expect(res.filename).toMatch(/^finanzas-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(res.csv.startsWith("\uFEFF")).toBe(true);

    const lines = res.csv.replace("\uFEFF", "").split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      "Fecha;Tipo;Categoría;Concepto;Nota;Monto (S/)",
    );
    expect(lines[1]).toBe("2026-08-01;Ingreso;;Sueldo;;5000,00");
    expect(lines[2]).toBe("2026-08-15;Gasto;Alimentación;Mercado;;12,50");
    expect(lines[3]).toBe(
      '2026-08-16;Gasto;;"Dijo ""hola""";"nota; con punto y coma";12,50',
    );
  });

  it("respeta el rango de fechas", async () => {
    const res = await caller.csv({ from: "2026-08-15", to: "2026-08-15" });
    const lines = res.csv.replace("\uFEFF", "").split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("2026-08-15;Gasto;Alimentación;Mercado");
  });

  it("requiere sesión", async () => {
    await expect(exportRouter.createCaller(makeCtx(db)).csv({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
