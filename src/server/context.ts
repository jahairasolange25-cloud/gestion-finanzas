import { db } from "./db";

export const createContext = () => ({ db });

export type Context = ReturnType<typeof createContext>;
