"use client";

import { useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryIcon } from "@/components/category-icon";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { DAY_NAMES, formatDayMonth, todayStr } from "@/lib/date-fields";
import { cn } from "@/lib/cn";

const FREQ_LABELS = {
  weekly: "Semanal",
  monthly: "Mensual",
  yearly: "Anual",
} as const;

function freqDetail(frequency: keyof typeof FREQ_LABELS, chargeDay: number): string {
  if (frequency === "weekly") return `Cada ${DAY_NAMES[chargeDay]}`;
  if (frequency === "yearly") return "Una vez al año";
  return `Día ${chargeDay} de cada mes`;
}

export function FixedExpensesScreen() {
  const utils = trpc.useUtils();
  const { data: current } = trpc.cycles.current.useQuery({ today: todayStr() });
  const cycleKey = current?.cycleKey;
  const { data: data, isLoading } = trpc.fixedExpenses.list.useQuery(
    { cycleKey: cycleKey! },
    { enabled: !!cycleKey },
  );
  const { data: categories = [] } = trpc.categories.list.useQuery();

  const create = trpc.fixedExpenses.create.useMutation();
  const update = trpc.fixedExpenses.update.useMutation();
  const setActive = trpc.fixedExpenses.setActive.useMutation();
  const remove = trpc.fixedExpenses.remove.useMutation();
  const markPaid = trpc.fixedExpenses.markPaid.useMutation();
  const unmarkPaid = trpc.fixedExpenses.unmarkPaid.useMutation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const items = data?.items ?? [];
  const expenseCats = categories.filter((c) => c.type === "expense" && c.isActive);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [chargeDay, setChargeDay] = useState("1");
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidateAll = () => {
    void utils.fixedExpenses.list.invalidate();
    void utils.cycles.overview.invalidate();
  };
  const invalidateTxs = () => {
    void utils.transactions.recent.invalidate();
    void utils.transactions.list.invalidate();
    void utils.analytics.summary.invalidate();
  };

  const startEdit = (id: string) => {
    const fe = items.find((x) => x.id === id);
    if (!fe) return;
    setEditingId(id);
    setName(fe.name);
    setAmount(String(fe.amountCents / 100));
    setCategoryId(fe.categoryId ?? "");
    setFrequency(fe.frequency as "weekly" | "monthly" | "yearly");
    setChargeDay(String(fe.chargeDay));
    setExpandedId(id);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoneyToCents(amount);
    if (!cents || cents <= 0 || !name.trim()) return;
    const payload = {
      name: name.trim(),
      amountCents: cents,
      categoryId: categoryId || null,
      frequency,
      chargeDay: Number(chargeDay),
    };
    if (editingId) {
      update.mutate(
        { id: editingId, ...payload },
        { onSuccess: () => { resetForm(); invalidateAll(); } },
      );
    } else {
      create.mutate(
        payload,
        { onSuccess: () => { resetForm(); invalidateAll(); } },
      );
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setAmount("");
    setCategoryId("");
    setFrequency("monthly");
    setChargeDay("1");
  };

  const mark = (id: string, date: string) => {
    setActionError(null);
    markPaid.mutate(
      { id, date },
      {
        onSuccess: () => {
          invalidateAll();
          invalidateTxs();
        },
        onError: () => setActionError("No se pudo registrar el pago. Intenta de nuevo."),
      },
    );
  };

  const unmark = (transactionId: string) => {
    setActionError(null);
    unmarkPaid.mutate(
      { transactionId },
      {
        onSuccess: () => {
          invalidateAll();
          invalidateTxs();
        },
        onError: () => setActionError("No se pudo deshacer el pago. Intenta de nuevo."),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Gastos fijos</h1>
        <p className="text-sm text-slate-500">
          {current
            ? `Ciclo ${current.label} · marca cada cobro cuando lo pagas`
            : "Suscripciones y pagos recurrentes"}
        </p>
      </header>

      {data ? (
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] font-medium text-slate-400">Esperado del ciclo</p>
              <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-800">
                {formatMoney(data.totals.expectedCents)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400">Pagado</p>
              <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-emerald-600">
                {formatMoney(data.totals.paidCents)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400">Pendiente</p>
              <p
                className={cn(
                  "mt-0.5 truncate text-sm font-bold tabular-nums",
                  data.totals.pendingCents > 0 ? "text-amber-600" : "text-slate-800",
                )}
              >
                {formatMoney(data.totals.pendingCents)}
              </p>
            </div>
          </div>
          <Progress
            value={
              data.totals.expectedCents > 0
                ? (data.totals.paidCents / data.totals.expectedCents) * 100
                : 0
            }
            tone="indigo"
            className="mt-3"
          />
          <p className="mt-1.5 text-[11px] text-slate-400">
            {formatDayMonth(data.start)} – {formatDayMonth(data.end)} · los cobros fuera de este rango pertenecen a otro ciclo
          </p>
        </Card>
      ) : null}

      {actionError ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600" role="alert">
          {actionError}
        </p>
      ) : null}

      <Card>
        <CardHeader
          title={editingId ? "Editar gasto fijo" : "Nuevo gasto fijo"}
          subtitle="Internet, Netflix, gimnasio…"
        />
        <form onSubmit={submit} className="flex flex-col gap-3 px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (ej. Netflix)"
              maxLength={60}
              aria-label="Nombre del gasto fijo"
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="S/ 34.90"
              aria-label="Monto del gasto fijo"
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-500"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Categoría"
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">Sin categoría</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly" | "yearly")}
              aria-label="Frecuencia"
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
            >
              {(["monthly", "weekly", "yearly"] as const).map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABELS[f]}
                </option>
              ))}
            </select>
            <input
              value={chargeDay}
              onChange={(e) => setChargeDay(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={2}
              placeholder={frequency === "weekly" ? "Día semana (0-6)" : "Día de cobro"}
              aria-label={frequency === "weekly" ? "Día de la semana (0 domingo a 6 sábado)" : "Día de cobro del mes"}
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-500"
            />
          </div>
          {frequency === "weekly" ? (
            <p className="text-xs text-slate-400">
              Semanal: 0 = domingo, 1 = lunes … 6 = sábado.
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="md" disabled={!name.trim() || !(parseMoneyToCents(amount) ?? 0) || create.isPending || update.isPending}>
              <Plus className="size-4" aria-hidden />
              {editingId ? "Guardar" : "Agregar"}
            </Button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-slate-400 hover:text-slate-600"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </Card>

      {isLoading || !data ? (
        <Card className="p-8 text-center text-sm text-slate-400">Cargando gastos fijos…</Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">
          Sin gastos fijos todavía. Agrega tu primera suscripción.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((fe) => {
            const expanded = expandedId === fe.id;
            const paidDates = new Set(fe.paidEntries.map((p) => p.date));
            const paidByDate = new Map(fe.paidEntries.map((p) => [p.date, p.transactionId]));
            const pct =
              fe.expectedCents > 0 ? (fe.paidCents / fe.expectedCents) * 100 : 0;
            return (
              <li key={fe.id}>
                <Card className={cn("px-4 py-3", !fe.isActive && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-xl"
                      style={{ backgroundColor: `${fe.categoryColor ?? "#94a3b8"}1f` }}
                    >
                      <CategoryIcon
                        name={fe.categoryIcon}
                        className="size-4.5"
                        style={{ color: fe.categoryColor ?? "#94a3b8" }}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{fe.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {fe.categoryName ?? "Sin categoría"} · {FREQ_LABELS[fe.frequency as keyof typeof FREQ_LABELS]} · {freqDetail(fe.frequency as keyof typeof FREQ_LABELS, fe.chargeDay)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                      {formatMoney(fe.amountCents)}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => startEdit(fe.id)}
                        aria-label={`Editar ${fe.name}`}
                        className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        onClick={() => setActive.mutate({ id: fe.id, isActive: !fe.isActive }, { onSuccess: invalidateAll })}
                        role="switch"
                        aria-checked={fe.isActive}
                        aria-label={`Activar ${fe.name}`}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors",
                          fe.isActive ? "bg-indigo-600" : "bg-slate-300",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                            fe.isActive ? "left-[22px]" : "left-0.5",
                          )}
                        />
                      </button>
                      <button
                        onClick={() => remove.mutate({ id: fe.id }, { onSuccess: invalidateAll })}
                        aria-label={`Eliminar ${fe.name}`}
                        className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-3">
                    <Progress value={pct} tone={pct >= 100 ? "emerald" : "indigo"} className="flex-1" />
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">
                      {formatMoney(fe.paidCents)} de {formatMoney(fe.expectedCents)}
                    </span>
                  </div>

                  <button
                    onClick={() => setExpandedId(expanded ? null : fe.id)}
                    aria-expanded={expanded}
                    className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600"
                  >
                    <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} aria-hidden />
                    {fe.expectedCount === 0
                      ? "Sin cobros en este ciclo"
                      : `${fe.expectedCount} cobro${fe.expectedCount === 1 ? "" : "s"} en este ciclo`}
                  </button>

                  {expanded ? (
                    <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-slate-50/70 px-3">
                      {fe.expectedDates.length === 0 ? (
                        <li className="py-2.5 text-xs text-slate-400">
                          Este gasto no tiene cobros programados dentro del ciclo.
                        </li>
                      ) : (
                        fe.expectedDates.map((d) => {
                          const isPaid = paidDates.has(d);
                          const txId = paidByDate.get(d);
                          return (
                            <li key={d} className="flex items-center justify-between gap-2 py-2">
                              <span className="flex items-center gap-2 text-xs text-slate-600">
                                <CalendarClock className="size-3.5 text-slate-400" aria-hidden />
                                {formatDayMonth(d)}
                                {isPaid ? (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    Pagado
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                    Pendiente
                                  </span>
                                )}
                              </span>
                              {isPaid && txId ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => unmark(txId)}
                                  disabled={unmarkPaid.isPending}
                                >
                                  <Undo2 className="size-3.5" aria-hidden /> Deshacer
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => mark(fe.id, d)}
                                  disabled={markPaid.isPending}
                                >
                                  <Check className="size-3.5" aria-hidden /> Marcar pagado
                                </Button>
                              )}
                            </li>
                          );
                        })
                      )}
                      {fe.paidEntries.some((p) => !fe.expectedDates.includes(p.date)) ? (
                        <li className="py-2.5 text-[11px] text-slate-400">
                          Hay pagos registrados en fechas fuera de la programación de este ciclo.
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
