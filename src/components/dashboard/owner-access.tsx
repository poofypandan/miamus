"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Delete, Lock, LockOpen } from "lucide-react";
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

export function OwnerAccessButton() {
  const { userRole, lockOwner } = useHousehold();
  const [open, setOpen] = useState(false);

  if (userRole === "owner") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Exit Owner Mode"
        className="min-h-[48px] min-w-[48px] text-emerald-600"
        onClick={lockOwner}
      >
        <LockOpen className="size-4" />
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Owner Access"
        className="min-h-[48px] min-w-[48px] text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Lock className="size-4" />
      </Button>
      <PinModal open={open} onOpenChange={setOpen} />
    </>
  );
}

function PinModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      <DialogContent className="sm:max-w-xs">
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
