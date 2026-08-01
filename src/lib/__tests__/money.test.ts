import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber, parseMoneyToCents } from "../money";

describe("parseMoneyToCents", () => {
  it("parsea decimales con punto", () => {
    expect(parseMoneyToCents("12.50")).toBe(1250);
  });

  it("parsea decimales con coma", () => {
    expect(parseMoneyToCents("12,50")).toBe(1250);
  });

  it("parsea enteros", () => {
    expect(parseMoneyToCents("7")).toBe(700);
  });

  it("parsea prefijo de moneda", () => {
    expect(parseMoneyToCents("S/ 12")).toBe(1200);
  });

  it("parsea cero", () => {
    expect(parseMoneyToCents("0")).toBe(0);
  });

  it("rechaza negativos", () => {
    expect(parseMoneyToCents("-5")).toBeNull();
  });

  it("rechaza doble separador", () => {
    expect(parseMoneyToCents("12.5.6")).toBeNull();
  });

  it("rechaza texto", () => {
    expect(parseMoneyToCents("abc")).toBeNull();
  });

  it("redondea a céntimos", () => {
    expect(parseMoneyToCents("1.999")).toBe(200);
  });
});

describe("formatMoney / formatNumber", () => {
  it("formatea moneda soles", () => {
    expect(formatMoney(123456)).toContain("1,234.56");
  });

  it("formatea número sin decimales cuando es entero", () => {
    expect(formatNumber(700)).toBe("7");
  });

  it("formatea número con decimales", () => {
    expect(formatNumber(1250)).toBe("12.50");
  });
});
