"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TransactionType } from "@/lib/types";

interface UiState {
  lastCategoryId: Record<TransactionType, string | null>;
  setLastCategory: (type: TransactionType, id: string | null) => void;
  offlineMode: boolean;
  setOfflineMode: (offline: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      lastCategoryId: { expense: null, income: null },
      setLastCategory: (type, id) =>
        set((s) => ({ lastCategoryId: { ...s.lastCategoryId, [type]: id } })),
      offlineMode: false,
      setOfflineMode: (offlineMode) => set({ offlineMode }),
    }),
    {
      name: "finanzas-ui",
      partialize: (s) => ({ lastCategoryId: s.lastCategoryId }),
    },
  ),
);
