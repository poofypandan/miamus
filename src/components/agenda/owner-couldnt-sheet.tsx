"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CouldntDoNote } from "@/components/staff/couldnt-do-note";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import type { TaskException } from "@/types/database";

/**
 * An owner opening a task someone said couldn't be done (Phase 165): what
 * was said, by whom and when, the note and the photo. Read-only; the owner's
 * existing actions stay where they were (the chore editor: change it, skip a
 * day, give it to someone else), one tap away for a chore.
 *
 * Owner-facing, in the owner's language. The staff's own note is shown as
 * they wrote it.
 */
export function OwnerCouldntSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  entries,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string | null;
  entries: { exception: TaskException; petName?: string; medicine?: boolean }[];
  /** A chore: opens its editor. */
  onEdit?: () => void;
}) {
  useBackToClose(open, () => onOpenChange(false));
  const locale = useOwnerLocale();
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-center">{title}</SheetTitle>
          {subtitle && <SheetDescription className="text-center">{subtitle}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {entries.map(({ exception, petName, medicine }) => (
            <CouldntDoNote
              key={exception.id}
              exception={exception}
              locale={locale}
              medicine={medicine}
              petName={petName}
            />
          ))}
          {onEdit && (
            <Button
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              <Pencil /> {t("Edit chore", "Ubah tugas")}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
