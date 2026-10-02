import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

const COPY = {
  en: { title: "Overdue", hint: "Still not done from an earlier day" },
  id: { title: "Terlambat", hint: "Belum selesai dari hari sebelumnya" },
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
      className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/70 p-2"
    >
      <header className="flex items-center gap-1.5 px-1 pt-0.5">
        <AlertTriangle className="size-4 shrink-0 text-red-600" />
        <h3 className="text-sm font-semibold text-red-800">
          {t.title} · {count}
        </h3>
        <span className="ml-auto truncate text-[11px] text-red-700/80">{t.hint}</span>
      </header>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}
