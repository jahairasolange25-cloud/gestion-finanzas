import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./db";

export const createContext = (req?: NextRequest) => ({
  db,
  req,
  /** Correlación de logs y respuestas (header x-request-id). */
  requestId: randomUUID(),
  /** Set-Cookie que el route handler debe adjuntar a la respuesta. */
  cookies: [] as string[],
});

export type Context = ReturnType<typeof createContext>;
