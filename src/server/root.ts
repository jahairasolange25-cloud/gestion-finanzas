import { router } from "./trpc";
import { transactionsRouter } from "./routers/transactions";
import { categoriesRouter } from "./routers/categories";
import { analyticsRouter } from "./routers/analytics";
import { authRouter } from "./routers/auth";

export const appRouter = router({
  auth: authRouter,
  transactions: transactionsRouter,
  categories: categoriesRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
