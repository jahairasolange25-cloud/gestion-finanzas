"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { formatMoney, formatPercent, parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/cn";

const ICONS = [
  "piggy-bank", "target", "plane", "laptop", "home", "shopping-bag",
  "heart-pulse", "graduation-cap", "gift", "coffee", "store", "zap",
];

const COLORS = [
  "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899",
  "#14b8a6", "#a855f7", "#06b6d4", "#84cc16", "#f43f5e", "#64748b",
];

function deadlineLabel(deadline: string | null): string {
  if (!deadline) return "Sin fecha límite";
  const [y, m] = deadline.split("-").map(Number);
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `Meta: ${names[m - 1]} ${y}`;
}

export function GoalsScreen() {
  const utils = trpc.useUtils();
  const { data: goals = [] } = trpc.goals.list.useQuery();
  const create = trpc.goals.create.useMutation();
  const update = trpc.goals.update.useMutation();
  const setActive = trpc.goals.setActive.useMutation();
  const remove = trpc.goals.remove.useMutation();
  const deposit = trpc.goals.deposit.useMutation();
  const withdraw = trpc.goals.withdraw.useMutation();

  const invalidate = () => {
    void utils.goals.list.invalidate();
  };

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [icon, setIcon] = useState("piggy-bank");
  const [color, setColor] = useState(COLORS[0]);
  const [deadline, setDeadline] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Card + monto que se está abonando/retirando. */
  const [movement, setMovement] = useState<{ id: string; mode: "deposit" | "withdraw" } | null>(null);
  const [amount, setAmount] = useState("");

  const startEdit = (id: string) => {
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    setEditingId(id);
    setName(g.name);
    setTarget(String(g.targetCents / 100));
    setIcon(g.icon);
    setColor(g.color);
    setDeadline(g.deadline ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setTarget("");
    setIcon("piggy-bank");
    setColor(COLORS[0]);
    setDeadline("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoneyToCents(target);
    if (!cents || cents <= 0 || !name.trim()) return;
    const payload = {
      name: name.trim(),
      targetCents: cents,
      icon,
      color,
      deadline: deadline || null,
    };
    if (editingId) {
      update.mutate(
        { id: editingId, ...payload },
        { onSuccess: () => { resetForm(); invalidate(); } },
      );
    } else {
      create.mutate(
        payload,
        { onSuccess: () => { resetForm(); invalidate(); } },
      );
    }
  };

  const applyMovement = () => {
    if (!movement) return;
    const cents = parseMoneyToCents(amount);
    if (!cents || cents <= 0) return;
    const mutate = movement.mode === "deposit" ? deposit : withdraw;
    mutate.mutate(
      { id: movement.id, amountCents: cents },
      {
        onSuccess: () => {
          setMovement(null);
          setAmount("");
          invalidate();
        },
      },
    );
  };

  const activeGoals = goals.filter((g) => g.isActive);
  const totalSaved = activeGoals.reduce((a, g) => a + g.currentCents, 0);
  const totalTarget = activeGoals.reduce((a, g) => a + g.targetCents, 0);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Metas de ahorro</h1>
        <p className="text-sm text-slate-500">Laptop, viaje, emergencias…</p>
      </header>

      {activeGoals.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="px-3 py-3">
            <p className="text-[11px] font-medium text-slate-400">Ahorrado</p>
            <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-emerald-600">
              {formatMoney(totalSaved)}
            </p>
          </Card>
          <Card className="px-3 py-3">
            <p className="text-[11px] font-medium text-slate-400">Progreso total</p>
            <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-800">
              {formatPercent(totalSaved, totalTarget)}
            </p>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={editingId ? "Editar meta" : "Nueva meta"}
          subtitle="Define cuánto quieres ahorrar"
        />
        <form onSubmit={submit} className="flex flex-col gap-3 px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (ej. Viaje a Cusco)"
              maxLength={60}
              aria-label="Nombre de la meta"
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
            />
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder="Monto objetivo (S/)"
              aria-label="Monto objetivo"
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                aria-label={`Icono ${i}`}
                aria-pressed={icon === i}
                className={cn(
                  "grid size-9 place-items-center rounded-lg border transition-colors",
                  icon === i ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500 hover:border-slate-300",
                )}
              >
                <CategoryIcon name={i} className="size-4" />
              </button>
            ))}
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className={cn(
                  "size-9 rounded-lg border-2",
                  color === c ? "border-slate-900" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Fecha límite"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
            />
            <Button type="submit" size="md" disabled={!name.trim() || !(parseMoneyToCents(target) ?? 0) || create.isPending || update.isPending}>
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

      {goals.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">
          Sin metas todavía. Crea tu primera meta de ahorro.
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const pct = g.targetCents > 0 ? Math.min(100, (g.currentCents / g.targetCents) * 100) : 0;
            const done = g.currentCents >= g.targetCents;
            return (
              <li key={g.id} className={cn(g.isActive ? "" : "opacity-60")}>
                <Card className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="grid size-10 place-items-center rounded-xl"
                      style={{ backgroundColor: `${g.color}1f` }}
                    >
                      <CategoryIcon name={g.icon} className="size-5" style={{ color: g.color }} />
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => startEdit(g.id)}
                        aria-label={`Editar ${g.name}`}
                        className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => setActive.mutate({ id: g.id, isActive: !g.isActive }, { onSuccess: invalidate })}
                        role="switch"
                        aria-checked={g.isActive}
                        aria-label={`Activar ${g.name}`}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors",
                          g.isActive ? "bg-indigo-600" : "bg-slate-300",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                            g.isActive ? "left-[22px]" : "left-0.5",
                          )}
                        />
                      </button>
                      <button
                        onClick={() => remove.mutate({ id: g.id }, { onSuccess: invalidate })}
                        aria-label={`Eliminar ${g.name}`}
                        className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-sm font-bold text-slate-800">{g.name}</p>
                  <p className="text-xs text-slate-400">{deadlineLabel(g.deadline)}</p>

                  <div className="mt-3 flex-1">
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className={cn("font-bold tabular-nums", done ? "text-emerald-600" : "text-slate-800")}>
                        {formatMoney(g.currentCents)}
                      </span>
                      <span className="text-slate-400">
                        de {formatMoney(g.targetCents)} · {formatPercent(g.currentCents, g.targetCents)}
                      </span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-valuenow={Math.round(pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progreso de ${g.name}`}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: g.color }}
                      />
                    </div>
                  </div>

                  {movement?.id === g.id ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        inputMode="decimal"
                        autoFocus
                        placeholder={movement.mode === "deposit" ? "Monto a abonar" : "Monto a retirar"}
                        aria-label={movement.mode === "deposit" ? "Monto a abonar" : "Monto a retirar"}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm tabular-nums outline-none focus:border-indigo-500"
                      />
                      <Button
                        size="sm"
                        variant={movement.mode === "deposit" ? "success" : "secondary"}
                        onClick={applyMovement}
                        disabled={!(parseMoneyToCents(amount) ?? 0) || deposit.isPending || withdraw.isPending}
                      >
                        OK
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setMovement(null)}>
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        className="flex-1"
                        onClick={() => { setMovement({ id: g.id, mode: "deposit" }); setAmount(""); }}
                      >
                        <ArrowDownToLine className="size-3.5" aria-hidden /> Abonar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        disabled={g.currentCents <= 0}
                        onClick={() => { setMovement({ id: g.id, mode: "withdraw" }); setAmount(""); }}
                      >
                        <ArrowUpFromLine className="size-3.5" aria-hidden /> Retirar
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
