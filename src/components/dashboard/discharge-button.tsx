"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Home, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { cn } from "@/lib/utils";
import type { TaskEntity } from "@/types/database";

/**
 * Brings a dog home from the clinic, which restarts its suspended routines.
 *
 * Deliberately not tied to a vet task: a dog can be collected days after the
 * visit that admitted it, long past the schedule that recorded the check-in, so
 * the discharge belongs to the dog rather than to any one task. `label` carries
 * the language of whichever view it sits in (Phase 46).
 */
export function DischargeButton({
  pet,
  label,
  successMessage,
  errorMessage,
  className,
}: {
  pet: TaskEntity;
  label: string;
  successMessage: string;
  errorMessage: string;
  className?: string;
}) {
  const { updateEntity } = useHousehold();
  const [busy, setBusy] = useState(false);

  async function discharge() {
    if (busy) return;
    setBusy(true);
    try {
      await updateEntity(pet.id, { status: "home" });
      toast.success(successMessage);
    } catch (err) {
      console.error(err);
      toast.error(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      onClick={discharge}
      disabled={busy}
      className={cn("min-h-[48px] w-full bg-indigo-600 text-sm hover:bg-indigo-700", className)}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Home className="size-5" />}
      {label}
    </Button>
  );
}
