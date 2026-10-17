import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { savingsRouter } from "../routers/savings";
import { createTestDb, createTestUser, mintSession, makeCtx } from "./helpers";
import type { Db } from "../db";

type Caller = ReturnType<typeof savingsRouter.createCaller>;

const CYCLE = "2026-09";

describe("savingsRouter", () => {
  let db: Db;
  let caller: Caller;

  beforeEach(async () => {
    db = await createTestDb();
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    caller = savingsRouter.createCaller(makeCtx(db, { cookie: token }));
  });

  async function balances() {
    const res = await caller.list({ cycleKey: CYCLE });
    const byName = Object.fromEntries(res.buckets.map((b) => [b.name, b.balanceCents]));
    return { res, byName };
  }

  it("la migración siembra los sub-bolsillos 20/50/30", async () => {
    const res = await caller.list({ cycleKey: CYCLE });
    expect(res.buckets.map((b) => b.name)).toEqual([
      "Fondo de emergencia",
      "Metas grandes",
      "Viaje",
    ]);
    expect(res.buckets.map((b) => b.pct)).toEqual([20, 50, 30]);
    expect(res.totalCents).toBe(0);
  });

  describe("aporte", () => {
    it("reparte según porcentajes, acumula saldos y registra el ciclo", async () => {
      const out = await caller.aporte({ amountCents: 100_000, date: "2026-10-05" });
      expect(out.cycleKey).toBe(CYCLE);
      expect(out.totalCents).toBe(100_000);
      expect(out.entries).toHaveLength(3);

      const { res, byName } = await balances();
      expect(byName["Fondo de emergencia"]).toBe(20_000);
      expect(byName["Metas grandes"]).toBe(50_000);
      expect(byName["Viaje"]).toBe(30_000);
      expect(res.totalCents).toBe(100_000);
      expect(res.cycle.aportes).toBe(100_000);
      expect(res.recent).toHaveLength(3);
    });

    it("el residuo por redondeo no pierde céntimos", async () => {
      await caller.aporte({ amountCents: 10_001, date: "2026-10-05" });
      const { res, byName } = await balances();
      expect(byName["Fondo de emergencia"]).toBe(2000);
      expect(byName["Metas grandes"]).toBe(5001);
      expect(byName["Viaje"]).toBe(3000);
      expect(res.totalCents).toBe(10_001);
    });

    it("ignora sub-bolsillos con pct 0 y reparte proporcional si no suman 100", async () => {
      await caller.upsertBucket({ id: "bucket-metas", name: "Metas grandes", pct: 0 });
      await caller.upsertBucket({ id: "bucket-viaje", name: "Viaje", pct: 100 });
      await caller.aporte({ amountCents: 10_000 });
      const { res, byName } = await balances();
      expect(byName["Metas grandes"]).toBe(0);
      expect(byName["Viaje"]).toBe(8333);
      expect(byName["Fondo de emergencia"]).toBe(1667);
      expect(res.totalCents).toBe(10_000);
    });

    it("rechaza si no hay sub-bolsillos activos con porcentaje", async () => {
      for (const id of ["bucket-emergencia", "bucket-metas", "bucket-viaje"]) {
        await caller.setBucketActive({ id, isActive: false });
      }
      await expect(caller.aporte({ amountCents: 1000 })).rejects.toThrow(TRPCError);
    });
  });

  describe("retiro", () => {
    it("descuenta del bolsillo y valida el saldo disponible", async () => {
      await caller.aporte({ amountCents: 10_000, date: "2026-10-05" });

      await expect(
        caller.retiro({ bucketId: "bucket-viaje", amountCents: 5000 }),
      ).rejects.toThrow(TRPCError);

      const out = await caller.retiro({
        bucketId: "bucket-viaje",
        amountCents: 3000,
        date: "2026-10-06",
      });
      expect(out.bucketName).toBe("Viaje");

      const { res, byName } = await balances();
      expect(byName["Viaje"]).toBe(0);
      expect(res.cycle.retiros).toBe(3000);
      expect(res.totalCents).toBe(7000);
    });

    it("rechaza bolsillos inexistentes", async () => {
      await expect(
        caller.retiro({ bucketId: "nope", amountCents: 100 }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("upsertBucket / setBucketActive / removeBucket", () => {
    it("crea un sub-bolsillo nuevo y lo incluye en el reparto", async () => {
      await caller.upsertBucket({ id: "bucket-metas", name: "Metas grandes", pct: 20 });
      await caller.upsertBucket({ id: "bucket-emergencia", name: "Fondo de emergencia", pct: 20 });
      await caller.upsertBucket({ id: "bucket-viaje", name: "Viaje", pct: 0 });
      await caller.upsertBucket({ name: "Auto", pct: 60 });
      const res = await caller.list({ cycleKey: CYCLE });
      expect(res.buckets).toHaveLength(4);

      await caller.aporte({ amountCents: 10_000 });
      const { byName } = await balances();
      expect(byName["Auto"]).toBe(6000);
    });

    it("edita un sub-bolsillo existente y rechaza ids inexistentes", async () => {
      const b = await caller.upsertBucket({ id: "bucket-viaje", name: "Viajes", pct: 40 });
      expect(b.name).toBe("Viajes");
      expect(b.pct).toBe(40);
      await expect(
        caller.upsertBucket({ id: "nope", name: "X", pct: 10 }),
      ).rejects.toThrow(TRPCError);
    });

    it("desactiva un sub-bolsillo y deja de recibir aportes", async () => {
      await caller.aporte({ amountCents: 10_000 });
      await caller.setBucketActive({ id: "bucket-metas", isActive: false });
      await caller.aporte({ amountCents: 5_000 });
      const { byName } = await balances();
      expect(byName["Metas grandes"]).toBe(5000);
    });

    it("removeBucket solo elimina si no tiene movimientos", async () => {
      const b = await caller.upsertBucket({ name: "Auto", pct: 0 });
      const removed = await caller.removeBucket({ id: b.id });
      expect(removed.ok).toBe(true);

      await caller.aporte({ amountCents: 1000 });
      await expect(
        caller.removeBucket({ id: "bucket-viaje" }),
      ).rejects.toThrow(TRPCError);
      await expect(caller.removeBucket({ id: "nope" })).rejects.toThrow(TRPCError);
    });
  });

  describe("history", () => {
    it("lista movimientos y filtra por sub-bolsillo", async () => {
      await caller.aporte({ amountCents: 10_000, date: "2026-10-05" });
      await caller.retiro({ bucketId: "bucket-viaje", amountCents: 1000, date: "2026-10-06" });

      const all = await caller.history({ limit: 60 });
      expect(all).toHaveLength(4);

      const viaje = await caller.history({ bucketId: "bucket-viaje", limit: 60 });
      expect(viaje).toHaveLength(2);
      expect(viaje.map((h) => h.kind).sort()).toEqual(["aporte", "retiro"]);
    });
  });
});
