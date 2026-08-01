import { beforeEach, describe, expect, it } from "vitest";
import { transactions } from "../db/schema";
import { analyticsRouter } from "../routers/analytics";
import { createTestDb, seedCategory } from "./helpers";
import type { Db } from "../db";

type Caller = ReturnType<typeof analyticsRouter.createCaller>;

describe("analyticsRouter", () => {
  let db: Db;
  let caller: Caller;
  let foodId: string;
  let salaryId: string;

  beforeEach(async () => {
    db = await createTestDb();
    foodId = (await seedCategory(db, { name: "Alimentación" })).id;
    salaryId = (await seedCategory(db, { name: "Sueldo", type: "income" })).id;
    caller = analyticsRouter.createCaller({ db });

    const ts = (d: string) => new Date(`${d}T12:00:00`).getTime();
    const tx = db.insert(transactions);
    await tx
      .values([
        { id: "1", type: "expense", amountCents: 1000, categoryId: foodId, date: "2026-08-01", ts: ts("2026-08-01"), year: 2026, month: 8, quarter: 3, semester: 2, weekIso: 31, day: 1, dayOfWeek: 6, hour: 12, createdAt: ts("2026-08-01"), updatedAt: ts("2026-08-01") },
        { id: "2", type: "expense", amountCents: 500, categoryId: foodId, date: "2026-08-02", ts: ts("2026-08-02"), year: 2026, month: 8, quarter: 3, semester: 2, weekIso: 31, day: 2, dayOfWeek: 0, hour: 12, createdAt: ts("2026-08-02"), updatedAt: ts("2026-08-02") },
        { id: "3", type: "income", amountCents: 5000, categoryId: salaryId, date: "2026-08-01", ts: ts("2026-08-01"), year: 2026, month: 8, quarter: 3, semester: 2, weekIso: 31, day: 1, dayOfWeek: 6, hour: 9, createdAt: ts("2026-08-01"), updatedAt: ts("2026-08-01") },
      ])
      .run();
  });

  it("calcula totales, balance y promedio", async () => {
    const res = await caller.summary({ from: "2026-08-01", to: "2026-08-31" });
    expect(res.expense).toBe(1500);
    expect(res.income).toBe(5000);
    expect(res.balance).toBe(3500);
    expect(res.count).toBe(3);
    expect(res.dailyAvgExpense).toBe(48);
  });

  it("agrupa por día y categoría", async () => {
    const res = await caller.summary({ from: "2026-08-01", to: "2026-08-31" });
    expect(res.byDay).toHaveLength(2);
    expect(res.topCategory?.name).toBe("Alimentación");
    expect(res.byCategory[0].total).toBe(1500);
  });

  it("devuelve vacíos fuera de rango", async () => {
    const res = await caller.summary({ from: "2027-01-01", to: "2027-01-31" });
    expect(res.expense).toBe(0);
    expect(res.count).toBe(0);
    expect(res.byCategory).toEqual([]);
  });
});
