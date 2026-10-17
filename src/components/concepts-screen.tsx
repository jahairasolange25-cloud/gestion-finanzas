"use client";

import { useState } from "react";
import { Check, ChevronDown, CopyPlus, Pencil, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Progress, type ProgressTone } from "./ui/progress";
import { CategoryIcon } from "./category-icon";
import { TransactionList } from "./transaction-list";
import { formatMoney, formatNumber, parseMoneyToCents } from "@/lib/money";
import { todayStr } from "@/lib/date-fields";
import { cn } from "@/lib/cn";

type Row = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  budgetId: string | null;
  amountCents: number;
  carryCents: number;
  availableCents: number;
  spentCents: number;
  remainingCents: number;
  pct: number;
  status: "ok" | "near" | "over";
};

const statusTone: Record<Row["status"], ProgressTone> = {
  ok: "emerald",
  near: "amber",
  over: "rose",
};

const statusLabel: Record<Row["status"], string> = {
  ok: "En rango",
  near: "Cerca del límite",
  over: "Excedido",
};

export function ConceptsScreen() {
  const utils = trpc.useUtils();
  const [copied, setCopied] = useState<number | null>(null);

  const { data: current } = trpc.cycles.current.useQuery({ today: todayStr() });
  const cycleKey = current?.cycleKey;
  const { data, isLoading } = trpc.budgets.list.useQuery(
    { cycleKey: cycleKey! },
    { enabled: !!cycleKey },
  );

  const copyPrev = trpc.budgets.copyPrevious.useMutation();

  const invalidate = () => {
    void utils.budgets.list.invalidate();
    void utils.cycles.overview.invalidate();
  };

  const rows = data?.rows ?? [];
  const withMeta = rows.filter((r) => r.budgetId !== null);
  const withoutMeta = rows.filter((r) => r.budgetId === null);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gastos personales</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {current
              ? `Ciclo ${current.label} · define cuánto quieres gastar en cada concepto`
              : "Cargando ciclo…"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={!cycleKey || copyPrev.isPending}
            onClick={() => {
              if (!cycleKey) return;
              copyPrev.mutate(
                { cycleKey },
                {
                  onSuccess: (res) => {
                    setCopied(res.created);
                    invalidate();
                    setTimeout(() => setCopied(null), 2500);
                  },
                },
              );
            }}
          >
            <CopyPlus className="size-4" aria-hidden />
            {copyPrev.isPending ? "Copiando…" : "Copiar metas del ciclo anterior"}
          </Button>
          {copied !== null ? (
            <p className="text-[11px] font-medium text-emerald-600">
              {copied > 0
                ? `Se copiaron ${copied} meta${copied === 1 ? "" : "s"}`
                : "No había metas nuevas por copiar"}
            </p>
          ) : null}
        </div>
      </header>

      {data ? (
        <Card className="grid grid-cols-3 gap-3 p-4">
          <Stat label="Meta del ciclo" value={formatMoney(data.totals.metaCents)} />
          <Stat label="Consumido" value={formatMoney(data.totals.spentCents)} tone="rose" />
          <Stat
            label={data.totals.spentCents > data.totals.metaCents ? "Excedido" : "Te queda"}
            value={formatMoney(Math.abs(data.totals.metaCents - data.totals.spentCents))}
            tone={data.totals.spentCents > data.totals.metaCents ? "rose" : "emerald"}
          />
        </Card>
      ) : null}

      {isLoading || !data ? (
        <Card className="p-8 text-center text-sm text-slate-400">Cargando conceptos…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          No hay categorías de gasto activas. Créalas en Ajustes.
        </Card>
      ) : (
        <>
          <section aria-label="Conceptos con meta">
            <h2 className="mb-2 px-1 text-sm font-semibold text-slate-700">
              Con meta en este ciclo
            </h2>
            {withMeta.length === 0 ? (
              <Card className="p-6 text-center text-sm text-slate-400">
                Aún no defines metas en este ciclo. Toca un concepto para asignarle una.
              </Card>
            ) : (
              <Card className="divide-y divide-slate-100">
                {withMeta.map((row) => (
                  <ConceptRow key={row.categoryId} row={row} cycleKey={cycleKey!} onChanged={invalidate} />
                ))}
              </Card>
            )}
          </section>

          {withoutMeta.length > 0 ? (
            <section aria-label="Conceptos sin meta">
              <h2 className="mb-2 px-1 text-sm font-semibold text-slate-700">
                Sin meta en este ciclo
              </h2>
              <Card className="divide-y divide-slate-100">
                {withoutMeta.map((row) => (
                  <ConceptRow key={row.categoryId} row={row} cycleKey={cycleKey!} onChanged={invalidate} />
                ))}
              </Card>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "rose" | "emerald";
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-bold tabular-nums",
          tone === "rose" ? "text-rose-600" : tone === "emerald" ? "text-emerald-600" : "text-slate-800",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ConceptRow({
  row,
  cycleKey,
  onChanged,
}: {
  row: Row;
  cycleKey: string;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const upsert = trpc.budgets.upsert.useMutation();
  const remove = trpc.budgets.remove.useMutation();
  const hasMeta = row.budgetId !== null;

  const { data: txData } = trpc.transactions.list.useQuery(
    { cycleKey, categoryId: row.categoryId, type: "expense", limit: 50 },
    { enabled: expanded },
  );

  const startEdit = () => {
    setDraft(hasMeta ? formatNumber(row.availableCents) : "");
    setEditing(true);
  };

  const save = () => {
    const cents = parseMoneyToCents(draft);
    if (!cents || cents <= 0) return;
    upsert.mutate(
      { categoryId: row.categoryId, cycleKey, amountCents: cents },
      {
        onSuccess: () => {
          setEditing(false);
          onChanged();
        },
      },
    );
  };

  const clearMeta = () => {
    if (!row.budgetId) return;
    remove.mutate(
      { id: row.budgetId },
      {
        onSuccess: () => {
          setEditing(false);
          onChanged();
        },
      },
    );
  };

  return (
    <div className="px-1">
      <div className="flex items-start gap-3 px-3 py-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${row.color}1f` }}
        >
          <CategoryIcon name={row.icon} className="size-5" style={{ color: row.color }} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
            <div className="flex shrink-0 items-center gap-1">
              {hasMeta ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    row.status === "ok" && "bg-emerald-50 text-emerald-700",
                    row.status === "near" && "bg-amber-50 text-amber-700",
                    row.status === "over" && "bg-rose-50 text-rose-700",
                  )}
                >
                  {statusLabel[row.status]}
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  Sin meta
                </span>
              )}
              <button
                onClick={() => (editing ? setEditing(false) : startEdit())}
                aria-label={`Editar meta de ${row.name}`}
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
              </button>
            </div>
          </div>

          {editing ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-indigo-500">
                <span className="text-sm font-semibold text-slate-400">S/</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  placeholder="0.00"
                  aria-label={`Meta para ${row.name}`}
                  className="w-full bg-transparent text-sm font-semibold tabular-nums outline-none placeholder:text-slate-300"
                />
              </div>
              <Button size="sm" onClick={save} disabled={upsert.isPending}>
                <Check className="size-4" aria-hidden /> Guardar
              </Button>
              {hasMeta ? (
                <Button size="sm" variant="ghost" onClick={clearMeta} disabled={remove.isPending}>
                  Quitar
                </Button>
              ) : null}
            </div>
          ) : (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 block w-full text-left"
              aria-expanded={expanded}
            >
              <p className="text-xs text-slate-500">
                {hasMeta ? (
                  <>
                    <span className="font-semibold tabular-nums text-slate-700">
                      {formatMoney(row.spentCents)}
                    </span>{" "}
                    de{" "}
                    <span className="font-semibold tabular-nums text-slate-700">
                      {formatMoney(row.availableCents)}
                    </span>
                    {row.carryCents > 0 ? ` (incluye ${formatMoney(row.carryCents)} arrastrado)` : ""}
                  </>
                ) : (
                  <>Gastado {formatMoney(row.spentCents)} · sin meta asignada</>
                )}
              </p>
              {hasMeta ? (
                <Progress value={row.pct} tone={statusTone[row.status]} className="mt-2" />
              ) : null}
            </button>
          )}

          {!editing ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600"
            >
              <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Ocultar movimientos" : "Ver movimientos del ciclo"}
            </button>
          ) : null}
        </div>
      </div>

      {expanded && !editing ? (
        <div className="px-3 pb-4">
          {txData && txData.rows.length > 0 ? (
            <TransactionList rows={txData.rows} limit={2} />
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-400">
              Sin gastos registrados en este concepto durante el ciclo.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
