"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { useToday } from "@/hooks/use-today";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useSetupStage } from "@/hooks/use-setup-stage";
import { parseWhatsNewWeek, whatsNewDecision, type WhatsNewWeek } from "@/lib/calm-start";
import {
  STAFF_TIP_CLOSED_ON_KEY,
  STAFF_WHATS_NEW,
  WHATS_NEW,
  pickStaffTip,
  staffTipResting,
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

/** Rule 3's memory: which card holds this week on this phone. */
const WEEK_KEY = "miamus.whats-new.week";

function readWeek(): WhatsNewWeek | null {
  try {
    return parseWhatsNewWeek(localStorage.getItem(WEEK_KEY));
  } catch {
    return null;
  }
}

function writeWeek(week: WhatsNewWeek) {
  try {
    localStorage.setItem(WEEK_KEY, JSON.stringify(week));
  } catch {
    // Storage off: every card would claim the week, so show none rather
    // than all (the caller checks the write took).
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
 * The calm first screen (Phase 172, lib/calm-start) decides whether it may
 * show at all: never to a household under 14 days old or not past its
 * first-run checklist, never an entry older than the household, and at most
 * one card a week on this phone (the first that may show claims the week).
 *
 * Hidden on the first render and decided after mount: the server has no
 * storage, and a card that flashed in and out would be worse than one that
 * appears a moment late.
 */
export function WhatsNewCard({ id, onTry }: { id: string; onTry?: () => void }) {
  const entry = whatsNewEntry(id);
  const locale = useOwnerLocale();
  const t = useT();
  const { createdOn, ready } = useHouseholdProfile();
  const stage = useSetupStage();
  const today = formatDateLocal(useToday());
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!entry || !ready || wasSeen(id)) return;
    const decision = whatsNewDecision({ id, entryDate: entry.date, createdOn, stage, today, week: readWeek() });
    if (decision === "hide") return;
    if (decision === "claim") {
      writeWeek({ id, on: today });
      // Only the card that actually holds the week shows.
      if (readWeek()?.id !== id) return;
    }
    setShow(true);
  }, [entry, id, ready, createdOn, stage, today]);

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


/**
 * A staff phone's tutorials (lib/whats-new.ts STAFF_WHATS_NEW), in Bahasa
 * Indonesia only, ONE at a time (audit B1, item 5): the newest that applies
 * and hasn't been closed. A tip applies when `show` says its feature is on
 * this household's screens (no point explaining floors before the owner has
 * any). Once one is closed, the next waits until tomorrow: "tomorrow" read
 * from useToday, so a phone left open overnight gets its next tip in the
 * morning without a reload (Codex, #62).
 *
 * Decided after mount: the server has no storage.
 */
export function StaffTipCard({ tips }: { tips: StaffTipCandidate[] }) {
  const today = formatDateLocal(useToday());
  // null until read on this phone: nothing shows before that. `closedOn` is
  // the day a tip was last closed; whether that rests the card is decided
  // against today on every render, never frozen at mount.
  const [state, setState] = useState<{ seen: ReadonlySet<string>; closedOn: string | null } | null>(null);

  useEffect(() => {
    const seen = new Set(STAFF_WHATS_NEW.map((entry) => entry.id).filter(wasSeen));
    setState({ seen, closedOn: closedOn() });
  }, []);

  const id =
    state && !staffTipResting(state.closedOn, today) ? pickStaffTip(tips, (tip) => state.seen.has(tip)) : null;
  const entry = id ? staffWhatsNewEntry(id) : undefined;
  if (!id || !entry) return null;

  function close() {
    markSeen(id!);
    try {
      localStorage.setItem(STAFF_TIP_CLOSED_ON_KEY, today);
    } catch {
      // Storage off: the next tip may show on the next visit, no harm.
    }
    setState((prev) => (prev ? { seen: new Set([...prev.seen, id!]), closedOn: today } : prev));
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
  const owner = WHATS_NEW.filter((entry) => entry.audience === "owner" && !entry.kakakOnly);
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
