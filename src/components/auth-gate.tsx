"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth-store";

const inputCls =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const unauthorized = useAuthStore((s) => s.unauthorized);
  const clearUnauthorized = useAuthStore((s) => s.clearUnauthorized);
  const status = trpc.auth.status.useQuery();
  const login = trpc.auth.login.useMutation();
  const setup = trpc.auth.setup.useMutation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sesión expirada: limpiar datos en caché (privacidad) y volver al login.
  useEffect(() => {
    if (unauthorized) {
      queryClient.clear();
    }
  }, [unauthorized, queryClient]);

  if (status.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Wallet className="size-8 animate-pulse text-indigo-500" aria-hidden />
      </div>
    );
  }

  const needsSetup = status.data?.needsSetup === true;
  const authenticated = status.data?.authenticated === true && !unauthorized;

  if (authenticated) {
    if (unauthorized) return null;
    return <>{children}</>;
  }

  const submitting = login.isPending || setup.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (needsSetup && password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    const mutation = needsSetup ? setup : login;
    mutation.mutate(
      { username: username.trim(), password },
      {
        onSuccess: () => {
          clearUnauthorized();
          void utils.auth.status.invalidate();
        },
        onError: (err) => {
          setError(err.message ?? "Error de conexión");
        },
      },
    );
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500">
          <Wallet className="size-7 text-white" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Mis Finanzas</h1>
        <p className="text-sm text-slate-500">
          {needsSetup
            ? "Crea tu cuenta: es privada y solo existe en tu dispositivo y tu base de datos."
            : "Ingresa para ver tus finanzas"}
        </p>
      </div>

      <Card className="w-full max-w-sm p-5">
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Usuario
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              maxLength={40}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Contraseña
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={needsSetup ? "new-password" : "current-password"}
              maxLength={128}
            />
          </label>
          {needsSetup ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Repetir contraseña
              <input
                className={inputCls}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                maxLength={128}
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="mt-1"
            disabled={
              submitting || username.trim().length < 3 || password.length < 8
            }
          >
            {submitting
              ? "…"
              : needsSetup
                ? "Crear acceso"
                : "Ingresar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
