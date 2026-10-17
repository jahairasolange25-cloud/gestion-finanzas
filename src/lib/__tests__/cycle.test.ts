import { describe, expect, it } from "vitest";
import {
  cycleBounds,
  cycleDays,
  cycleKeyOf,
  cycleLabel,
  daysUntilNextPayday,
  nextCycleKey,
  nextPaydayStr,
  prevCycleKey,
  splitByPct,
} from "../cycle";

describe("cycleKeyOf", () => {
  it("día >= 25 inicia ciclo en ese mes", () => {
    expect(cycleKeyOf("2026-10-25")).toBe("2026-10");
    expect(cycleKeyOf("2026-10-31")).toBe("2026-10");
  });

  it("día < 25 pertenece al ciclo del mes anterior", () => {
    expect(cycleKeyOf("2026-10-24")).toBe("2026-09");
    expect(cycleKeyOf("2026-10-01")).toBe("2026-09");
    expect(cycleKeyOf("2026-10-17")).toBe("2026-09");
  });

  it("cruza el fin de año", () => {
    expect(cycleKeyOf("2026-01-10")).toBe("2025-12");
    expect(cycleKeyOf("2026-01-25")).toBe("2026-01");
  });
});

describe("cycleBounds", () => {
  it("límites normales", () => {
    expect(cycleBounds("2026-09")).toEqual({
      start: "2026-09-25",
      end: "2026-10-24",
    });
  });

  it("límites cruzando diciembre", () => {
    expect(cycleBounds("2026-12")).toEqual({
      start: "2026-12-25",
      end: "2027-01-24",
    });
  });
});

describe("nextCycleKey / prevCycleKey", () => {
  it("avanza y retrocede un ciclo", () => {
    expect(nextCycleKey("2026-12")).toBe("2027-01");
    expect(prevCycleKey("2026-01")).toBe("2025-12");
    expect(nextCycleKey("2026-09")).toBe("2026-10");
    expect(prevCycleKey("2026-09")).toBe("2026-08");
  });
});

describe("cycleLabel", () => {
  it("etiqueta legible", () => {
    expect(cycleLabel("2026-09")).toBe("25 sep – 24 oct");
    expect(cycleLabel("2026-12")).toBe("25 dic – 24 ene");
  });
});

describe("daysUntilNextPayday", () => {
  it("cuenta días hasta el 25 del mismo mes", () => {
    expect(daysUntilNextPayday(new Date(2026, 9, 17))).toBe(8);
    expect(daysUntilNextPayday(new Date(2026, 9, 24))).toBe(1);
    expect(daysUntilNextPayday(new Date(2026, 9, 1))).toBe(24);
  });

  it("en el día 25 apunta al siguiente mes", () => {
    expect(daysUntilNextPayday(new Date(2026, 9, 25))).toBe(31);
  });
});

describe("nextPaydayStr / cycleDays", () => {
  it("fecha del próximo pago", () => {
    expect(nextPaydayStr(new Date(2026, 9, 17))).toBe("2026-10-25");
    expect(nextPaydayStr(new Date(2026, 9, 25))).toBe("2026-11-25");
  });

  it("días del ciclo", () => {
    expect(cycleDays("2026-09")).toBe(30); // 25 sep → 24 oct
    expect(cycleDays("2026-01")).toBe(31); // 25 ene → 24 feb
  });
});

describe("splitByPct", () => {
  it("reparte exacto cuando los céntimos alcanzan", () => {
    const parts = splitByPct(10000, [
      { id: "a", pct: 20 },
      { id: "b", pct: 50 },
      { id: "c", pct: 30 },
    ]);
    expect(parts).toEqual([
      { id: "a", amountCents: 2000 },
      { id: "b", amountCents: 5000 },
      { id: "c", amountCents: 3000 },
    ]);
  });

  it("asigna el residuo al de mayor fracción", () => {
    const parts = splitByPct(10001, [
      { id: "a", pct: 20 },
      { id: "b", pct: 50 },
      { id: "c", pct: 30 },
    ]);
    const total = parts.reduce((s, p) => s + p.amountCents, 0);
    expect(total).toBe(10001);
    expect(parts.find((p) => p.id === "b")?.amountCents).toBe(5001);
  });

  it("no pierde céntimos con montos pequeños", () => {
    const parts = splitByPct(7, [
      { id: "a", pct: 20 },
      { id: "b", pct: 50 },
      { id: "c", pct: 30 },
    ]);
    const total = parts.reduce((s, p) => s + p.amountCents, 0);
    expect(total).toBe(7);
  });

  it("ignora porcentajes en cero y montos no positivos", () => {
    expect(splitByPct(0, [{ id: "a", pct: 100 }])).toEqual([]);
    const parts = splitByPct(1000, [
      { id: "a", pct: 100 },
      { id: "b", pct: 0 },
    ]);
    expect(parts).toEqual([{ id: "a", amountCents: 1000 }]);
  });
});
