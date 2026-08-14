"use client";

import { useState } from "react";
import { CalendarClock, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { DAY_NAMES, MONTH_NAMES } from "@/lib/date-fields";
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
  const { data: items = [] } = trpc.fixedExpenses.list.useQuery();
  const { data: categories = [] } = trpc.categories.list.useQuery();
  const create = trpc.fixedExpenses.create.useMutation();
  const update = trpc.fixedExpenses.update.useMutation();
  const setActive = trpc.fixedExpenses.setActive.useMutation();
  const remove = trpc.fixedExpenses.remove.useMutation();
  const generate = trpc.fixedExpenses.generateMonth.useMutation();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { data: preview } = trpc.fixedExpenses.monthPreview.useQuery({ year, month });
  const [done, setDone] = useState<string | null>(null);

  const expenseCats = categories.filter((c) => c.type === "expense" && c.isActive);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [chargeDay, setChargeDay] = useState("1");
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidateAll = () => {
    void utils.fixedExpenses.list.invalidate();
    void utils.fixedExpenses.monthPreview.invalidate();
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
    setFrequency(fe.frequency);
    setChargeDay(String(fe.chargeDay));
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const generateMonth = () => {
    generate.mutate(
      { year, month },
      {
        onSuccess: (res) => {
          invalidateAll();
          invalidateTxs();
          setDone(
            res.created > 0
              ? `${res.created} transacción${res.created > 1 ? "es" : ""} creada${res.created > 1 ? "s" : ""}${res.skipped > 0 ? ` · ${res.skipped} ya existían` : ""}`
              : `Nada que generar · ${res.skipped} ya existían`,
          );
          setTimeout(() => setDone(null), 5000);
        },
      },
    );
  };

  const monthLabel = MONTH_NAMES[month - 1];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Gastos fijos</h1>
        <p className="text-sm text-slate-500">Suscripciones y pagos recurrentes</p>
      </header>

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

      <Card>
        <CardHeader
          title={`Cobros de ${monthLabel}`}
          subtitle={
            preview
              ? `${preview.count} cobro${preview.count === 1 ? "" : "s"} · ${formatMoney(preview.totalCents)}`
              : "Proyección del mes"
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={generateMonth}
              disabled={generate.isPending || (preview?.count ?? 0) === 0}
            >
              <Sparkles className="size-3.5" aria-hidden />
              {generate.isPending ? "Generando…" : "Generar transacciones"}
            </Button>
          }
        />
        {preview && preview.items.length > 0 ? (
          <ul className="px-4 pb-4">
            {preview.items.map((i) => (
              <li
                key={i.clientId}
                className="flex items-center justify-between gap-2 border-t border-slate-100 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CalendarClock className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span className="truncate text-slate-700">{i.name}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {i.date.slice(8)} · <span className="font-semibold text-slate-700">{formatMoney(i.amountCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-4 text-sm text-slate-400">
            Sin gastos fijos activos para este mes.
          </p>
        )}
        {done ? (
          <p className="px-4 pb-4 text-xs font-semibold text-emerald-600" role="status">
            {done}
          </p>
        ) : null}
      </Card>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">
          Sin gastos fijos todavía. Agrega tu primera suscripción.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((fe) => {
            const cat = fe.categoryId
              ? { name: fe.categoryName, icon: fe.categoryIcon, color: fe.categoryColor }
              : { name: null, icon: null, color: null };
            return (
              <li key={fe.id}>
                <Card className={cn("flex items-center gap-3 px-4 py-3", !fe.isActive && "opacity-60")}>
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: `${cat.color ?? "#94a3b8"}1f` }}
                  >
                    <CategoryIcon name={cat.icon} className="size-4.5" style={{ color: cat.color ?? "#94a3b8" }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{fe.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {cat.name ?? "Sin categoría"} · {FREQ_LABELS[fe.frequency]} · {freqDetail(fe.frequency, fe.chargeDay)}
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
                      <Pencil className="size-4" />
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
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
