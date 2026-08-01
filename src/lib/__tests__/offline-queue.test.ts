import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingQueue,
  enqueuePending,
  getPendingQueue,
  pendingCount,
  removePending,
} from "../offline-queue";
import type { CreateTransactionInput } from "../types";

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

const item = (clientId: string): CreateTransactionInput => ({
  type: "expense",
  amountCents: 100,
  clientId,
});

describe("offline-queue", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
  });

  it("encola y lee items", () => {
    enqueuePending(item("a"));
    enqueuePending(item("b"));
    expect(pendingCount()).toBe(2);
    expect(getPendingQueue().map((i) => i.clientId)).toEqual(["a", "b"]);
  });

  it("limpia la cola", () => {
    enqueuePending(item("a"));
    clearPendingQueue();
    expect(pendingCount()).toBe(0);
  });

  it("removePending elimina SOLO los items confirmados", () => {
    enqueuePending(item("a"));
    enqueuePending(item("b"));
    enqueuePending(item("c"));
    removePending([item("a"), item("c")]);
    expect(getPendingQueue().map((i) => i.clientId)).toEqual(["b"]);
  });

  it("removePending con lista vacía no borra nada", () => {
    enqueuePending(item("a"));
    removePending([]);
    expect(pendingCount()).toBe(1);
  });

  it("removePending de todos elimina la clave", () => {
    enqueuePending(item("a"));
    removePending([item("a")]);
    expect(getPendingQueue()).toEqual([]);
    expect(pendingCount()).toBe(0);
  });

  it("tolera localStorage corrupto", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "not-json{",
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    });
    expect(getPendingQueue()).toEqual([]);
    expect(pendingCount()).toBe(0);
  });
});
