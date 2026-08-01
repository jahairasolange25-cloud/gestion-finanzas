import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { appRouter } from "@/server/root";
import { createContext } from "@/server/context";

export const runtime = "nodejs";

const handler = async (req: NextRequest) => {
  const ctx = createContext(req);
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => ctx,
  });
  for (const cookie of ctx.cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
};

export { handler as GET, handler as POST };
