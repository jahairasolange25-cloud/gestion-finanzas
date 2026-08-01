import type { NextRequest } from "next/server";
import { db } from "./db";

export const createContext = (req?: NextRequest) => ({
  db,
  req,
  /** Set-Cookie que el route handler debe adjuntar a la respuesta. */
  cookies: [] as string[],
});

export type Context = ReturnType<typeof createContext>;
