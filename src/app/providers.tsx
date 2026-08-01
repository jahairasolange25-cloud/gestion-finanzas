"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/server/root";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/store/auth-store";

/** Si una petición con datos falla con 401 (sesión expirada/revocada),
 *  marca el estado para que AuthGate muestre el login y limpie la caché.
 *  Los errores de auth.* (login fallido, setup) se manejan en el formulario. */
const unauthorizedLink: TRPCLink<AppRouter> = () => {
  return ({ op, next }) =>
    observable((observer) => {
      const unsubscribe = next(op).subscribe({
        error: (err) => {
          if (
            err.data?.code === "UNAUTHORIZED" &&
            !op.path.startsWith("auth.")
          ) {
            useAuthStore.getState().markUnauthorized();
          }
          observer.error(err);
        },
        next: observer.next,
        complete: observer.complete,
      });
      return unsubscribe;
    });
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 1000 * 60 * 60,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [unauthorizedLink, httpBatchLink({ url: "/api/trpc" })],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
