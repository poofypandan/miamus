"use client";

import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { dataProvider } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { HouseholdLocation } from "@/types/database";

/** Enough to choose from without pushing the rest of the form off screen. */
const MAX_OPTIONS = 6;

/**
 * The chore editor's room picker (Phase 135): type to filter the household's
 * rooms, tap one — or, for a name the household does not have yet, tap
 * "Create '…'", which saves the room and selects it in the same step.
 *
 * The options open under the input, in the form's own flow, rather than in a
 * floating popover: this lives in a scrolling dialog on a phone, where a
 * popover has to fight the dialog's focus trap and the on-screen keyboard for
 * room. Here the dialog simply scrolls.
 *
 * Owner-only by construction — it is only ever in the owner's editor, and
 * migrations/105 refuses a room from anyone else.
 */
export function LocationCombobox({
  value,
  onChange,
}: {
  value: HouseholdLocation | null;
  onChange: (room: HouseholdLocation | null) => void;
}) {
  const { locations, reload } = useHouseholdLocations();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const typed = query.trim();
  const matches = useMemo(() => {
    const needle = typed.toLowerCase();
    return (locations ?? [])
      .filter((room) => room.name.toLowerCase().includes(needle))
      .slice(0, MAX_OPTIONS);
  }, [locations, typed]);
  const exact = (locations ?? []).find(
    (room) => room.name.trim().toLowerCase() === typed.toLowerCase()
  );
  const canCreate = typed.length > 0 && typed.length <= 60 && !exact;
  const open = focused && (matches.length > 0 || canCreate);

  function choose(room: HouseholdLocation) {
    onChange(room);
    setQuery("");
    inputRef.current?.blur();
  }

  async function create() {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const room = await dataProvider.createHouseholdLocation(typed);
      choose(room);
      // Into the shared cache, so every card can name it once the chore saves.
      void reload();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add the location");
    } finally {
      setCreating(false);
    }
  }

  // Chosen: the room as a chip, and a way to clear it.
  if (value) {
    return (
      <div className="flex min-h-[48px] items-center gap-2 rounded-lg border bg-amber-50/60 px-3">
        <MapPin className="size-4 shrink-0 text-amber-700" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{value.name}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            // Straight back to typing: clearing is nearly always to pick another.
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-label={`Remove location ${value.name}`}
          className="-mr-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Enter takes the room typed exactly, else makes it — never submits
            // the dialog from under a half-typed name.
            e.preventDefault();
            if (exact) choose(exact);
            else void create();
          }}
          placeholder={(locations ?? []).length > 0 ? "Choose or add a room" : "e.g. Kitchen"}
          className="min-h-[48px] pl-9"
        />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Locations"
          className="flex flex-col overflow-hidden rounded-lg border bg-popover p-1 shadow-sm"
        >
          {matches.map((room) => (
            <li key={room.id} role="option" aria-selected={false}>
              <button
                type="button"
                // mousedown, not click: the input's blur would close the list
                // before a click could land.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(room)}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2.5 text-left text-sm active:bg-muted"
              >
                <MapPin className="size-3.5 shrink-0 text-amber-700" />
                <span className="truncate">{room.name}</span>
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void create()}
                disabled={creating}
                className={cn(
                  "flex min-h-[44px] w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-medium text-primary active:bg-muted",
                  matches.length > 0 && "border-t"
                )}
              >
                {creating ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <Plus className="size-3.5 shrink-0" />
                )}
                <span className="truncate">Create &ldquo;{typed}&rdquo;</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
