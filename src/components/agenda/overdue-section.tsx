import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

const COPY = {
  en: { title: "From earlier", hint: "Not done yet" },
  id: { title: "Belum selesai", hint: "Dari hari sebelumnya" },
} as const;

/**
 * The top of today's list when something was left undone (Phase 113): the
 * rolled-over chores, under a red-tinted header.
 *
 * Red is otherwise the Agenda's colour for a dog's health (lib/agenda-tones).
 * This is the one other place it appears, and only as the frame — the chores
 * inside keep their amber — because "this should already have happened" is
 * the other thing on a day that cannot wait.
 */
export function OverdueSection({
  count,
  locale,
  children,
}: {
  count: number;
  locale: "en" | "id";
  children: ReactNode;
}) {
  const t = COPY[locale];
  return (
    <section
      aria-label={`${t.title} (${count})`}
      // Attention, not urgent (Fable's look, 07): a chore a few days late is
      // something to look at, not an alarm. Its icon and dark text carry it.
      className="flex flex-col gap-2 rounded-2xl bg-attention-tint/60 p-2"
    >
      <header className="flex items-center gap-1.5 px-1 pt-0.5">
        <AlertTriangle className="size-4 shrink-0 text-attention" />
        <h3 className="text-sm font-semibold text-attention">
          {t.title} · {count}
        </h3>
        <span className="ml-auto truncate text-[11px] text-attention/80">{t.hint}</span>
      </header>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}
