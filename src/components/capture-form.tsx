"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useUiStore } from "@/store/ui-store";
import { useSaveTransaction } from "@/hooks/use-save-transaction";
import { formatNumber, parseMoneyToCents } from "@/lib/money";
import { todayStr } from "@/lib/date-fields";
import type { TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";
import { CategoryIcon } from "./category-icon";

export function CaptureForm() {
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [concept, setConcept] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saved, setSaved] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const { lastCategoryId, setLastCategory } = useUiStore();
  const { data: categories = [] } = trpc.categories.list.useQuery();
  const { save } = useSaveTransaction();

  const list = useMemo(
    () => categories.filter((c) => c.type === type && c.isActive),
    [categories, type],
  );

  const effectiveCategory =
    categoryId && list.some((c) => c.id === categoryId)
      ? categoryId
      : lastCategoryId[type] && list.some((c) => c.id === lastCategoryId[type])
        ? lastCategoryId[type]
        : (list[0]?.id ?? null);

  const cents = parseMoneyToCents(amount);
  const canSave = cents !== null && cents > 0 && effectiveCategory !== null;

  const switchType = (t: TransactionType) => {
    setType(t);
    setCategoryId(null);
    amountRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const ok = await save({
      type,
      amountCents: cents!,
      categoryId: effectiveCategory,
      concept: concept.trim() || null,
      note: note.trim() || null,
      date: showAdvanced && date ? date : undefined,
    });
    if (ok.ok) {
      if (effectiveCategory) setLastCategory(type, effectiveCategory);
      setAmount("");
      setConcept("");
      setNote("");
      setSaved(true);
      navigator.vibrate?.(12);
      setTimeout(() => setSaved(false), 1200);
      amountRef.current?.focus();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      aria-label="Registrar transacción"
    >
      <div
        className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1"
        role="tablist"
        aria-label="Tipo de transacción"
      >
        <button
          type="button"
          role="tab"
          aria-selected={type === "expense"}
          onClick={() => switchType("expense")}
          className={cn(
            "rounded-xl py-2.5 text-sm font-semibold transition-colors",
            type === "expense"
              ? "bg-white text-rose-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          Gasto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={type === "income"}
          onClick={() => switchType("income")}
          className={cn(
            "rounded-xl py-2.5 text-sm font-semibold transition-colors",
            type === "income"
              ? "bg-white text-emerald-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          Ingreso
        </button>
      </div>

      <label className="block">
        <span className="sr-only">Monto</span>
        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl border-2 bg-white px-4 transition-colors",
            saved ? "border-emerald-500" : "border-slate-200 focus-within:border-indigo-500",
          )}
        >
          <span className="text-2xl font-bold text-slate-400">S/</span>
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0.00"
            aria-label="Monto en soles"
            className="w-full bg-transparent py-4 text-4xl font-bold text-slate-900 outline-none placeholder:text-slate-300 tabular-nums"
          />
          {saved ? <Check className="size-7 text-emerald-500" aria-hidden /> : null}
        </div>
      </label>

      <fieldset>
        <legend className="sr-only">Categoría</legend>
        <div className="grid grid-cols-4 gap-2">
          {list.map((c) => {
            const selected = c.id === effectiveCategory;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border-2 bg-white px-1 py-3 transition-all",
                  selected
                    ? "border-transparent shadow-sm"
                    : "border-slate-200 hover:border-slate-300",
                )}
                style={selected ? { backgroundColor: `${c.color}1a`, borderColor: c.color } : undefined}
              >
                <CategoryIcon name={c.icon} className="size-5" style={{ color: c.color }} />
                <span
                  className={cn(
                    "text-[11px] leading-tight text-center",
                    selected ? "font-semibold text-slate-800" : "text-slate-600",
                  )}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <input
          type="text"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="¿En qué fue? (opcional)"
          maxLength={120}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")} />
          Más opciones
        </button>
        {showAdvanced ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Fecha</span>
              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Nota</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observaciones"
                maxLength={1000}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </label>
          </div>
        ) : null}
      </div>

      <Button
        type="submit"
        size="xl"
        variant={type === "expense" ? "primary" : "success"}
        disabled={!canSave}
        className="w-full"
      >
        <Plus className="size-6" aria-hidden />
        {saved ? "¡Guardado!" : "Guardar"}
      </Button>
      <p className="text-center text-xs text-slate-400">
        {canSave
          ? `Se guardará ${formatNumber(cents!)} soles`
          : "Ingresa el monto y elige la categoría"}
      </p>
    </form>
  );
}
