"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays } from "lucide-react";
import { DAY_LABELS, DateRibbon } from "@/components/date-ribbon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";

/**
 * The date on Today v3 (21 Nov; docs/private/landing/06, sections 2 and 4):
 * a floating pill at the bottom left, beside Tell Kakak, where the thumb is.
 * "Mon 16" / "Sen 16", no month. A tap opens the week, the calendar and Day
 * or Week together, from where the thumb already is. While another day is
 * shown, a second pill, "Today" / "Hari ini", brings it back.
 *
 * Portalled to the page like Kakak's band (the pull-to-refresh wrapper is
 * transformed), at the band's height. While it is up, the band's first-time
 * hint steps aside (it marks <body> with data-date-pill).
 */
export function DatePill({ rangeSwitch }: { rangeSwitch: ReactNode }) {
  const t = useT();
  const locale = useOwnerLocale();
  const { selectedDate, setSelectedDate, jumpToToday } = useHousehold();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  /** Kakak's band is up, and with it the room under the page's last row. */
  const [band, setBand] = useState(true);
  useBackToClose(open, () => setOpen(false));

  useEffect(() => {
    setMounted(true);
    setBand(!!document.querySelector('[data-testid="kakak-band"]'));
    document.body.dataset.datePill = "";
    return () => {
      delete document.body.dataset.datePill;
    };
  }, []);

  const now = new Date();
  const isToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();
  const label = `${DAY_LABELS[locale][selectedDate.getDay()]} ${selectedDate.getDate()}`;

  if (!mounted) return null;
  return (
    <>
      {/* Without Kakak (switched off, or not in this plan) there is no band and
          no room under the last row; the pill makes its own, or it would sit
          over the page's last button. */}
      {!band && <div aria-hidden="true" className="h-24 shrink-0" />}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex w-full max-w-md px-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              data-testid="date-pill"
              aria-label={t(`${label}. Choose a day`, `${label}. Pilih hari`)}
              className="flex min-h-12 items-center gap-2 rounded-full bg-card pr-4 pl-3.5 text-base font-semibold text-gray-900 tabular-nums shadow-float active:scale-[0.98]"
            >
              <CalendarDays className="size-5 text-muted-foreground" aria-hidden />
              {label}
            </button>
            {!isToday && (
              <button
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
            <div onClickCapture={() => setTimeout(() => setOpen(false), 150)}>{rangeSwitch}</div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
