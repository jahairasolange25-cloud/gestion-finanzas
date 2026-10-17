import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { transactions, fixedExpenses } from "../db/schema";
import { fixedExpensesRouter, chargeDatesForMonth } from "../routers/fixed-expenses";
import { createTestDb, seedCategory, createTestUser, mintSession, makeCtx } from "./helpers";
import type { Db } from "../db";
import { parseDate, toDateFields } from "../../lib/date-fields";

type Caller = ReturnType<typeof fixedExpensesRouter.createCaller>;

describe("fixedExpensesRouter", () => {
  let db: Db;
  let caller: Caller;
  let catId: string;

  beforeEach(async () => {
    db = await createTestDb();
    catId = (await seedCategory(db, { name: "Suscripciones" })).id;
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    caller = fixedExpensesRouter.createCaller(makeCtx(db, { cookie: token }));
  });

  describe("create", () => {
    it("crea con valores por defecto", async () => {
      const fe = await caller.create({ name: "Netflix", amountCents: 3490, categoryId: catId });
      expect(fe.frequency).toBe("monthly");
      expect(fe.chargeDay).toBe(1);
      expect(fe.isActive).toBe(true);
    });

    it("valida el día de cobro según frecuencia", async () => {
      await expect(
        caller.create({ name: "X", amountCents: 1000, frequency: "weekly", chargeDay: 7 }),
      ).rejects.toThrow();
      await expect(
        caller.create({ name: "X", amountCents: 1000, frequency: "monthly", chargeDay: 32 }),
      ).rejects.toThrow();
      await expect(
        caller.create({ name: "X", amountCents: 1000, frequency: "monthly", chargeDay: 31 }),
      ).resolves.toBeTruthy();
      await expect(
        caller.create({ name: "X", amountCents: 1000, frequency: "weekly", chargeDay: 0 }),
      ).resolves.toBeTruthy();
    });

    it("rechaza categoría inexistente y de ingreso", async () => {
      await expect(
        caller.create({ name: "X", amountCents: 1000, categoryId: "nope" }),
      ).rejects.toThrow(TRPCError);
      const income = (await seedCategory(db, { name: "Sueldo", type: "income" })).id;
      await expect(
        caller.create({ name: "X", amountCents: 1000, categoryId: income }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("chargeDatesForMonth", () => {
    it("mensual: un cobro el día indicado (septiembre 2026)", () => {
      const fe = { frequency: "monthly" as const, chargeDay: 15, createdAt: Date.now() };
      const dates = chargeDatesForMonth(fe, 2026, 9);
      expect(dates).toHaveLength(1);
      expect(dates[0].getDate()).toBe(15);
    });

    it("mensual: ajusta día 31 en meses de 30 días", () => {
      const fe = { frequency: "monthly" as const, chargeDay: 31, createdAt: Date.now() };
      const dates = chargeDatesForMonth(fe, 2026, 9);
      expect(dates[0].getDate()).toBe(30);
    });

    it("mensual: ajusta día 31 en febrero", () => {
      const fe = { frequency: "monthly" as const, chargeDay: 31, createdAt: Date.now() };
      expect(chargeDatesForMonth(fe, 2026, 2)[0].getDate()).toBe(28);
      expect(chargeDatesForMonth(fe, 2028, 2)[0].getDate()).toBe(29);
    });

    it("semanal: un cobro por cada ocurrencia del día de semana", () => {
      const fe = { frequency: "weekly" as const, chargeDay: 5, createdAt: Date.now() }; // viernes
      const dates = chargeDatesForMonth(fe, 2026, 9);
      expect(dates.length).toBeGreaterThanOrEqual(4);
      for (const d of dates) expect(d.getDay()).toBe(5);
    });

    it("anual: solo en el mes en que se creó", () => {
      const fe = { frequency: "yearly" as const, chargeDay: 10, createdAt: new Date(2026, 2, 1).getTime() }; // marzo
      expect(chargeDatesForMonth(fe, 2026, 3)).toHaveLength(1);
      expect(chargeDatesForMonth(fe, 2026, 4)).toHaveLength(0);
      expect(chargeDatesForMonth(fe, 2027, 3)).toHaveLength(1);
    });
  });

  describe("generateMonth", () => {
    it("crea las transacciones del mes y es idempotente", async () => {
      await caller.create({ name: "Netflix", amountCents: 3490, categoryId: catId, chargeDay: 15 });

      const first = await caller.generateMonth({ year: 2026, month: 9 });
      expect(first.created).toBe(1);
      expect(first.skipped).toBe(0);

      const all = await db
        .select()
        .from(transactions)
        .where(eq(transactions.concept, "Netflix"))
        .all();
      expect(all).toHaveLength(1);
      expect(all[0].amountCents).toBe(3490);
      expect(all[0].categoryId).toBe(catId);
      expect(all[0].date).toBe("2026-09-15");
      expect(all[0].clientId).toContain("2026-09-15");

      const second = await caller.generateMonth({ year: 2026, month: 9 });
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(1);
      expect((await db.select().from(transactions).all())).toHaveLength(1);
    });

    it("ignora gastos fijos desactivados", async () => {
      const fe = await caller.create({ name: "Gym", amountCents: 9000, chargeDay: 1 });
      await caller.setActive({ id: fe.id, isActive: false });
      const res = await caller.generateMonth({ year: 2026, month: 9 });
      expect(res.created).toBe(0);
    });

    it("genera 4-5 transacciones para un gasto semanal", async () => {
      await caller.create({ name: "Mercado", amountCents: 5000, frequency: "weekly", chargeDay: 5 });
      const res = await caller.generateMonth({ year: 2026, month: 9 });
      expect(res.created).toBeGreaterThanOrEqual(4);
      expect(res.created).toBeLessThanOrEqual(5);
    });
  });

  describe("monthPreview", () => {
    it("proyecta cobros y total sin crear transacciones", async () => {
      await caller.create({ name: "Netflix", amountCents: 3490, chargeDay: 15 });
      const p = await caller.monthPreview({ year: 2026, month: 9 });
      expect(p.count).toBe(1);
      expect(p.totalCents).toBe(3490);
      expect(p.items[0].date).toBe("2026-09-15");
      expect((await db.select().from(transactions).all())).toHaveLength(0);
    });
  });

  describe("update / remove", () => {
    it("actualiza campos y mantiene chargeDay si no cambia frecuencia", async () => {
      const fe = await caller.create({ name: "Netflix", amountCents: 3490, chargeDay: 15 });
      const updated = await caller.update({ id: fe.id, amountCents: 4000 });
      expect(updated.amountCents).toBe(4000);
      expect(updated.chargeDay).toBe(15);
    });

    it("reinicia chargeDay al cambiar de frecuencia", async () => {
      const fe = await caller.create({ name: "Netflix", amountCents: 3490, chargeDay: 15 });
      const updated = await caller.update({ id: fe.id, frequency: "weekly" });
      expect(updated.chargeDay).toBe(1);
    });

    it("not found en update/remove", async () => {
      await expect(caller.update({ id: "nope", amountCents: 100 })).rejects.toThrow(TRPCError);
      await expect(caller.remove({ id: "nope" })).rejects.toThrow(TRPCError);
    });

    it("elimina el gasto fijo", async () => {
      const fe = await caller.create({ name: "Netflix", amountCents: 3490 });
      await caller.remove({ id: fe.id });
      const rows = await db.select().from(fixedExpenses).all();
      expect(rows).toHaveLength(0);
    });
  });

  describe("list (esperado/pagado por ciclo)", () => {
    it("solo cuenta cobros dentro del rango 25→24 del ciclo", async () => {
      const fe = await caller.create({ name: "Netflix", amountCents: 3490, categoryId: catId, chargeDay: 15 });
      const res = await caller.list({ cycleKey: "2026-09" });
      const item = res.items.find((i) => i.id === fe.id)!;
      expect(item.expectedCount).toBe(1);
      expect(item.expectedCents).toBe(3490);
      expect(item.paidCents).toBe(0);
      expect(res.totals.expectedCents).toBe(3490);
      expect(res.totals.pendingCents).toBe(3490);
      expect(res.start).toBe("2026-09-25");
      expect(res.end).toBe("2026-10-24");
    });

    it("un activo no esperado en el ciclo no suma al total", async () => {
      await caller.create({ name: "Seguro", amountCents: 30_000, frequency: "yearly", chargeDay: 10 });
      const res = await caller.list({ cycleKey: "2026-11" });
      expect(res.totals.expectedCents).toBe(0);
    });
  });

  describe("markPaid / unmarkPaid", () => {
    it("crea la transacción vinculada, deriva el ciclo y es idempotente", async () => {
      const fe = await caller.create({ name: "Luz", amountCents: 8000, categoryId: catId, chargeDay: 20 });

      const tx = await caller.markPaid({ id: fe.id, date: "2026-10-20" });
      expect(tx.fixedExpenseId).toBe(fe.id);
      expect(tx.cycleKey).toBe("2026-09");
      expect(tx.type).toBe("expense");
      expect(tx.categoryId).toBe(catId);
      expect(tx.concept).toBe("Luz");

      const again = await caller.markPaid({ id: fe.id, date: "2026-10-20" });
      expect(again.id).toBe(tx.id);
      expect(await db.select().from(transactions).all()).toHaveLength(1);

      const res = await caller.list({ cycleKey: "2026-09" });
      const item = res.items.find((i) => i.id === fe.id)!;
      expect(item.paidCents).toBe(8000);
      expect(item.paidCount).toBe(1);
      expect(res.totals.pendingCents).toBe(0);
    });

    it("fechas distintas del mismo gasto cuentan como pagos separados", async () => {
      const fe = await caller.create({ name: "Mercado", amountCents: 5000, frequency: "weekly", chargeDay: 5 });
      await caller.markPaid({ id: fe.id, date: "2026-10-02" });
      await caller.markPaid({ id: fe.id, date: "2026-10-09" });
      const res = await caller.list({ cycleKey: "2026-09" });
      const item = res.items.find((i) => i.id === fe.id)!;
      expect(item.paidCount).toBe(2);
      expect(item.paidCents).toBe(10_000);
    });

    it("markPaid rechaza gastos fijos inexistentes", async () => {
      await expect(caller.markPaid({ id: "nope" })).rejects.toThrow(TRPCError);
    });

    it("unmarkPaid elimina el pago y list vuelve a pendiente", async () => {
      const fe = await caller.create({ name: "Luz", amountCents: 8000, chargeDay: 20 });
      const tx = await caller.markPaid({ id: fe.id, date: "2026-10-20" });
      const res = await caller.unmarkPaid({ transactionId: tx.id });
      expect(res.ok).toBe(true);
      expect(await db.select().from(transactions).all()).toHaveLength(0);
      const list = await caller.list({ cycleKey: "2026-09" });
      expect(list.items.find((i) => i.id === fe.id)!.paidCents).toBe(0);
    });

    it("unmarkPaid rechaza transacciones que no son pagos de gasto fijo", async () => {
      const now = Date.now();
      const f = toDateFields(parseDate("2026-10-01"));
      await db
        .insert(transactions)
        .values({
          id: "tx-normal",
          type: "expense",
          amountCents: 1000,
          cycleKey: "2026-09",
          ...f,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      await expect(caller.unmarkPaid({ transactionId: "tx-normal" })).rejects.toThrow(TRPCError);
      await expect(caller.unmarkPaid({ transactionId: "nope" })).rejects.toThrow(TRPCError);
    });
  });
});
