"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import {
  STAFF_TIP_CLOSED_ON_KEY,
  STAFF_WHATS_NEW,
  WHATS_NEW,
  pickStaffTip,
  staffWhatsNewEntry,
  storageKey,
  whatsNewEntry,
  type StaffTipCandidate,
} from "@/lib/whats-new";

function wasSeen(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === "seen";
  } catch {
    return false;
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(storageKey(id), "seen");
  } catch {
    // Private mode or storage off: the card just shows again next time.
  }
}

/**
 * A new feature's short tutorial, shown once where the feature lives
 * (lib/whats-new.ts). Closing it, or trying the feature from it, hides it on
 * this phone; Household → What's new keeps it readable.
 *
 * Hidden on the first render and decided after mount: the server has no
 * storage, and a card that flashed in and out would be worse than one that
 * appears a moment late.
 */
export function WhatsNewCard({ id, onTry }: { id: string; onTry?: () => void }) {
  const entry = whatsNewEntry(id);
  const locale = useOwnerLocale();
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (entry && !wasSeen(id)) setShow(true);
  }, [entry, id]);

  if (!entry || !show) return null;

  function close() {
    markSeen(id);
    setShow(false);
  }

  return (
    <section
      aria-label={entry.title[locale]}
      className="relative flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 animate-view-fade motion-reduce:animate-none"
    >
      <button
        type="button"
        onClick={close}
        aria-label={t("Close", "Tutup")}
        className="absolute top-1.5 right-1.5 flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-zinc-200"
      >
        <X className="size-4" />
      </button>
      <h3 className="flex items-center gap-1.5 pr-8 text-sm font-semibold text-gray-900">
        <Sparkles className="size-4 shrink-0" aria-hidden />
        {entry.title[locale]}
      </h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-snug text-gray-700">
        {entry.steps[locale].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="flex gap-2 pt-1">
        {onTry && (
          <Button
            className="min-h-[40px] px-4 text-sm"
            onClick={() => {
              close();
              onTry();
            }}
          >
            {entry.tryLabel[locale]}
          </Button>
        )}
        <Button variant="outline" className="min-h-[40px] px-4 text-sm" onClick={close}>
          {t("Got it", "Mengerti")}
        </Button>
      </div>
    </section>
  );
}

function closedOn(): string | null {
  try {
    return localStorage.getItem(STAFF_TIP_CLOSED_ON_KEY);
  } catch {
    return null;
  }
}

function todayKey(): string {
  return formatDateLocal(new Date());
}

/**
 * A staff phone's tutorials (lib/whats-new.ts STAFF_WHATS_NEW), in Bahasa
 * Indonesia only, ONE at a time (audit B1, item 5): the newest that applies
 * and hasn't been closed. A tip applies when `show` says its feature is on
 * this household's screens (no point explaining floors before the owner has
 * any). Once one is closed, the next waits until tomorrow.
 *
 * Decided after mount: the server has no storage.
 */
export function StaffTipCard({ tips }: { tips: StaffTipCandidate[] }) {
  // null until read on this phone: nothing shows before that.
  const [state, setState] = useState<{ seen: ReadonlySet<string>; resting: boolean } | null>(null);

  useEffect(() => {
    const seen = new Set(STAFF_WHATS_NEW.map((entry) => entry.id).filter(wasSeen));
    setState({ seen, resting: closedOn() === todayKey() });
  }, []);

  const id = state && !state.resting ? pickStaffTip(tips, (tip) => state.seen.has(tip)) : null;
  const entry = id ? staffWhatsNewEntry(id) : undefined;
  if (!id || !entry) return null;

  function close() {
    markSeen(id!);
    try {
      localStorage.setItem(STAFF_TIP_CLOSED_ON_KEY, todayKey());
    } catch {
      // Storage off: the next tip may show on the next visit, no harm.
    }
    setState((prev) => (prev ? { seen: new Set([...prev.seen, id!]), resting: true } : prev));
  }

  return (
    <section
      aria-label={entry.title}
      className="relative flex flex-col gap-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 animate-view-fade motion-reduce:animate-none"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Tutup"
        className="absolute top-1.5 right-1.5 flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-zinc-200"
      >
        <X className="size-4" />
      </button>
      <h3 className="flex items-center gap-1.5 pr-8 text-sm font-semibold text-gray-900">
        <Sparkles className="size-4 shrink-0" aria-hidden />
        {entry.title}
      </h3>
      {entry.lines.length === 1 ? (
        <p className="pr-2 text-[13px] leading-snug text-gray-700">{entry.lines[0]}</p>
      ) : (
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-snug text-gray-700">
          {entry.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Household → What's new: every tutorial, newest first, always readable. */
export function WhatsNewList() {
  const locale = useOwnerLocale();
  const owner = WHATS_NEW.filter((entry) => entry.audience === "owner");
  const dateFormat = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="flex flex-col gap-3">
      {owner.map((entry) => (
        <section key={entry.id} className="flex flex-col gap-1.5 rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{dateFormat.format(new Date(`${entry.date}T00:00:00`))}</p>
          <h3 className="text-sm font-semibold text-gray-900">{entry.title[locale]}</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-snug text-gray-700">
            {entry.steps[locale].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
