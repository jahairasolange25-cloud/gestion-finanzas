"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Modal } from "./ui/modal";
import { CategoryIcon } from "./category-icon";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { formatDayMonth, todayStr } from "@/lib/date-fields";
import { splitByPct } from "@/lib/cycle";
import { cn } from "@/lib/cn";

const ICONS = [
  "piggy-bank", "shield", "target", "plane", "laptop", "home", "shopping-bag",
  "heart-pulse", "graduation-cap", "gift", "coffee", "store", "zap",
];

const COLORS = [
  "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899",
  "#14b8a6", "#a855f7", "#06b6d4", "#84cc16", "#f43f5e", "#64748b",
];

const KIND_LABEL: Record<string, string> = {
  aporte: "Aporte",
  sobrante: "Sobrante del ciclo",
  retiro: "Retiro",
  ajuste: "Ajuste",
};

export function SavingsScreen() {
  const utils = trpc.useUtils();

  const { data: current } = trpc.cycles.current.useQuery({ today: todayStr() });
  const cycleKey = current?.cycleKey;
  const { data, isLoading } = trpc.savings.list.useQuery(
    { cycleKey: cycleKey! },
    { enabled: !!cycleKey },
  );

  const buckets = useMemo(() => data?.buckets ?? [], [data]);
  const activeBuckets = buckets.filter((b) => b.isActive && b.pct > 0);

  const [showAporte, setShowAporte] = useState(false);
  const [editBucket, setEditBucket] = useState<null | (typeof buckets)[number]>(null);
  const [newBucket, setNewBucket] = useState(false);
  const [retiroFor, setRetiroFor] = useState<null | (typeof buckets)[number]>(null);
  const [confirmRemove, setConfirmRemove] = useState<null | (typeof buckets)[number]>(null);

  const invalidate = () => {
    void utils.savings.list.invalidate();
    void utils.savings.history.invalidate();
    void utils.cycles.overview.invalidate();
  };

  const removeBucket = trpc.savings.removeBucket.useMutation();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ahorros</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {current ? `Ciclo ${current.label} · tu ahorro se reparte según el % de cada bolsillo` : "Cargando ciclo…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setNewBucket(true)}>
            <Plus className="size-4" aria-hidden /> Bolsillo
          </Button>
          <Button size="sm" onClick={() => setShowAporte(true)} disabled={activeBuckets.length === 0}>
            <ArrowUpFromLine className="size-4" aria-hidden /> Aportar
          </Button>
        </div>
      </header>

      {data ? (
        <Card className="grid grid-cols-3 gap-3 p-4">
          <Stat label="Aportado este ciclo" value={formatMoney(data.cycle.aportes)} tone="emerald" />
          <Stat label="Retirado este ciclo" value={formatMoney(data.cycle.retiros)} tone="rose" />
          <Stat label="Total acumulado" value={formatMoney(data.totalCents)} />
        </Card>
      ) : null}

      {isLoading || !data ? (
        <Card className="p-8 text-center text-sm text-slate-400">Cargando ahorros…</Card>
      ) : buckets.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          Aún no tienes sub-bolsillos. Crea el primero con “Bolsillo”.
        </Card>
      ) : (
        <section aria-label="Sub-bolsillos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {buckets.map((b) => (
            <Card key={b.id} className={cn("p-4", !b.isActive && "opacity-60")}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <span
                    className="grid size-9 place-items-center rounded-xl"
                    style={{ backgroundColor: `${b.color}1f` }}
                  >
                    <CategoryIcon name={b.icon} className="size-5" style={{ color: b.color }} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{b.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {b.pct}% del aporte{b.isActive ? "" : " · inactivo"}
                    </p>
                  </div>
                </span>
                <button
                  onClick={() => setEditBucket(b)}
                  aria-label={`Editar ${b.name}`}
                  className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </button>
              </div>
              <p className="mt-3 text-xl font-bold tabular-nums text-slate-900">
                {formatMoney(b.balanceCents)}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  disabled={b.balanceCents <= 0}
                  onClick={() => setRetiroFor(b)}
                >
                  <ArrowDownToLine className="size-3.5" aria-hidden /> Retirar
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      {data && data.recent.length > 0 ? (
        <section aria-label="Movimientos recientes">
          <h2 className="mb-2 px-1 text-sm font-semibold text-slate-700">Movimientos recientes</h2>
          <Card className="divide-y divide-slate-100">
            {data.recent.slice(0, 12).map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    m.kind === "retiro" ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600",
                  )}
                >
                  {m.kind === "retiro" ? (
                    <ArrowDownToLine className="size-4" aria-hidden />
                  ) : (
                    <PiggyBank className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {KIND_LABEL[m.kind] ?? m.kind} · {m.bucketName}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {formatDayMonth(m.date)}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    m.kind === "retiro" ? "text-rose-600" : "text-emerald-600",
                  )}
                >
                  {m.kind === "retiro" ? "−" : "+"}
                  {formatMoney(m.amountCents)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {showAporte ? (
        <AporteModal activeBuckets={activeBuckets} onClose={() => setShowAporte(false)} onDone={invalidate} />
      ) : null}
      {editBucket || newBucket ? (
        <BucketModal
          bucket={editBucket}
          onClose={() => {
            setEditBucket(null);
            setNewBucket(false);
          }}
          onDone={invalidate}
          onRequestRemove={editBucket ? () => setConfirmRemove(editBucket) : undefined}
        />
      ) : null}
      {retiroFor ? (
        <RetiroModal bucket={retiroFor} onClose={() => setRetiroFor(null)} onDone={invalidate} />
      ) : null}
      {confirmRemove ? (
        <Modal title={`Eliminar ${confirmRemove.name}`} onClose={() => setConfirmRemove(null)}>
          <p className="text-sm text-slate-500">
            Solo se puede eliminar si nunca tuvo movimientos. Si ya tiene ahorro, desactívalo en su lugar.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmRemove(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={removeBucket.isPending}
              onClick={() => {
                removeBucket.mutate(
                  { id: confirmRemove.id },
                  {
                    onSuccess: () => {
                      setConfirmRemove(null);
                      setEditBucket(null);
                      invalidate();
                    },
                  },
                );
              }}
            >
              {removeBucket.isPending ? "…" : "Eliminar"}
            </Button>
          </div>
          {removeBucket.isError ? (
            <p className="mt-3 text-xs font-medium text-rose-600">No se pudo eliminar: ya tiene movimientos o no existe.</p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "rose" | "emerald" }) {
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

function AporteModal({
  activeBuckets,
  onClose,
  onDone,
}: {
  activeBuckets: Array<{ id: string; name: string; pct: number; color: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const aporte = trpc.savings.aporte.useMutation();

  const cents = parseMoneyToCents(amount) ?? 0;
  const preview = splitByPct(cents, activeBuckets);

  const submit = () => {
    if (cents <= 0) return;
    aporte.mutate(
      { amountCents: cents },
      {
        onSuccess: () => {
          onDone();
          onClose();
        },
      },
    );
  };

  return (
    <Modal title="Aportar al ahorro" onClose={onClose}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Monto del aporte</span>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-indigo-500">
          <span className="text-lg font-bold text-slate-400">S/</span>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="0.00"
            aria-label="Monto del aporte"
            className="w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          />
        </div>
      </label>

      {cents > 0 ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Se repartirá así
          </p>
          <ul className="flex flex-col gap-1.5">
            {preview.map((p) => {
              const b = activeBuckets.find((x) => x.id === p.id);
              return (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    {b?.name} <span className="text-xs text-slate-400">({b?.pct}%)</span>
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {formatMoney(p.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <Button
        size="lg"
        className="mt-4 w-full"
        disabled={cents <= 0 || aporte.isPending}
        onClick={submit}
      >
        {aporte.isPending ? "Guardando…" : `Aportar ${cents > 0 ? formatMoney(cents) : ""}`}
      </Button>
      {aporte.isError ? (
        <p className="mt-2 text-xs font-medium text-rose-600">
          No se pudo registrar el aporte. Revisa que existan bolsillos activos.
        </p>
      ) : null}
    </Modal>
  );
}

function BucketModal({
  bucket,
  onClose,
  onDone,
  onRequestRemove,
}: {
  bucket: { id: string; name: string; pct: number; icon: string; color: string; isActive: boolean } | null;
  onClose: () => void;
  onDone: () => void;
  onRequestRemove?: () => void;
}) {
  const [name, setName] = useState(bucket?.name ?? "");
  const [pct, setPct] = useState(bucket ? String(bucket.pct) : "0");
  const [icon, setIcon] = useState(bucket?.icon ?? "piggy-bank");
  const [color, setColor] = useState(bucket?.color ?? "#10b981");

  const upsert = trpc.savings.upsertBucket.useMutation();
  const setActive = trpc.savings.setBucketActive.useMutation();

  const pctNum = Math.max(0, Math.min(100, Math.round(Number(pct.replace(/[^\d]/g, "")) || 0)));
  const canSave = name.trim().length > 0 && !upsert.isPending;

  const save = () => {
    if (!canSave) return;
    upsert.mutate(
      { id: bucket?.id, name: name.trim(), pct: pctNum, icon, color },
      {
        onSuccess: () => {
          onDone();
          onClose();
        },
      },
    );
  };

  return (
    <Modal title={bucket ? `Editar ${bucket.name}` : "Nuevo bolsillo de ahorro"} onClose={onClose}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Nombre</span>
        <input
          autoFocus={!bucket}
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Fondo de emergencia"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Porcentaje del aporte (%)
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={pct}
          onChange={(e) => setPct(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="0"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm tabular-nums outline-none focus:border-indigo-500"
        />
      </label>

      <div className="mt-3">
        <span className="mb-1 block text-xs font-medium text-slate-500">Ícono</span>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              aria-label={`Ícono ${i}`}
              aria-pressed={icon === i}
              className={cn(
                "grid size-9 place-items-center rounded-lg border-2",
                icon === i ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <CategoryIcon name={i} className="size-4 text-slate-600" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-xs font-medium text-slate-500">Color</span>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className={cn("size-8 rounded-lg border-2", color === c ? "border-slate-900" : "border-transparent")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button className="flex-1" disabled={!canSave} onClick={save}>
          {upsert.isPending ? "Guardando…" : bucket ? "Guardar cambios" : "Crear bolsillo"}
        </Button>
        {bucket ? (
          <Button
            variant="secondary"
            onClick={() => {
              setActive.mutate(
                { id: bucket.id, isActive: !bucket.isActive },
                {
                  onSuccess: () => {
                    onDone();
                    onClose();
                  },
                },
              );
            }}
            disabled={setActive.isPending}
          >
            {bucket.isActive ? "Desactivar" : "Activar"}
          </Button>
        ) : null}
      </div>
      {bucket && onRequestRemove ? (
        <button
          onClick={onRequestRemove}
          className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-rose-500 hover:text-rose-600"
        >
          <Trash2 className="size-3.5" aria-hidden /> Eliminar bolsillo
        </button>
      ) : null}
    </Modal>
  );
}

function RetiroModal({
  bucket,
  onClose,
  onDone,
}: {
  bucket: { id: string; name: string; balanceCents: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const retiro = trpc.savings.retiro.useMutation();

  const cents = parseMoneyToCents(amount) ?? 0;
  const exceeded = cents > bucket.balanceCents;

  const submit = () => {
    if (cents <= 0 || exceeded) return;
    retiro.mutate(
      { bucketId: bucket.id, amountCents: cents },
      {
        onSuccess: () => {
          onDone();
          onClose();
        },
      },
    );
  };

  return (
    <Modal title={`Retirar de ${bucket.name}`} onClose={onClose}>
      <p className="text-xs text-slate-500">
        Saldo disponible: <span className="font-semibold text-slate-700">{formatMoney(bucket.balanceCents)}</span>
      </p>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Monto a retirar</span>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-indigo-500">
          <span className="text-lg font-bold text-slate-400">S/</span>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="0.00"
            aria-label="Monto a retirar"
            className="w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          />
        </div>
      </label>
      {exceeded ? (
        <p className="mt-2 text-xs font-medium text-rose-600">El monto supera el saldo disponible.</p>
      ) : null}
      <Button
        size="lg"
        variant="danger"
        className="mt-4 w-full"
        disabled={cents <= 0 || exceeded || retiro.isPending}
        onClick={submit}
      >
        {retiro.isPending ? "Retirando…" : "Retirar"}
      </Button>
    </Modal>
  );
}
