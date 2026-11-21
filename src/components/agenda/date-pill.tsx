"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { CalendarDays } from "lucide-react";
import { DAY_LABELS, DateRibbon } from "@/components/date-ribbon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { afterBackSettles, useBackToClose } from "@/hooks/use-back-to-close";

/**
 * The date on Today v3 (21 Nov; docs/private/landing/06, sections 2 and 4):
 * a floating pill at the bottom left, beside Tell Kakak, where the thumb is.
 * "Mon 16" / "Sen 16", no month. A tap opens the week, the calendar and Day
 * or Week together, from where the thumb already is. While another day is
 * shown, a second pill, "Today" / "Hari ini", brings it back.
 *
 * Portalled to the page like Kakak's band (the pull-to-refresh wrapper is
 * transformed), at the band's height. While it is up, the band's first-time
 * hint steps aside (it marks <body> with data-date-pill). It stacks one
 * above the band (z-31 over z-30): the band is full width and takes taps,
 * and its portal can be added after this one (Codex, PR #181).
 *
 * Side by side with Tell Kakak while they fit. On a narrow phone (360 px, in
 * Indonesian) the date, "Hari ini" and "Bilang ke Kakak" don't, and the
 * Today pill would sit over Kakak's button and take its taps: it then stands
 * above the date pill instead (Codex, PR #181).
 */
export function DatePill({
  rangeSwitch,
}: {
  /**
   * Day | Week for the sheet. It is given `afterClose`: wrap the switch's own
   * navigation in it, so the sheet closes and its history entry is gone
   * before Day or Week pushes the address.
   */
  rangeSwitch: (afterClose: (navigate: () => void) => void) => ReactNode;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const { selectedDate, setSelectedDate, jumpToToday } = useHousehold();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  /** Kakak's band is up, and with it the room under the page's last row. */
  const [band, setBand] = useState(true);
  useBackToClose(open, () => setOpen(false));
  function afterClose(navigate: () => void) {
    flushSync(() => setOpen(false));
    afterBackSettles(navigate);
  }

  useEffect(() => {
    setMounted(true);
    // Kakak's band can arrive after the pill (her status loads on its own),
    // or leave when she is switched off: follow it rather than reading once.
    const readBand = () => setBand(!!document.querySelector('[data-testid="kakak-band"]'));
    readBand();
    const watch = new MutationObserver(readBand);
    watch.observe(document.body, { childList: true });
    document.body.dataset.datePill = "";
    return () => {
      watch.disconnect();
      delete document.body.dataset.datePill;
    };
  }, []);

  const now = new Date();
  const isToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();
  const label = `${DAY_LABELS[locale][selectedDate.getDay()]} ${selectedDate.getDate()}`;

  const pillRef = useRef<HTMLButtonElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const [stack, setStack] = useState(false);
  useLayoutEffect(() => {
    if (!mounted || isToday || !band) {
      setStack(false);
      return;
    }
    // The date pill's place never moves, so measuring in either layout gives
    // the same answer: where the Today pill would end beside it, against
    // where Kakak's button starts (12 px apart, as the band's own gap).
    function measure() {
      const pill = pillRef.current;
      const todayPill = todayRef.current;
      const kakak = document.querySelector<HTMLElement>('[data-testid="kakak-band"] button');
      if (!pill || !todayPill || !kakak) return setStack(false);
      const end = pill.getBoundingClientRect().right + 8 + todayPill.offsetWidth;
      setStack(end + 12 > kakak.getBoundingClientRect().left);
    }
    measure();
    // Again whenever any of the three changes size (the web font arriving,
    // Kakak's button settling) or the screen does.
    const sizes = new ResizeObserver(measure);
    for (const el of [pillRef.current, todayRef.current, document.querySelector('[data-testid="kakak-band"] button')]) {
      if (el) sizes.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      sizes.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mounted, isToday, band, label, locale]);

  if (!mounted) return null;
  return (
    <>
      {/* Without Kakak (switched off, or not in this plan) there is no band and
          no room under the last row; the pill makes its own, or it would sit
          over the page's last button. */}
      {!band && <div aria-hidden="true" className="h-24 shrink-0" />}
      {/* Stacked, the Today pill stands one pill higher (a 48px pill and its
          8px gap): the last row still has to scroll clear of it. */}
      {stack && <div aria-hidden="true" data-testid="date-pill-room" className="h-14 shrink-0" />}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+0.75rem+env(safe-area-inset-bottom))] z-[31] mx-auto flex w-full max-w-md px-4">
          <div
            data-stacked={stack ? "" : undefined}
            className={`pointer-events-auto flex gap-2 ${stack ? "flex-col-reverse items-start" : "items-center"}`}
          >
            <button
              ref={pillRef}
              type="button"
              onClick={() => setOpen(true)}
              data-testid="date-pill"
              aria-label={t(`${label}. Choose a day`, `${label}. Pilih hari`)}
              className={`flex min-h-12 items-center gap-2 rounded-full bg-card pr-4 text-base font-semibold text-gray-900 tabular-nums shadow-float active:scale-[0.98] ${isToday ? "pl-3.5" : "pl-4"}`}
            >
              {/* Only on today: beside the Today pill the day's name says what
                  this pill is, and the room keeps Indonesian on one line at
                  390px (Fable, PR #181). */}
              {isToday && <CalendarDays className="size-5 text-muted-foreground" aria-hidden />}
              {label}
            </button>
            {!isToday && (
              <button
                ref={todayRef}
                type="button"
                onClick={jumpToToday}
                className="flex min-h-12 items-center rounded-full bg-card px-4 text-sm font-semibold text-gray-900 shadow-float active:scale-[0.98]"
              >
                {t("Today", "Hari ini")}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="px-0">
            <SheetTitle>{t("Choose a day", "Pilih hari")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("The week, the calendar, and Day or Week.", "Minggu ini, kalender, dan Hari atau Minggu.")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4">
            <DateRibbon
              value={selectedDate}
              onChange={(day) => {
                setSelectedDate(day);
                setOpen(false);
              }}
              locale={locale}
            />
            {rangeSwitch(afterClose)}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
