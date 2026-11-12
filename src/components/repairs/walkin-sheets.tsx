"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, HardHat, Loader2, Plus, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SpotField } from "@/components/chores/spot-field";
import { RoomSelect } from "@/components/repairs/room-select";
import { SyncedImg } from "@/components/shared/synced-img";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useLocationName } from "@/hooks/use-household-locations";
import { useRepairs } from "@/hooks/use-repairs";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { compressPhoto } from "@/lib/image";
import { discardPhoto, enqueuePhoto } from "@/lib/photo-queue";
import { SaveStillWaitingError } from "@/lib/offline-queue";
import { isFreshCapture } from "@/lib/staff-agenda";
import { REPAIR_LIMITS, isOpenRepair } from "@/lib/repairs";
import {
  DEVELOPER_CHIP,
  WALKIN_LIMITS,
  isOpenWalkIn,
  lastWorkerName,
  recentWorkerNames,
  staffOutcomeLabel,
  ownerOutcomeLabel,
  supervisingNow,
  supervisionStretches,
  walkInSpanLabel,
} from "@/lib/repair-walkins";
import { finishWalkIn, handOverSupervision, startWalkIn, undoFinish, undoWalkIn } from "@/lib/walkin-actions";
import type { OwnerLocale } from "@/lib/owner-locale";
import { cn } from "@/lib/utils";
import type { Repair, RepairWalkIn, WalkInOutcome } from "@/types/database";

/**
 * "Ada tukang datang" and "Selesai" (Phase 174, plan mockups 2–3): one sheet
 * each, no wizard. Shared by staff phones (Bahasa Indonesia only) and owners
 * ("Someone's here" from Chores → Repairs, D9), who pass their own locale.
 * Only "what" and the two photos are required (stop rules); the name, room,
 * chip and note are optional. Saves go through the save queue.
 */

const LAST_ROOM_KEY = "miamus-walkin-last-room";
const OUTCOMES: WalkInOutcome[] = ["fixed", "come_back", "check"];

function readLastRoom(): string | null {
  try {
    return window.localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

function rememberRoom(id: string | null) {
  try {
    if (id) window.localStorage.setItem(LAST_ROOM_KEY, id);
  } catch {
    // Private browsing: the list just isn't sorted by the last room.
  }
}

/** The words a sheet needs, staff (Indonesian only) or an owner's language. */
function useWords(locale: OwnerLocale, asStaff: boolean) {
  const id = asStaff || locale === "id";
  return (en: string, ind: string) => (id ? ind : en);
}

/**
 * A photo taken in a sheet that was closed without Simpan is for nothing:
 * off the phone, so it never uploads (as agenda-group-card's dropCapture).
 * Returns the call to make once the save holds the photo.
 */
function useDropUnsavedPhoto(photo: string | null): () => void {
  const photoRef = useRef(photo);
  const savedRef = useRef(false);
  useEffect(() => {
    photoRef.current = photo;
  }, [photo]);
  useEffect(
    () => () => {
      if (!savedRef.current && photoRef.current) void discardPhoto(photoRef.current);
    },
    []
  );
  return () => {
    savedRef.current = true;
  };
}

// --- The live-camera tile ------------------------------------------------------

/**
 * A photo from the live camera only (Phase 173's rule): `capture` opens the
 * camera, and a file more than 2 minutes from the phone's clock is refused.
 * Kept on the phone and uploaded in the background (Phase 138); the save
 * waits for it in the queue.
 */
function LiveCameraTile({
  value,
  onChange,
  label,
  hint,
  pathPrefix,
  disabled,
  t,
  testId,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  hint: string;
  pathPrefix: string;
  disabled?: boolean;
  t: (en: string, id: string) => string;
  testId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function take(file: File | undefined) {
    if (!file || busy) return;
    if (!isFreshCapture(file.lastModified)) {
      toast.error(t("Take the photo with the camera, now.", "Ambil foto langsung dari kamera."));
      return;
    }
    setBusy(true);
    try {
      const url = await enqueuePhoto(await compressPhoto(file), pathPrefix);
      if (value) void discardPhoto(value);
      onChange(url);
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't keep the photo. Try again.", "Gagal menyimpan foto. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid={testId}
        aria-label={label}
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void take(file);
        }}
      />
      {value ? (
        <div className="flex items-end gap-2">
          <SyncedImg url={value} size={320} className="aspect-[4/3] w-2/3 rounded-xl bg-muted object-cover" />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-xl"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            <Camera /> {t("Retake", "Foto ulang")}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[4/3] w-2/3 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-zinc-300 bg-card p-3 text-center text-sm text-muted-foreground active:bg-muted"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-6 text-gray-700" />}
          {hint}
        </button>
      )}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm disabled:opacity-50",
        on ? "border-zinc-900 bg-zinc-900 text-white" : "bg-card text-gray-800 active:bg-muted"
      )}
    >
      {on && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  );
}

// --- Ada tukang datang ------------------------------------------------------------

export function WalkInStartSheet({
  open,
  onClose,
  locale,
  asStaff,
  onOpenScheduled,
  onFinishOther,
}: {
  open: boolean;
  onClose: () => void;
  locale: OwnerLocale;
  asStaff: boolean;
  /** A picked repair has a visit scheduled today: open that chore instead (no double log). */
  onOpenScheduled?: (repairId: string) => boolean;
  /** This person is still supervising another walk-in: close it first. */
  onFinishOther?: (visit: RepairWalkIn) => void;
}) {
  useBackToClose(open, onClose);
  const t = useWords(locale, asStaff);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-center text-lg font-semibold">
            {t("Someone's here", "Ada tukang datang")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("What's being fixed, who, and a before photo.", "Apa yang diperbaiki, siapa, dan foto sebelum.")}
          </SheetDescription>
        </SheetHeader>
        {open && (
          <StartForm
            locale={locale}
            asStaff={asStaff}
            onDone={onClose}
            onOpenScheduled={onOpenScheduled}
            onFinishOther={onFinishOther}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StartForm({
  locale,
  asStaff,
  onDone,
  onOpenScheduled,
  onFinishOther,
}: {
  locale: OwnerLocale;
  asStaff: boolean;
  onDone: () => void;
  onOpenScheduled?: (repairId: string) => boolean;
  onFinishOther?: (visit: RepairWalkIn) => void;
}) {
  const t = useWords(locale, asStaff);
  const placeName = useLocationName();
  const { userRole } = useHousehold();
  const { repairs, walkIns, supervision } = useRepairs();
  const ids = { title: useId(), room: useId(), other: useId() };
  const [staffId] = useState(() => readActiveStaffId());
  // An owner on either view files as an owner: their repair starts open.
  const owner = userRole === "owner";
  // An owner is told it's saved, not that "the owners" can see it (demo check P-16).
  const savedLine = owner ? t("Saved.", "Tersimpan.") : t("Saved. Shown to the owners.", "Tersimpan. Pemilik rumah bisa melihatnya.");

  // Open repairs without someone on them now, the last room's first.
  const choices = useMemo(() => {
    const working = new Set(walkIns.filter(isOpenWalkIn).map((v) => v.repair_id));
    const lastRoom = readLastRoom();
    return repairs
      .filter((r) => (isOpenRepair(r, walkIns) || r.status === "reported") && !working.has(r.id))
      .sort(
        (a, b) =>
          Number(b.location_id === lastRoom && !!lastRoom) - Number(a.location_id === lastRoom && !!lastRoom) ||
          Number(b.urgent) - Number(a.urgent) ||
          b.created_at.localeCompare(a.created_at)
      );
  }, [repairs, walkIns]);

  const [pick, setPick] = useState<string | "new" | null>(() => null);
  useEffect(() => {
    // Nothing open to choose from: straight to "Baru".
    if (pick === null && choices.length === 0) setPick("new");
  }, [pick, choices.length]);
  const [title, setTitle] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [spot, setSpot] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [otherName, setOtherName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const markSaved = useDropUnsavedPhoto(photo);
  const [saving, setSaving] = useState(false);
  // The id the repair and the photo folder share, made once per opening.
  const [newRepairId] = useState(() => crypto.randomUUID());
  const [visitId] = useState(() => crypto.randomUUID());

  const names = useMemo(() => recentWorkerNames(walkIns), [walkIns]);
  // Recent rooms of repairs, as chips before the full list.
  const recentRooms = useMemo(() => {
    const seen: string[] = [];
    for (const r of [...repairs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      if (r.location_id && !seen.includes(r.location_id)) seen.push(r.location_id);
      if (seen.length === 2) break;
    }
    return seen;
  }, [repairs]);

  // Still supervising another walk-in: one at a time (migrations/149, supervision_busy).
  const busyWith = useMemo(() => {
    if (!staffId) return null;
    const now = supervisingNow(supervisionStretches(supervision, walkIns, repairs), walkIns).get(staffId);
    return now ? (walkIns.find((v) => v.id === now.visitId) ?? null) : null;
  }, [staffId, supervision, walkIns, repairs]);

  function choose(next: string | "new") {
    setPick(next);
    if (next === "new") return;
    if (onOpenScheduled?.(next)) return;
    const last = lastWorkerName(next, walkIns);
    if (last) {
      setWho(last);
      setOtherName(null);
    }
  }

  const repairId = pick === "new" ? newRepairId : pick;
  const name = (otherName ?? who ?? "").trim();
  const canSave =
    !!pick && (pick !== "new" || title.trim().length > 0) && !!photo && !saving && !busyWith && (!asStaff || owner || !!staffId);

  async function save() {
    if (!canSave || !repairId || !photo) return;
    setSaving(true);
    const repair =
      pick === "new"
        ? {
            id: newRepairId,
            title: title.trim().slice(0, REPAIR_LIMITS.title),
            location_id: locationId,
            spot: locationId ? spot : null,
            status: (owner ? "open" : "reported") as "open" | "reported",
            reported_by_staff: owner ? null : staffId,
          }
        : null;
    try {
      const outcome = await startWalkIn(
        {
          id: visitId,
          repair_id: repairId,
          worker_name: name ? name.slice(0, WALKIN_LIMITS.workerName) : null,
          logged_by_staff: staffId,
          arrived_phone_at: new Date().toISOString(),
          before_photo_url: photo,
        },
        repair
      );
      markSaved();
      rememberRoom(pick === "new" ? locationId : (repairs.find((r) => r.id === pick)?.location_id ?? null));
      const created = pick === "new" ? newRepairId : null;
      toast.success(
        outcome.status === "waiting"
          ? t("Kept on this phone. It sends itself when there's signal.", "Tersimpan di HP. Terkirim otomatis saat ada sinyal.")
          : savedLine,
        {
          duration: 8000,
          action: {
            label: t("Undo", "Batalkan"),
            onClick: () => {
              void undoWalkIn(visitId, created, photo)
                .then((ok) =>
                  ok
                    ? toast(t("Undone.", "Dibatalkan."))
                    : toast.error(t("Over 5 minutes, it stays.", "Sudah lewat 5 menit, tidak bisa dibatalkan."))
                )
                .catch((err) =>
                  toast.error(
                    err instanceof SaveStillWaitingError
                      ? t("Still sending. Try again in a moment.", "Masih dikirim. Coba lagi sebentar.")
                      : t("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi.")
                  )
                );
            },
          },
        }
      );
      onDone();
    } catch (err) {
      console.error(err);
      const message = (err as { message?: string } | null)?.message ?? "";
      toast.error(
        /supervision_busy/.test(message)
          ? t("You're still supervising another repair.", "Anda masih mengawasi perbaikan lain.")
          : t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi.")
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      {busyWith && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            {t("You're still supervising", "Anda masih mengawasi")}:{" "}
            {repairs.find((r) => r.id === busyWith.repair_id)?.title ?? ""}
          </p>
          {onFinishOther && (
            <Button type="button" variant="outline" className="min-h-11 rounded-xl bg-white" onClick={() => onFinishOther(busyWith)}>
              {t("Finish or hand over", "Selesai atau ganti yang mengawasi")}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("What's being fixed?", "Apa yang diperbaiki?")}>
        <p className="text-sm font-semibold text-gray-800">{t("What's being fixed?", "Apa yang diperbaiki?")}</p>
        {choices.map((r) => (
          <RepairOption
            key={r.id}
            repair={r}
            place={placeName(r.location_id, r.spot)}
            on={pick === r.id}
            onPick={() => choose(r.id)}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={pick === "new"}
          onClick={() => choose("new")}
          className={cn(
            "flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-sm",
            pick === "new" ? "border-[1.5px] border-zinc-900" : "active:bg-muted"
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 font-medium">{t("New", "Baru")}</span>
        </button>
      </div>

      {pick === "new" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.title} className="text-sm font-semibold text-gray-800">
              {t("What's broken?", "Apa yang rusak?")}
            </label>
            <Input
              id={ids.title}
              value={title}
              maxLength={REPAIR_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("e.g. Loose socket", "mis. Stopkontak longgar")}
              className="min-h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {recentRooms.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {recentRooms.map((room) => (
                  <Chip
                    key={room}
                    on={locationId === room}
                    onClick={() => {
                      setLocationId(locationId === room ? null : room);
                      setSpot(null);
                    }}
                  >
                    {placeName(room, null)}
                  </Chip>
                ))}
              </div>
            )}
            <RoomSelect
              id={ids.room}
              value={locationId}
              onChange={(next) => {
                setLocationId(next);
                setSpot(null);
              }}
              locale={asStaff ? "id" : locale}
            />
          </div>
          {locationId && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-gray-800">
                {t("Spot (optional)", "Bagian (boleh dikosongkan)")}
              </p>
              <SpotField value={spot} onChange={setSpot} placeIds={[locationId]} locale={asStaff ? "id" : locale} />
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-800">
          {t("Who?", "Siapa?")}{" "}
          <span className="font-normal text-muted-foreground">{t("(optional)", "(boleh dikosongkan)")}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {[DEVELOPER_CHIP, ...names].map((n) => (
            <Chip
              key={n}
              on={otherName === null && who === n}
              onClick={() => {
                setOtherName(null);
                setWho(who === n ? null : n);
              }}
            >
              <HardHat className="size-3.5" aria-hidden />
              {n}
            </Chip>
          ))}
          <Chip
            on={otherName !== null}
            onClick={() => {
              setOtherName(otherName === null ? "" : null);
              setWho(null);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            {t("Other name", "Nama lain")}
          </Chip>
        </div>
        {otherName !== null && (
          <Input
            id={ids.other}
            aria-label={t("Name", "Nama")}
            value={otherName}
            maxLength={WALKIN_LIMITS.workerName}
            onChange={(e) => setOtherName(e.target.value)}
            placeholder={t("e.g. Pak Budi, AC", "mis. Pak Budi, tukang AC")}
            className="min-h-12 text-base"
            autoComplete="off"
          />
        )}
      </div>

      <LiveCameraTile
        value={photo}
        onChange={setPhoto}
        label={t("Before photo", "Foto sebelum diperbaiki")}
        hint={t("Photo of the part being fixed", "Foto bagian yang diperbaiki")}
        pathPrefix={`repairs/${repairId ?? newRepairId}`}
        disabled={saving}
        t={t}
        testId="walkin-before-input"
      />

      <Button type="button" className="min-h-[52px] rounded-xl text-base" disabled={!canSave} onClick={() => void save()}>
        {saving && <Loader2 className="animate-spin" />}
        {t("Save", "Simpan")}
      </Button>
    </div>
  );
}

function RepairOption({
  repair,
  place,
  on,
  onPick,
}: {
  repair: Repair;
  place: string | null;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm",
        on ? "border-[1.5px] border-zinc-900" : "active:bg-muted"
      )}
    >
      <span
        className={cn(
          "size-[18px] shrink-0 rounded-full border-[1.5px] border-zinc-400",
          on && "border-[5px] border-zinc-900"
        )}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{repair.title}</span>
        {place && <span className="truncate text-xs text-muted-foreground">{place}</span>}
      </span>
    </button>
  );
}

// --- Selesai -----------------------------------------------------------------------

export function WalkInFinishSheet({
  visit,
  onClose,
  locale,
  asStaff,
}: {
  visit: RepairWalkIn | null;
  onClose: () => void;
  locale: OwnerLocale;
  asStaff: boolean;
}) {
  useBackToClose(!!visit, onClose);
  const t = useWords(locale, asStaff);
  const [handingOver, setHandingOver] = useState(false);
  return (
    <>
      <Sheet open={!!visit && !handingOver} onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-center text-lg font-semibold">{t("Finished", "Selesai")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("An after photo, and how it went.", "Foto sesudah, dan bagaimana hasilnya.")}
            </SheetDescription>
          </SheetHeader>
          {visit && (
            <FinishForm
              key={visit.id}
              visit={visit}
              locale={locale}
              asStaff={asStaff}
              onDone={onClose}
              onHandOver={() => setHandingOver(true)}
            />
          )}
        </SheetContent>
      </Sheet>
      <HandOverSheet
        visit={handingOver ? visit : null}
        locale={locale}
        asStaff={asStaff}
        onClose={() => setHandingOver(false)}
        onDone={() => {
          setHandingOver(false);
          onClose();
        }}
      />
    </>
  );
}

function FinishForm({
  visit,
  locale,
  asStaff,
  onDone,
  onHandOver,
}: {
  visit: RepairWalkIn;
  locale: OwnerLocale;
  asStaff: boolean;
  onDone: () => void;
  onHandOver: () => void;
}) {
  const t = useWords(locale, asStaff);
  const reader: OwnerLocale = asStaff ? "id" : locale;
  const { repairs, supervision } = useRepairs();
  const { userRole } = useHousehold();
  // An owner is told it's saved, not that "the owners" can see it (demo check P-16).
  const savedLine =
    userRole === "owner" ? t("Saved.", "Tersimpan.") : t("Saved. Shown to the owners.", "Tersimpan. Pemilik rumah bisa melihatnya.");
  const repair = repairs.find((r) => r.id === visit.repair_id);
  // Who this Selesai frees: their next walk-in waits behind it in the queue.
  const supervisor = supervision.find((s) => s.visit_id === visit.id && !s.ended_at)?.staff_id ?? null;
  const [photo, setPhoto] = useState<string | null>(null);
  const markSaved = useDropUnsavedPhoto(photo);
  const [outcome, setOutcome] = useState<WalkInOutcome | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!photo || saving) return;
    setSaving(true);
    try {
      const result = await finishWalkIn(visit.id, {
        after_photo_url: photo,
        left_phone_at: new Date().toISOString(),
        outcome,
        note: note.trim() ? note.trim().slice(0, WALKIN_LIMITS.note) : null,
      }, supervisor);
      markSaved();
      const after = photo;
      toast.success(
        result.status === "waiting"
          ? t("Kept on this phone. It sends itself when there's signal.", "Tersimpan di HP. Terkirim otomatis saat ada sinyal.")
          : savedLine,
        {
          duration: 8000,
          action: {
            label: t("Undo", "Batalkan"),
            onClick: () => {
              void undoFinish(visit.id, after)
                .then((ok) =>
                  ok
                    ? toast(t("Undone.", "Dibatalkan."))
                    : toast.error(t("Over 5 minutes, it stays.", "Sudah lewat 5 menit, tidak bisa dibatalkan."))
                )
                .catch((err) =>
                  toast.error(
                    err instanceof SaveStillWaitingError
                      ? t("Still sending. Try again in a moment.", "Masih dikirim. Coba lagi sebentar.")
                      : t("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi.")
                  )
                );
            },
          },
        }
      );
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3 rounded-xl border p-2.5">
        <SyncedImg url={visit.before_photo_url} size={160} className="size-11 shrink-0 rounded-lg bg-muted object-cover" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{repair?.title ?? ""}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[visit.worker_name, walkInSpanLabel(visit, reader)].filter(Boolean).join(" · ")}
          </span>
        </span>
      </div>

      <LiveCameraTile
        value={photo}
        onChange={setPhoto}
        label={t("After photo", "Foto sesudah diperbaiki")}
        hint={t("Photo of the part that was fixed", "Foto bagian yang diperbaiki")}
        pathPrefix={`repairs/${visit.repair_id}`}
        disabled={saving}
        t={t}
        testId="walkin-after-input"
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-800">
          {t("How did it go?", "Bagaimana hasilnya?")}{" "}
          <span className="font-normal text-muted-foreground">{t("(optional)", "(boleh dikosongkan)")}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <Chip key={o} on={outcome === o} onClick={() => setOutcome(outcome === o ? null : o)}>
              {asStaff ? staffOutcomeLabel(o) : ownerOutcomeLabel(o, locale)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`walkin-note-${visit.id}`} className="text-sm font-semibold text-gray-800">
          {t("Note", "Catatan")}{" "}
          <span className="font-normal text-muted-foreground">{t("(optional)", "(boleh dikosongkan)")}</span>
        </label>
        <Textarea
          id={`walkin-note-${visit.id}`}
          value={note}
          maxLength={WALKIN_LIMITS.note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="text-base"
        />
      </div>

      <Button type="button" className="min-h-[52px] rounded-xl text-base" disabled={!photo || saving} onClick={() => void save()}>
        {saving && <Loader2 className="animate-spin" />}
        {t("Save", "Simpan")}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11 rounded-xl" disabled={saving} onClick={onHandOver}>
        <UserRoundCog /> {t("Hand over supervision", "Ganti yang mengawasi")}
      </Button>
    </div>
  );
}

// --- Ganti yang mengawasi ------------------------------------------------------------

/**
 * Hands the walk-in to someone else on the roster, staff or an owner (D11):
 * the database closes the current stretch and opens theirs at the same time.
 * Someone already supervising another walk-in can't take a second.
 */
export function HandOverSheet({
  visit,
  locale,
  asStaff,
  onClose,
  onDone,
}: {
  visit: RepairWalkIn | null;
  locale: OwnerLocale;
  asStaff: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  useBackToClose(!!visit, onClose);
  const t = useWords(locale, asStaff);
  const { profiles } = useStaffProfiles();
  const { repairs, walkIns, supervision } = useRepairs();
  const [to, setTo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stretches = useMemo(() => supervisionStretches(supervision, walkIns, repairs), [supervision, walkIns, repairs]);
  const now = useMemo(() => supervisingNow(stretches, walkIns), [stretches, walkIns]);
  const current = visit ? stretches.find((s) => s.visitId === visit.id && !s.end)?.staffId ?? null : null;
  const name = useStaffNameLookup(profiles, "");

  async function save() {
    if (!visit || !to || saving) return;
    setSaving(true);
    try {
      const outcome = await handOverSupervision(visit.id, to, current);
      toast.success(
        outcome.status === "waiting"
          ? t("Kept on this phone. It sends itself when there's signal.", "Tersimpan di HP. Terkirim otomatis saat ada sinyal.")
          : t(`${name(to)} is supervising now.`, `Sekarang ${name(to)} yang mengawasi.`)
      );
      setTo(null);
      onDone();
    } catch (err) {
      console.error(err);
      const message = (err as { message?: string } | null)?.message ?? "";
      toast.error(
        /supervision_busy/.test(message)
          ? t("They're supervising another repair.", "Orang itu sedang mengawasi perbaikan lain.")
          : t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi.")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!visit} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[80dvh] max-w-md overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-center">{t("Hand over supervision", "Ganti yang mengawasi")}</SheetTitle>
          <SheetDescription className="sr-only">{t("Who takes over?", "Siapa yang menggantikan?")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            {(profiles ?? [])
              .filter((p) => p.id !== current)
              .map((p) => {
                const busyElsewhere = now.has(p.id) && now.get(p.id)!.visitId !== visit?.id;
                return (
                  <Chip key={p.id} on={to === p.id} disabled={busyElsewhere} onClick={() => setTo(to === p.id ? null : p.id)}>
                    {p.name}
                  </Chip>
                );
              })}
          </div>
          <Button type="button" className="min-h-[52px] rounded-xl text-base" disabled={!to || saving} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" />}
            {t("Save", "Simpan")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
