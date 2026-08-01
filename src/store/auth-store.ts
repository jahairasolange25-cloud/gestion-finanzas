import { create } from "zustand";

interface AuthState {
  /** Una petición falló con 401 teniendo sesión: hay que volver al login. */
  unauthorized: boolean;
  markUnauthorized: () => void;
  clearUnauthorized: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  unauthorized: false,
  markUnauthorized: () => set({ unauthorized: true }),
  clearUnauthorized: () => set({ unauthorized: false }),
}));
