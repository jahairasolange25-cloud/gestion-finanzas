import { cn } from "@/lib/cn";

export type ProgressTone = "indigo" | "emerald" | "amber" | "rose" | "sky";

const tones: Record<ProgressTone, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
};

export function Progress({
  value,
  tone = "indigo",
  className,
}: {
  value: number;
  tone?: ProgressTone;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-300", tones[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
