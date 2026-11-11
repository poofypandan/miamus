"use client";

import { Check, Minus, Plus } from "lucide-react";
import type { OwnerLocale } from "@/lib/owner-locale";
import {
  SHAPE_LIMITS,
  cadenceLabel,
  leftOut,
  type DraftChore,
  type DraftRoom,
  type SetupDraft,
  type Shape,
} from "@/lib/setup-templates";
import { cn } from "@/lib/utils";

/**
 * "Your home" (Phase 172 PR A2, D5): the shape row of steppers and chips,
 * then rooms by floor with their chores, then Outside, then bills.
 * Everything starts ticked; the owner unticks. What the household already
 * has shows Added with no checkbox (D7).
 *
 * Takes a locale prop and assumes nothing owner-only (section 7's hook: a
 * head staff member may run it later, in Indonesian). Chore and room names
 * are Indonesian, as saved; English owners see the meaning beside them.
 */
export function SetupReview({
  draft,
  shape,
  onShape,
  unticked,
  onToggle,
  added,
  locale,
}: {
  draft: SetupDraft;
  shape: Shape;
  onShape: (next: Shape) => void;
  unticked: ReadonlySet<string>;
  onToggle: (key: string) => void;
  added: ReadonlySet<string>;
  locale: OwnerLocale;
}) {
  const en = locale === "en";
  const tr = (e: string, i: string) => (en ? e : i);
  const out = leftOut(draft, unticked);

  const choresIn = (place: string | null) => draft.chores.filter((c) => c.place === place);
  const roomsOn = (floor: string | null, outside: boolean) =>
    draft.rooms.filter((r) => !r.inside && r.floor === floor && r.outside === outside);
  const inside = (room: DraftRoom) => draft.rooms.filter((r) => r.inside === room.key);

  const roomBlock = (room: DraftRoom, nested = false) => (
    <div key={room.key} className={cn("flex flex-col", nested && "ml-6 border-l pl-3")}>
      <Row
        label={room.name}
        meaning={en ? room.en : null}
        checked={!out.has(room.key)}
        disabled={!!room.inside && out.has(room.inside)}
        added={added.has(room.key)}
        addedLabel={tr("Added", "Sudah ditambahkan")}
        onToggle={() => onToggle(room.key)}
        strong
      />
      {choresIn(room.key).map((c) => choreRow(c, out.has(room.key)))}
      {inside(room).map((r) => roomBlock(r, true))}
    </div>
  );

  const choreRow = (c: DraftChore, parentOut: boolean) => (
    <div key={c.key} className="ml-6">
      <Row
        label={c.title}
        meaning={en ? c.en : null}
        detail={cadenceLabel(c, locale)}
        checked={!out.has(c.key)}
        disabled={parentOut}
        added={added.has(c.key)}
        addedLabel={tr("Added", "Sudah ditambahkan")}
        onToggle={() => onToggle(c.key)}
      />
    </div>
  );

  const floorsShown = draft.floors;
  const looseRooms = roomsOn(null, false);
  const outsideRooms = roomsOn(null, true);
  const houseChores = choresIn(null);

  return (
    <div className="flex flex-col gap-5">
      {/* The shape: all taps. Changing one rebuilds the list below (pure). */}
      <section aria-label={tr("Your home's shape", "Bentuk rumah Anda")} className="flex flex-col gap-3 rounded-xl border bg-card p-3">
        <Stepper label={tr("Floors", "Lantai")} value={shape.floors} limits={SHAPE_LIMITS.floors} onChange={(floors) => onShape({ ...shape, floors })} locale={locale} />
        <Stepper label={tr("Bedrooms", "Kamar tidur")} value={shape.bedrooms} limits={SHAPE_LIMITS.bedrooms} onChange={(bedrooms) => onShape({ ...shape, bedrooms })} locale={locale} />
        <Stepper label={tr("Bathrooms", "Kamar mandi")} value={shape.bathrooms} limits={SHAPE_LIMITS.bathrooms} onChange={(bathrooms) => onShape({ ...shape, bathrooms })} locale={locale} />
        <div className="flex flex-wrap gap-2 pt-1">
          {(
            [
              ["garden", tr("Garden", "Taman")],
              ["pool", tr("Pool", "Kolam")],
              ["carport", "Carport"],
              ["rooftop", "Rooftop"],
              ["staffRoom", tr("Staff room", "Kamar staf")],
              ["laundryRoom", tr("Laundry room", "Ruang cuci")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={shape[key]}
              onClick={() => onShape({ ...shape, [key]: !shape[key] })}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
                shape[key] ? "border-gray-900 bg-gray-900 text-white" : "bg-white text-gray-700 active:bg-muted"
              )}
            >
              {shape[key] && <Check className="size-3.5" aria-hidden />}
              {label}
            </button>
          ))}
        </div>
      </section>

      {floorsShown.map((floor) => {
        const rooms = roomsOn(floor.key, false);
        const floorChores = choresIn(floor.key);
        if (rooms.length === 0 && floorChores.length === 0) return null;
        return (
          <Group key={floor.key} title={floor.name}>
            {floorChores.length > 0 && (
              <div className="flex flex-col">
                <p className="px-1 pt-1 text-xs font-medium text-muted-foreground">{tr("Whole floor", "Seluruh lantai")}</p>
                {floorChores.map((c) => choreRow(c, false))}
              </div>
            )}
            {rooms.map((r) => roomBlock(r))}
          </Group>
        );
      })}

      {looseRooms.length > 0 && <Group title={tr("Rooms", "Ruangan")}>{looseRooms.map((r) => roomBlock(r))}</Group>}

      {houseChores.length > 0 && (
        <Group title={tr("Whole house", "Seluruh rumah")}>{houseChores.map((c) => choreRow(c, false))}</Group>
      )}

      {outsideRooms.length > 0 && <Group title={tr("Outside", "Luar rumah")}>{outsideRooms.map((r) => roomBlock(r))}</Group>}

      {draft.bills.length > 0 && (
        <Group title={tr("Bills and upkeep", "Tagihan dan perawatan")}>
          {draft.bills.map((b) => (
            <Row
              key={b.key}
              label={b.name}
              detail={`${cadenceLabel({ recurrence: b.recurrence, interval: b.interval, weekday: null, dueDate: b.dueDate }, locale)} · ${
                b.who === "me" ? tr("For you", "Untuk Anda") : tr("Anyone", "Siapa saja")
              }`}
              checked={!out.has(`bill:${b.key}`)}
              added={added.has(`bill:${b.key}`)}
              addedLabel={tr("Added", "Sudah ditambahkan")}
              onToggle={() => onToggle(`bill:${b.key}`)}
              strong
            />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="flex flex-col gap-1 rounded-xl border bg-card p-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  meaning,
  detail,
  checked,
  disabled,
  added,
  addedLabel,
  onToggle,
  strong,
}: {
  label: string;
  meaning?: string | null;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  added: boolean;
  addedLabel: string;
  onToggle: () => void;
  strong?: boolean;
}) {
  const body = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className={cn("text-sm text-gray-900", strong && "font-medium", (!checked || disabled) && !added && "text-gray-400 line-through")}>
        {label}
        {meaning && meaning !== label && <span className="ml-1.5 font-normal text-muted-foreground no-underline">{meaning}</span>}
      </span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </span>
  );
  if (added) {
    return (
      <div className="flex min-h-11 items-center gap-3 px-1">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
        </span>
        {body}
        <span className="shrink-0 text-xs text-muted-foreground">{addedLabel}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked && !disabled}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-left active:bg-muted disabled:opacity-60"
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border",
          checked && !disabled ? "border-gray-900 bg-gray-900 text-white" : "bg-white"
        )}
      >
        {checked && !disabled && <Check className="size-3.5" aria-hidden />}
      </span>
      {body}
    </button>
  );
}

function Stepper({
  label,
  value,
  limits,
  onChange,
  locale,
}: {
  label: string;
  value: number;
  limits: readonly [number, number];
  onChange: (next: number) => void;
  locale: OwnerLocale;
}) {
  const en = locale === "en";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={en ? `Fewer ${label.toLowerCase()}` : `Kurangi ${label.toLowerCase()}`}
          disabled={value <= limits[0]}
          onClick={() => onChange(value - 1)}
          className="flex size-10 items-center justify-center rounded-lg border bg-white active:bg-muted disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          aria-label={en ? `More ${label.toLowerCase()}` : `Tambah ${label.toLowerCase()}`}
          disabled={value >= limits[1]}
          onClick={() => onChange(value + 1)}
          className="flex size-10 items-center justify-center rounded-lg border bg-white active:bg-muted disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
