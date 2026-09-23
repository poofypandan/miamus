"use client";

import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PIN_LENGTH = 4;

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

/**
 * The four-dot display and number pad, shared by every PIN prompt in the app.
 *
 * Extracted in Phase 87, when the owner PIN stopped being a way *in* (Google
 * is that now) and became the dashboard's screen lock — two callers, one pad.
 * Holds no PIN state of its own: the caller owns the value and decides what a
 * complete entry means.
 */
export function PinPad({
  pin,
  shake,
  onDigit,
  onBackspace,
}: {
  pin: string;
  shake?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}) {
  return (
    <>
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
              aria-label="Backspace"
              onClick={onBackspace}
            >
              <Delete className="size-5" />
            </Button>
          ) : (
            <Button
              key={i}
              type="button"
              variant="outline"
              className="min-h-[56px] text-xl font-semibold"
              onClick={() => onDigit(key)}
            >
              {key}
            </Button>
          )
        )}
      </div>
    </>
  );
}
