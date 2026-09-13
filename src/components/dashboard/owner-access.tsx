"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHousehold } from "@/context/household-context";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

// Owner access is now a hidden gesture on the landing page (see src/app/
// page.tsx) rather than a visible header control, so this modal is the only
// export left here — no more OwnerAccessButton.
export function PinModal({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Fires after a correct PIN, in addition to the modal's own close/reset —
  // e.g. the landing page uses this to navigate to /dashboard.
  onUnlocked?: () => void;
}) {
  const { unlockOwner } = useHousehold();
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  function pressDigit(digit: string) {
    if (shake || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length < PIN_LENGTH) return;

    if (unlockOwner(next)) {
      toast.success("Owner mode unlocked");
      onOpenChange(false);
      setPin("");
      onUnlocked?.();
    } else {
      toast.error("Incorrect PIN");
      setShake(true);
      setTimeout(() => {
        setPin("");
        setShake(false);
      }, 400);
    }
  }

  function pressBackspace() {
    setPin((p) => p.slice(0, -1));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setPin("");
      }}
    >
      {/* Overrides the shared Dialog's default vertical centering (fixed
          top-1/2 -translate-y-1/2) with a bottom anchor — the PIN pad
          should sit in the lower third of the screen, right where a
          thumb naturally rests, not floating mid-screen. Horizontal
          centering is left untouched. */}
      <DialogContent className="top-auto bottom-32 translate-y-0 sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Owner Access</DialogTitle>
          <DialogDescription>Enter the 4-digit PIN to unlock owner mode.</DialogDescription>
        </DialogHeader>

        <div className={cn("flex justify-center gap-3 py-2", shake && "animate-shake")}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2 transition-colors",
                shake
                  ? "border-destructive bg-destructive"
                  : i < pin.length
                    ? "border-primary bg-primary"
                    : "border-input bg-transparent"
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 px-2 pb-2">
          {PAD_KEYS.map((key, i) =>
            key === "" ? (
              <span key={i} aria-hidden />
            ) : key === "back" ? (
              <Button
                key={i}
                type="button"
                variant="ghost"
                className="min-h-[56px] text-lg"
                onClick={pressBackspace}
              >
                <Delete className="size-5" />
              </Button>
            ) : (
              <Button
                key={i}
                type="button"
                variant="outline"
                className="min-h-[56px] text-xl font-semibold"
                onClick={() => pressDigit(key)}
              >
                {key}
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
