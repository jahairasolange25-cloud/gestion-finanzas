"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { formatMoney, formatPercent, parseMoneyToCents } from "@/lib/money";
import { MONTH_NAMES } from "@/lib/date-fields";
import { cn } from "@/lib/cn";

export function BudgetsScreen() {
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const monthLabel = `${
    MONTH_NAMES[(now.getMonth() + offset + 12) % 12]
  } ${now.getFullYear() + Math.floor((now.getMonth() + offset) / 12)}`;

  const { year, month } = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  })();

  const utils = trpc.useUtils();
  const { data, isPending } = trpc.budgets.list.useQuery({ year, month });
  const upsert = trpc.budgets.upsert.useMutation();
  const setActive = trpc.budgets.setActive.useMutation();
  const remove = trpc.budgets.remove.useMutation();

  const { data: categories = [] } = trpc.categories.list.useQuery();
  const expenseCats = categories.filter((c) => c.type === "expense" && c.isActive);

  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => {
    void utils.budgets.list.invalidate();
  };

  const budgets = data?.rows ?? [];
  const active = budgets.filter((b) => b.isActive);
  const budgetTotal = active.reduce((a, b) => a + b.amountCents, 0);
  const spentTotal = active.reduce((a, b) => a + b.spentCents, 0);
  const overCount = budgets.filter((b) => b.status === "over").length;
  const nearCount = budgets.filter((b) => b.status === "near").length;

  const startEdit = (id: string) => {
    const b = budgets.find((x) => x.id === id);
    if (!b) return;
    setEditingId(id);
    setCategoryId(b.categoryId);
    setAmount(String(b.amountCents / 100));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoneyToCents(amount);
    if (!cents || cents <= 0 || !categoryId) return;
    upsert.mutate(
      { categoryId, amountCents: cents },
      {
        onSuccess: () => {
          setAmount("");
          setCategoryId("");
          setEditingId(null);
          invalidate();
        },
      },
    );
  };

  const categoriesWithBudget = new Set(budgets.map((b) => b.categoryId));
  const available = expenseCats.filter((c) => !categoriesWithBudget.has(c.id));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Presupuestos</h1>
          <p className="text-sm text-slate-500">Límite mensual por categoría</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-slate-700">
            {monthLabel}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset === 0}
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </header>

      {overCount + nearCount > 0 && offset === 0 ? (
        <div className="flex flex-col gap-2" role="status">
          {overCount > 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {overCount} presupuesto{overCount > 1 ? "s" : ""} superado{overCount > 1 ? "s" : ""} este mes
            </p>
          ) : null}
          {nearCount > 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {nearCount} presupuesto{nearCount > 1 ? "s" : ""} al {">"}80% este mes
            </p>
          ) : null}
        </div>
      ) : null}

      {budgetTotal > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          <SummaryStat label="Presupuestado" value={formatMoney(budgetTotal)} tone="text-slate-800" />
          <SummaryStat
            label="Gastado"
            value={formatMoney(spentTotal)}
            tone={spentTotal > budgetTotal ? "text-rose-600" : "text-slate-800"}
          />
          <SummaryStat
            label="Disponible"
            value={formatMoney(budgetTotal - spentTotal)}
            tone={budgetTotal - spentTotal >= 0 ? "text-emerald-600" : "text-rose-600"}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={editingId ? "Editar presupuesto" : "Nuevo presupuesto"}
          subtitle={editingId ? undefined : "Alerta al 80% y 100% del límite"}
        />
        <form onSubmit={submit} className="flex flex-col gap-3 px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={editingId !== null}
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-100"
              aria-label="Categoría"
            >
              <option value="">
                {editingId ? "Categoría del presupuesto" : "Selecciona una categoría…"}
              </option>
              {(editingId ? expenseCats : available).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="S/ 500"
              aria-label="Monto del presupuesto"
              className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-500 sm:w-32"
            />
            <Button type="submit" size="md" disabled={!categoryId || !(parseMoneyToCents(amount) ?? 0) || upsert.isPending}>
              {upsert.isPending ? "…" : editingId ? "Guardar" : "Agregar"}
            </Button>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setCategoryId("");
                setAmount("");
              }}
              className="self-start text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              Cancelar edición
            </button>
          ) : null}
        </form>
      </Card>

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">
          {offset === 0
            ? "Sin presupuestos todavía. Crea uno para empezar a controlar tu gasto por categoría."
            : `Sin presupuestos en ${monthLabel}.`}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {budgets.map((b) => (
            <li key={b.id}>
              <BudgetCard
                name={b.categoryName ?? "Sin categoría"}
                icon={b.categoryIcon}
                color={b.categoryColor}
                amountCents={b.amountCents}
                spentCents={b.spentCents}
                status={b.status}
                isActive={b.isActive}
                onEdit={() => startEdit(b.id)}
                onToggle={(v) =>
                  setActive.mutate({ id: b.id, isActive: v }, { onSuccess: invalidate })
                }
                onRemove={() => remove.mutate({ id: b.id }, { onSuccess: invalidate })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="px-3 py-3">
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold tabular-nums ${tone}`}>{value}</p>
    </Card>
  );
}

function BudgetCard({
  name,
  icon,
  color,
  amountCents,
  spentCents,
  status,
  isActive,
  onEdit,
  onToggle,
  onRemove,
}: {
  name: string;
  icon: string | null;
  color: string | null;
  amountCents: number;
  spentCents: number;
  status: "ok" | "near" | "over";
  isActive: boolean;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onRemove: () => void;
}) {
  const pct = amountCents > 0 ? Math.min(100, (spentCents / amountCents) * 100) : 0;
  const barColor =
    status === "over" ? "bg-rose-500" : status === "near" ? "bg-amber-500" : "bg-indigo-500";
  const badge =
    status === "over"
      ? { text: "Superado", cls: "bg-rose-50 text-rose-600" }
      : status === "near"
        ? { text: "Cerca del límite", cls: "bg-amber-50 text-amber-600" }
        : { text: "En límite", cls: "bg-emerald-50 text-emerald-600" };

  return (
    <Card className={cn("px-4 py-3.5", !isActive && "opacity-60")}>
      <div className="flex items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${color ?? "#94a3b8"}1f` }}
        >
          <CategoryIcon name={icon} className="size-4.5" style={{ color: color ?? "#94a3b8" }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", badge.cls)}>
              {badge.text}
            </span>
          </div>
          <p className="text-xs tabular-nums text-slate-500">
            <span className={cn("font-semibold", status === "over" ? "text-rose-600" : "text-slate-800")}>
              {formatMoney(spentCents)}
            </span>{" "}
            de {formatMoney(amountCents)} · {formatPercent(spentCents, amountCents)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onEdit}
            aria-label={`Editar presupuesto de ${name}`}
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => onToggle(!isActive)}
            role="switch"
            aria-checked={isActive}
            aria-label={`Activar presupuesto de ${name}`}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              isActive ? "bg-indigo-600" : "bg-slate-300",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                isActive ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
          <button
            onClick={onRemove}
            aria-label={`Eliminar presupuesto de ${name}`}
            className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso del presupuesto de ${name}`}
      >
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}
