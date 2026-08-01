"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/cn";

const ICONS = [
  "utensils", "bus", "heart-pulse", "graduation-cap", "zap", "clapperboard",
  "home", "shopping-bag", "plane", "paw-print", "coffee", "gift", "wallet",
  "laptop", "badge-check", "store", "piggy-bank", "target", "tag",
];

const COLORS = [
  "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#eab308", "#ec4899",
  "#14b8a6", "#a855f7", "#06b6d4", "#84cc16", "#f43f5e", "#10b981", "#64748b",
];

export function SettingsScreen() {
  const utils = trpc.useUtils();
  const { data: categories = [] } = trpc.categories.list.useQuery();
  const create = trpc.categories.create.useMutation();
  const setActive = trpc.categories.setActive.useMutation();
  const remove = trpc.categories.remove.useMutation();

  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState(COLORS[0]);

  const invalidate = () => {
    void utils.categories.list.invalidate();
    void utils.transactions.recent.invalidate();
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), type, icon, color },
      {
        onSuccess: () => {
          setName("");
          setIcon("tag");
          setColor(COLORS[0]);
          invalidate();
        },
      },
    );
  };

  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Ajustes</h1>
        <p className="text-sm text-slate-500">Categorías y configuración</p>
      </header>

      <Card>
        <CardHeader title="Nueva categoría" subtitle="Se agrega al selector de captura" />
        <form onSubmit={add} className="flex flex-col gap-3 px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="flex gap-2">
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={cn("rounded-lg px-3 py-1.5", type === "expense" ? "bg-white shadow-sm text-rose-600" : "text-slate-500")}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={cn("rounded-lg px-3 py-1.5", type === "income" ? "bg-white shadow-sm text-emerald-600" : "text-slate-500")}
                >
                  Ingreso
                </button>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre (ej. Gimnasio)"
                maxLength={40}
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
                aria-label="Nombre de la categoría"
              />
            </div>
            <Button type="submit" size="md" disabled={!name.trim()}>
              <Plus className="size-4" aria-hidden /> Agregar
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
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
        </form>
      </Card>

      <CategorySection title="Categorías de gasto" cats={expenseCats} onToggle={handleToggle} onRemove={handleRemove} />
      <CategorySection title="Categorías de ingreso" cats={incomeCats} onToggle={handleToggle} onRemove={handleRemove} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 text-center text-sm text-slate-400">
          <p className="font-semibold text-slate-600">Presupuestos</p>
          <p className="mt-1 text-xs">Alerta cuando te acerques o superes el límite por categoría. Disponible en V2.</p>
        </Card>
        <Card className="p-4 text-center text-sm text-slate-400">
          <p className="font-semibold text-slate-600">Gastos fijos</p>
          <p className="mt-1 text-xs">Internet, Netflix, gimnasio… con frecuencia y día de cobro. Disponible en V2.</p>
        </Card>
        <Card className="p-4 text-center text-sm text-slate-400">
          <p className="font-semibold text-slate-600">Metas de ahorro</p>
          <p className="mt-1 text-xs">Laptop, viaje, emergencias con progreso visual. Disponible en V2.</p>
        </Card>
      </div>

      <LogoutCard />
    </div>
  );

  function handleToggle(id: string, isActive: boolean) {
    setActive.mutate({ id, isActive }, { onSuccess: invalidate });
  }

  function handleRemove(id: string) {
    remove.mutate({ id }, { onSuccess: invalidate });
  }
}

function LogoutCard() {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        void utils.auth.status.invalidate();
      },
    });
  };

  return (
    <Card>
      <CardHeader title="Sesión" subtitle="Tu cuenta es única y privada" />
      <div className="px-4 pb-4">
        <Button variant="danger" size="md" onClick={handleLogout} disabled={logout.isPending}>
          {logout.isPending ? "…" : "Cerrar sesión"}
        </Button>
      </div>
    </Card>
  );
}

function CategorySection({
  title,
  cats,
  onToggle,
  onRemove,
}: {
  title: string;
  cats: { id: string; name: string; icon: string; color: string; isActive: boolean }[];
  onToggle: (id: string, isActive: boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={`${cats.filter((c) => c.isActive).length} activas`} />
      <ul className="divide-y divide-slate-100 px-2 pb-2">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
            <span
              className="grid size-9 place-items-center rounded-xl"
              style={{ backgroundColor: `${c.color}1f` }}
            >
              <CategoryIcon name={c.icon} className="size-4.5" style={{ color: c.color }} />
            </span>
            <span className={cn("flex-1 text-sm font-medium", c.isActive ? "text-slate-800" : "text-slate-400 line-through")}>
              {c.name}
            </span>
            <button
              onClick={() => onToggle(c.id, !c.isActive)}
              role="switch"
              aria-checked={c.isActive}
              aria-label={`Activar ${c.name}`}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                c.isActive ? "bg-indigo-600" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                  c.isActive ? "left-[22px]" : "left-0.5",
                )}
              />
            </button>
            <button
              onClick={() => onRemove(c.id)}
              aria-label={`Eliminar ${c.name}`}
              className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {cats.length === 0 ? <li className="px-2 py-4 text-center text-sm text-slate-400">Sin categorías</li> : null}
      </ul>
    </Card>
  );
}
