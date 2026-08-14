import { beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { goals } from "../db/schema";
import { goalsRouter } from "../routers/goals";
import { createTestDb, createTestUser, mintSession, makeCtx } from "./helpers";
import type { Db } from "../db";

type Caller = ReturnType<typeof goalsRouter.createCaller>;

describe("goalsRouter", () => {
  let db: Db;
  let caller: Caller;

  beforeEach(async () => {
    db = await createTestDb();
    const userId = await createTestUser(db);
    const token = await mintSession(db, userId);
    caller = goalsRouter.createCaller(makeCtx(db, { cookie: token }));
  });

  describe("create", () => {
    it("crea una meta con progreso 0", async () => {
      const g = await caller.create({
        name: "Viaje a Cusco",
        targetCents: 300_000,
        icon: "plane",
        color: "#3b82f6",
      });
      expect(g.currentCents).toBe(0);
      expect(g.icon).toBe("plane");
      expect(g.color).toBe("#3b82f6");
      expect(g.isActive).toBe(true);
    });

    it("usa valores por defecto de icono/color", async () => {
      const g = await caller.create({ name: "Fondo", targetCents: 10_000 });
      expect(g.icon).toBe("piggy-bank");
      expect(g.color).toBe("#10b981");
    });

    it("valida nombre, monto y deadline", async () => {
      await expect(caller.create({ name: " ", targetCents: 1000 })).rejects.toThrow();
      await expect(caller.create({ name: "X", targetCents: 0 })).rejects.toThrow();
      await expect(
        caller.create({ name: "X", targetCents: 1000, deadline: "2026-13" }),
      ).rejects.toThrow();
      await expect(
        caller.create({ name: "X", targetCents: 1000, deadline: "2026-12" }),
      ).resolves.toBeTruthy();
    });
  });

  describe("deposit / withdraw", () => {
    it("suma abonos sin superar la meta", async () => {
      const g = await caller.create({ name: "Fondo", targetCents: 100_000 });
      await caller.deposit({ id: g.id, amountCents: 30_000 });
      const after = await caller.deposit({ id: g.id, amountCents: 90_000 });
      expect(after.currentCents).toBe(100_000);
    });

    it("resta sin bajar de 0", async () => {
      const g = await caller.create({ name: "Fondo", targetCents: 100_000 });
      await caller.deposit({ id: g.id, amountCents: 5_000 });
      const after = await caller.withdraw({ id: g.id, amountCents: 50_000 });
      expect(after.currentCents).toBe(0);
    });

    it("rechaza montos no positivos y metas inexistentes", async () => {
      const g = await caller.create({ name: "Fondo", targetCents: 100_000 });
      await expect(caller.deposit({ id: g.id, amountCents: 0 })).rejects.toThrow();
      await expect(caller.deposit({ id: "nope", amountCents: 100 })).rejects.toThrow(TRPCError);
      await expect(caller.withdraw({ id: "nope", amountCents: 100 })).rejects.toThrow(TRPCError);
    });
  });

  describe("update / setActive / remove", () => {
    it("actualiza campos", async () => {
      const g = await caller.create({ name: "Fondo", targetCents: 100_000 });
      const updated = await caller.update({ id: g.id, targetCents: 150_000, name: "Fondo 2" });
      expect(updated.targetCents).toBe(150_000);
      expect(updated.name).toBe("Fondo 2");
    });

    it("desactiva y reactiva", async () => {
      const g = await caller.create({ name: "Fondo", targetCents: 100_000 });
      expect((await caller.setActive({ id: g.id, isActive: false })).isActive).toBe(false);
      expect((await caller.setActive({ id: g.id, isActive: true })).isActive).toBe(true);
    });

    it("elimina y reporta not found", async () => {
      const g = await caller.create({ name: "Fondo", targetCents: 100_000 });
      await caller.remove({ id: g.id });
      const rows = await db.select().from(goals).all();
      expect(rows).toHaveLength(0);
      await expect(caller.remove({ id: g.id })).rejects.toThrow(TRPCError);
      await expect(caller.update({ id: "nope", name: "X" })).rejects.toThrow(TRPCError);
      await expect(caller.setActive({ id: "nope", isActive: true })).rejects.toThrow(TRPCError);
    });
  });

  describe("list", () => {
    it("devuelve metas ordenadas por creación", async () => {
      await caller.create({ name: "Primera", targetCents: 1000 });
      await caller.create({ name: "Segunda", targetCents: 2000 });
      const rows = await caller.list();
      expect(rows.map((g) => g.name)).toEqual(["Primera", "Segunda"]);
    });
  });
});
