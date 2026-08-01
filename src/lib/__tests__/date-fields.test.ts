import { describe, expect, it } from "vitest";
import {
  getIsoWeek,
  parseDate,
  toDateFields,
  todayStr,
} from "../date-fields";

describe("toDateFields", () => {
  it("calcula campos de fecha locales", () => {
    const f = toDateFields(new Date(2026, 7, 15, 21, 30)); // 15 ago 2026, 21:30
    expect(f.date).toBe("2026-08-15");
    expect(f.year).toBe(2026);
    expect(f.month).toBe(8);
    expect(f.quarter).toBe(3);
    expect(f.semester).toBe(2);
    expect(f.day).toBe(15);
    expect(f.dayOfWeek).toBe(6); // sábado
    expect(f.hour).toBe(21);
  });

  it("semestre 1 para meses <= 6", () => {
    expect(toDateFields(new Date(2026, 2, 1)).semester).toBe(1);
  });
});

describe("getIsoWeek", () => {
  it("semana ISO correcta", () => {
    expect(getIsoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(getIsoWeek(new Date(2026, 7, 15))).toBe(33);
  });
});

describe("parseDate / todayStr", () => {
  it("parsea YYYY-MM-DD a medianoche local", () => {
    const d = parseDate("2026-08-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it("todayStr tiene formato YYYY-MM-DD", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
