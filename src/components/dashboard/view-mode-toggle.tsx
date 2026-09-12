"use client";

import { useHousehold } from "@/context/household-context";
import { cn } from "@/lib/utils";

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useHousehold();

  return (
    <div className="mx-4 mt-2 flex gap-1 rounded-lg bg-muted p-1">
      <button
        type="button"
        onClick={() => setViewMode("all")}
        className={cn(
          "min-h-[40px] flex-1 rounded-md text-sm font-medium transition-colors",
          viewMode === "all"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Overview
      </button>
      <button
        type="button"
        onClick={() => setViewMode("single")}
        className={cn(
          "min-h-[40px] flex-1 rounded-md text-sm font-medium transition-colors",
          viewMode === "single"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Your Pets
      </button>
    </div>
  );
}
