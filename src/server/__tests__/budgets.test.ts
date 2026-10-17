import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { budgets } from "../db/schema";
import { budgetsRouter, budgetStatus } from "../routers/budgets";
import { createTestDb, seedCategory, createTestUser, mintSession, makeCtx } from "./helpers";
import type { Db } from "../db";
import { transactionsRouter } from "../routers/transactions";
import { todayCycleKey } from "../../lib/cycle";

type Caller = ReturnType<typeof budgetsRouter.createCaller>;
type TxCaller = ReturnType<typeof transactionsRouter.createCaller>;

const CYCLE = "2026-09";

describe("budgetsRouter", () => {
  let db: Db;
  let caller: Caller;
  let tx: TxCaller;
  let catAlim: string;

  beforeEach(async () => {
    db = await createTestDb();
    catAlim = (await seedCategory(db, { name: "Alimentación" })).id;
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    const ctx = makeCtx(db, { cookie: token });
    caller = budgetsRouter.createCaller(ctx);
    tx = transactionsRouter.createCaller(ctx);
  });

  describe("upsert", () => {
    it("crea la meta del ciclo", async () => {
      const b = await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 50_000 });
      expect(b.amountCents).toBe(50_000);
      expect(b.cycleKey).toBe(CYCLE);
      expect(b.carryCents).toBe(0);
      expect(b.isActive).toBe(true);
    });

    it("actualiza el monto de la misma categoría y ciclo (no duplica)", async () => {
      await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 50_000 });
      const b = await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 80_000 });
      expect(b.amountCents).toBe(80_000);
      const rows = await db.select().from(budgets).where(eq(budgets.categoryId, catAlim)).all();
      expect(rows).toHaveLength(1);
    });

    it("permite metas distintas por ciclo", async () => {
      await caller.upsert({ categoryId: catAlim, cycleKey: "2026-09", amountCents: 50_000 });
      await caller.upsert({ categoryId: catAlim, cycleKey: "2026-10", amountCents: 70_000 });
      const rows = await db.select().from(budgets).where(eq(budgets.categoryId, catAlim)).all();
      expect(rows).toHaveLength(2);
    });

    it("rechaza categoría inexistente", async () => {
      await expect(
        caller.upsert({ categoryId: "nope", cycleKey: CYCLE, amountCents: 1000 }),
      ).rejects.toThrow(TRPCError);
    });

    it("rechaza categoría de ingreso", async () => {
      const income = (await seedCategory(db, { name: "Sueldo", type: "income" })).id;
      await expect(
        caller.upsert({ categoryId: income, cycleKey: CYCLE, amountCents: 1000 }),
      ).rejects.toThrow(TRPCError);
    });

    it("rechaza montos no positivos y ciclos inválidos", async () => {
      await expect(
        caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 0 }),
      ).rejects.toThrow();
      await expect(
        caller.upsert({ categoryId: catAlim, cycleKey: "2026", amountCents: 100 }),
      ).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("calcula consumido del ciclo (excluye pagos de gastos fijos)", async () => {
      await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 100_000 });

      await tx.create({ type: "expense", amountCents: 20_000, categoryId: catAlim, date: "2026-09-26" });
      await tx.create({ type: "expense", amountCents: 70_000, categoryId: catAlim, date: "2026-10-20" });
      await tx.create({ type: "expense", amountCents: 99_999, categoryId: catAlim, date: "2026-10-25" });
      await tx.create({ type: "income", amountCents: 500_000, date: "2026-09-26" });

      const res = await caller.list({ cycleKey: CYCLE });
      const row = res.rows.find((r) => r.categoryId === catAlim)!;
      expect(row.spentCents).toBe(90_000);
      expect(row.remainingCents).toBe(10_000);
      expect(row.pct).toBe(90);
      expect(row.status).toBe("near");
      expect(res.totals.spentCents).toBe(90_000);
      expect(res.totals.metaCents).toBe(100_000);
    });

    it("marca over con sobrante negativo", async () => {
      await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 10_000 });
      await tx.create({ type: "expense", amountCents: 15_000, categoryId: catAlim, date: "2026-10-05" });
      const res = await caller.list({ cycleKey: CYCLE });
      const row = res.rows.find((r) => r.categoryId === catAlim)!;
      expect(row.status).toBe("over");
      expect(row.remainingCents).toBe(-5_000);
    });

    it("incluye el arrastrado del ciclo en el disponible", async () => {
      const b = await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 30_000 });
      await db
        .update(budgets)
        .set({ carryCents: 20_000 })
        .where(eq(budgets.id, b.id))
        .run();
      const res = await caller.list({ cycleKey: CYCLE });
      const row = res.rows.find((r) => r.categoryId === catAlim)!;
      expect(row.availableCents).toBe(50_000);
      expect(res.totals.carryCents).toBe(20_000);
    });

    it("por defecto usa el ciclo actual", async () => {
      const res = await caller.list({});
      expect(res.cycleKey).toBe(todayCycleKey());
    });
  });

  describe("copyPrevious", () => {
    it("copia metas del ciclo anterior y respeta las ya definidas", async () => {
      await caller.upsert({ categoryId: catAlim, cycleKey: "2026-09", amountCents: 30_000 });
      const cat2 = (await seedCategory(db, { name: "Transporte" })).id;
      await caller.upsert({ categoryId: cat2, cycleKey: "2026-09", amountCents: 20_000 });
      await caller.upsert({ categoryId: catAlim, cycleKey: "2026-10", amountCents: 99_000 });

      const res = await caller.copyPrevious({ cycleKey: "2026-10" });
      expect(res.created).toBe(1);

      const rows = await db
        .select()
        .from(budgets)
        .where(eq(budgets.cycleKey, "2026-10"))
        .all();
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.categoryId === catAlim)!.amountCents).toBe(99_000);
      expect(rows.find((r) => r.categoryId === cat2)!.amountCents).toBe(20_000);
    });
  });

  describe("setActive / remove", () => {
    it("desactiva y reactiva", async () => {
      const b = await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 1000 });
      const off = await caller.setActive({ id: b.id, isActive: false });
      expect(off.isActive).toBe(false);
      const on = await caller.setActive({ id: b.id, isActive: true });
      expect(on.isActive).toBe(true);
    });

    it("elimina la meta del ciclo", async () => {
      const b = await caller.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 1000 });
      await caller.remove({ id: b.id });
      const rows = await db
        .select()
        .from(budgets)
        .where(and(eq(budgets.categoryId, catAlim), eq(budgets.cycleKey, CYCLE)))
        .all();
      expect(rows).toHaveLength(0);
    });

    it("not found al operar sobre ids inexistentes", async () => {
      await expect(caller.setActive({ id: "nope", isActive: false })).rejects.toThrow(TRPCError);
      await expect(caller.remove({ id: "nope" })).rejects.toThrow(TRPCError);
    });
  });

  describe("budgetStatus", () => {
    it("clasifica ok / near / over", () => {
      expect(budgetStatus(10_000, 100_000)).toBe("ok");
      expect(budgetStatus(80_000, 100_000)).toBe("near");
      expect(budgetStatus(100_000, 100_000)).toBe("over");
      expect(budgetStatus(150_000, 100_000)).toBe("over");
    });
  });
});
