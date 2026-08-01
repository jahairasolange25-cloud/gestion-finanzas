"use client";

import { useEffect } from "react";
import { useUiStore } from "@/store/ui-store";
import { useFlushPending } from "@/hooks/use-save-transaction";

/**
 * Registra el service worker, vigila la conectividad y reenvía
 * la cola offline al reconectar. No renderiza nada.
 */
export function PwaSync() {
  const setOfflineMode = useUiStore((s) => s.setOfflineMode);
  const { flush } = useFlushPending();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onStatus = () => setOfflineMode(!navigator.onLine);
    onStatus();
    window.addEventListener("online", onStatus);
    window.addEventListener("offline", onStatus);
    return () => {
      window.removeEventListener("online", onStatus);
      window.removeEventListener("offline", onStatus);
    };
  }, [setOfflineMode]);

  useEffect(() => {
    const onOnline = () => {
      void flush();
    };
    window.addEventListener("online", onOnline);
    if (navigator.onLine) void flush();
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  return null;
}
