import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { cyclesRouter } from "../routers/cycles";
import { budgetsRouter } from "../routers/budgets";
import { transactionsRouter } from "../routers/transactions";
import { fixedExpensesRouter } from "../routers/fixed-expenses";
import { savingsRouter } from "../routers/savings";
import { createTestDb, seedCategory, createTestUser, mintSession, makeCtx } from "./helpers";
import type { Db } from "../db";
import type { Context } from "../context";

const CYCLE = "2026-09";

describe("cyclesRouter", () => {
  let db: Db;
  let ctx: Context;
  let caller: ReturnType<typeof cyclesRouter.createCaller>;
  let budgets: ReturnType<typeof budgetsRouter.createCaller>;
  let tx: ReturnType<typeof transactionsRouter.createCaller>;
  let fixed: ReturnType<typeof fixedExpensesRouter.createCaller>;
  let savings: ReturnType<typeof savingsRouter.createCaller>;
  let catAlim: string;

  beforeEach(async () => {
    db = await createTestDb();
    catAlim = (await seedCategory(db, { name: "Alimentación" })).id;
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    ctx = makeCtx(db, { cookie: token });
    caller = cyclesRouter.createCaller(ctx);
    budgets = budgetsRouter.createCaller(ctx);
    tx = transactionsRouter.createCaller(ctx);
    fixed = fixedExpensesRouter.createCaller(ctx);
    savings = savingsRouter.createCaller(ctx);
  });

  describe("current", () => {
    it("calcula rango, etiqueta y días restantes hasta el 25", async () => {
      const res = await caller.current({ today: "2026-10-17" });
      expect(res.cycleKey).toBe(CYCLE);
      expect(res.label).toBe("25 sep – 24 oct");
      expect(res.start).toBe("2026-09-25");
      expect(res.end).toBe("2026-10-24");
      expect(res.daysRemaining).toBe(8);
      expect(res.nextPayday).toBe("2026-10-25");
    });

    it("el mismo día 25 ya cuenta como el próximo pago", async () => {
      const res = await caller.current({ today: "2026-10-25" });
      expect(res.cycleKey).toBe("2026-10");
      expect(res.daysRemaining).toBe(31);
    });
  });

  describe("overview", () => {
    it("resume ingresos, fijos, personales y ahorros del ciclo", async () => {
      await tx.create({ type: "income", amountCents: 300_000, date: "2026-10-01" });
      await tx.create({ type: "income", amountCents: 500_000, date: "2026-10-25" });

      const catServ = (await seedCategory(db, { name: "Servicios" })).id;
      const fe = await fixed.create({ name: "Luz", amountCents: 8000, categoryId: catServ, chargeDay: 1 });
      await fixed.markPaid({ id: fe.id, date: "2026-10-01" });

      await budgets.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 100_000 });
      await tx.create({ type: "expense", amountCents: 30_000, categoryId: catAlim, date: "2026-10-02" });

      await savings.aporte({ amountCents: 50_000, date: "2026-10-03" });

      const res = await caller.overview({ cycleKey: CYCLE });
      expect(res.income.totalCents).toBe(300_000);
      expect(res.fijos.count).toBe(1);
      expect(res.fijos.expectedCents).toBe(8000);
      expect(res.fijos.paidCents).toBe(8000);
      expect(res.personales.metaCents).toBe(100_000);
      expect(res.personales.spentCents).toBe(30_000);
      expect(res.ahorros.cycleCents).toBe(50_000);
      expect(res.ahorros.totalCents).toBe(50_000);
      expect(res.ahorros.bucketCount).toBe(3);
      expect(res.unassignedCents).toBe(300_000 - 8000 - 100_000 - 50_000);
      expect(res.closure).toBeNull();
    });

    it("el gasto personal no incluye los pagos de gastos fijos", async () => {
      const catServ = (await seedCategory(db, { name: "Servicios" })).id;
      const fe = await fixed.create({ name: "Luz", amountCents: 8000, categoryId: catServ, chargeDay: 1 });
      await fixed.markPaid({ id: fe.id, date: "2026-10-01" });
      const res = await caller.overview({ cycleKey: CYCLE });
      expect(res.personales.spentCents).toBe(0);
      expect(res.fijos.paidCents).toBe(8000);
    });
  });

  describe("leftovers", () => {
    it("calcula sobrantes por concepto y por fecha", async () => {
      await budgets.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 100_000 });
      await tx.create({ type: "expense", amountCents: 40_000, categoryId: catAlim, date: "2026-10-02" });
      const res = await caller.leftovers({ cycleKey: CYCLE });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].leftoverCents).toBe(60_000);
      expect(res.totalLeftoverCents).toBe(60_000);
      expect(res.closure).toBeNull();
    });
  });

  describe("close", () => {
    it("aplica savings, carry y move, y registra el cierre", async () => {
      const catTrans = (await seedCategory(db, { name: "Transporte" })).id;
      const catRopa = (await seedCategory(db, { name: "Ropa" })).id;

      await budgets.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 100_000 });
      await budgets.upsert({ categoryId: catTrans, cycleKey: CYCLE, amountCents: 50_000 });
      await budgets.upsert({ categoryId: catRopa, cycleKey: CYCLE, amountCents: 30_000 });
      await tx.create({ type: "expense", amountCents: 40_000, categoryId: catAlim, date: "2026-10-02" });

      await budgets.upsert({ categoryId: catAlim, cycleKey: "2026-10", amountCents: 20_000 });

      const left = await caller.leftovers({ cycleKey: CYCLE });
      expect(left.items).toHaveLength(3);
      expect(left.totalLeftoverCents).toBe(140_000);

      const res = await caller.close({
        cycleKey: CYCLE,
        date: "2026-10-24",
        decisions: [
          { categoryId: catAlim, decision: "savings" },
          { categoryId: catTrans, decision: "carry" },
          { categoryId: catRopa, decision: "move", targetCategoryId: catAlim },
        ],
      });
      expect(res.savedCents).toBe(60_000);
      expect(res.carriedCents).toBe(80_000);
      expect(res.items).toBe(3);

      const savingsList = await savings.list({ cycleKey: CYCLE });
      expect(savingsList.totalCents).toBe(60_000);
      expect(
        savingsList.buckets.find((b) => b.id === "bucket-emergencia")!.balanceCents,
      ).toBe(12_000);
      expect(
        savingsList.buckets.find((b) => b.id === "bucket-metas")!.balanceCents,
      ).toBe(30_000);

      const next = await budgets.list({ cycleKey: "2026-10" });
      const alim = next.rows.find((r) => r.categoryId === catAlim)!;
      expect(alim.amountCents).toBe(20_000);
      expect(alim.carryCents).toBe(30_000);
      const trans = next.rows.find((r) => r.categoryId === catTrans)!;
      expect(trans.amountCents).toBe(0);
      expect(trans.carryCents).toBe(50_000);

      const after = await caller.leftovers({ cycleKey: CYCLE });
      expect(after.closure).not.toBeNull();
      expect(after.closureItems).toHaveLength(3);

      const ov = await caller.overview({ cycleKey: CYCLE });
      expect(ov.closure?.savedCents).toBe(60_000);
    });

    it("prohíbe cerrar dos veces el mismo ciclo", async () => {
      await budgets.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 10_000 });
      await caller.close({ cycleKey: CYCLE, decisions: [{ categoryId: catAlim, decision: "carry" }] });
      await expect(
        caller.close({ cycleKey: CYCLE, decisions: [{ categoryId: catAlim, decision: "carry" }] }),
      ).rejects.toThrow(TRPCError);
    });

    it("exige una decisión por cada sobrante", async () => {
      const catTrans = (await seedCategory(db, { name: "Transporte" })).id;
      await budgets.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 10_000 });
      await budgets.upsert({ categoryId: catTrans, cycleKey: CYCLE, amountCents: 20_000 });
      await expect(
        caller.close({ cycleKey: CYCLE, decisions: [{ categoryId: catAlim, decision: "carry" }] }),
      ).rejects.toThrow(/Falta la decisión/);
    });

    it("valida las decisiones move y rechaza conceptos sin sobrante", async () => {
      const catTrans = (await seedCategory(db, { name: "Transporte" })).id;
      await budgets.upsert({ categoryId: catAlim, cycleKey: CYCLE, amountCents: 10_000 });

      await expect(
        caller.close({
          cycleKey: CYCLE,
          decisions: [{ categoryId: catAlim, decision: "move" }],
        }),
      ).rejects.toThrow(/destino/);

      await expect(
        caller.close({
          cycleKey: CYCLE,
          decisions: [{ categoryId: catAlim, decision: "move", targetCategoryId: catAlim }],
        }),
      ).rejects.toThrow(/distinto/);

      await expect(
        caller.close({
          cycleKey: CYCLE,
          decisions: [
            { categoryId: catAlim, decision: "carry" },
            { categoryId: catTrans, decision: "carry" },
          ],
        }),
      ).rejects.toThrow(/no tiene sobrante/);
    });
  });
});
