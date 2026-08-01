import { router } from "./trpc";
import { transactionsRouter } from "./routers/transactions";
import { categoriesRouter } from "./routers/categories";
import { analyticsRouter } from "./routers/analytics";

export const appRouter = router({
  transactions: transactionsRouter,
  categories: categoriesRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
