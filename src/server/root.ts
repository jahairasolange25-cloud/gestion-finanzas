import { router } from "./trpc";
import { transactionsRouter } from "./routers/transactions";
import { categoriesRouter } from "./routers/categories";
import { analyticsRouter } from "./routers/analytics";
import { authRouter } from "./routers/auth";
import { exportRouter } from "./routers/export";
import { budgetsRouter } from "./routers/budgets";
import { fixedExpensesRouter } from "./routers/fixed-expenses";
import { goalsRouter } from "./routers/goals";

export const appRouter = router({
  auth: authRouter,
  transactions: transactionsRouter,
  categories: categoriesRouter,
  analytics: analyticsRouter,
  export: exportRouter,
  budgets: budgetsRouter,
  fixedExpenses: fixedExpensesRouter,
  goals: goalsRouter,
});

export type AppRouter = typeof appRouter;
