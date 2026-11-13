"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useT, type Translate } from "@/context/owner-locale-context";
import { useHousehold } from "@/context/household-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useToday } from "@/hooks/use-today";
import { dataProvider } from "@/lib/data";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { areaHasNobody, hiddenAreasOf, withArea, type StaffArea } from "@/lib/staff-areas";
import type { StaffProfile } from "@/types/database";

/**
 * What each staff member sees (Phase 178, step 1; lib/staff-areas.ts).
 *
 * Owners only, on a staff member's row in Settings → Staff: four switches,
 * all on by default. Each saves on the tap, with a toast (and Undo), like
 * the Features switches. It hides on the staff phone; it does not lock, so
 * the dialog says no more than "what Sari sees".
 */

export function areaLabel(area: StaffArea, t: Translate): string {
  switch (area) {
    case "home":
      return t("Chores for anyone", "Tugas untuk siapa saja");
    case "pets":
      return t("Pet routines", "Rutinitas hewan");
    case "kitchen":
      return t("Kitchen", "Dapur");
    case "repairs":
      return t("Repairs", "Perbaikan");
  }
}

/**
 * The switches this household has: Repairs only while Repairs is on, Pet
 * routines only while the home has pets. Kitchen always: the staff app's
 * Dapur pill is always there (shopping lives in it).
 */
export function useStaffAreaSwitches(): StaffArea[] {
  const { repairs } = useHouseholdFeatures();
  const { petsOn } = useHouseholdProfile();
  return useMemo(
    () => (["home", "pets", "kitchen", "repairs"] as StaffArea[]).filter(
      (area) => (area !== "pets" || petsOn) && (area !== "repairs" || repairs)
    ),
    [petsOn, repairs]
  );
}

/** "Doesn't see: Kitchen, Repairs" under a name on the staff list; null with everything on. */
export function StaffAreasLine({ profile }: { profile: StaffProfile }) {
  const t = useT();
  const switches = useStaffAreaSwitches();
  const hidden = hiddenAreasOf(profile).filter((area) => switches.includes(area));
  if (hidden.length === 0) return null;
  const names = hidden.map((area) => areaLabel(area, t)).join(", ");
  return (
    // Lined up under the name: the row's px-4, the 32 px avatar and gap-3.
    <p className="-mt-2 pr-4 pb-3 pl-[60px] text-xs text-muted-foreground">
      {t(`Doesn't see: ${names}`, `Tidak melihat: ${names}`)}
    </p>
  );
}

export function StaffAreasDialog({
  profile,
  staff,
  onClose,
  reload,
}: {
  /** The person whose areas are open, or null when closed. */
  profile: StaffProfile | null;
  /** Everyone on the roster now, for "nobody sees" (rule 3). */
  staff: StaffProfile[];
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const t = useT();
  const switches = useStaffAreaSwitches();
  const { leaveRequests } = useHousehold();
  const today = formatDateLocal(useToday());
  // What is hidden for the person whose dialog is open, as last saved from
  // here; the roster catches up on reload.
  const [hidden, setHidden] = useState<StaffArea[]>([]);
  // A save in flight, and for whom: switches lock only for that person.
  const [busy, setBusy] = useState<{ id: string; area: StaffArea } | null>(null);
  // Who is open now, for completions that land after the dialog moved on
  // (Codex, PR #131): a slow save for Ari must never repaint Syam's switches.
  const openId = useRef<string | null>(null);
  // Each person's list as last saved from this dialog, so a toast's Undo
  // reverses only its own area against the latest state, open or not.
  const saved = useRef(new Map<string, StaffArea[]>());
  // Saves per person not yet landed and read back into the roster.
  const pending = useRef(new Map<string, number>());

  useEffect(() => {
    openId.current = profile?.id ?? null;
    if (!profile) return;
    // The row it was opened from is the truth (another owner may have
    // changed it since; Codex, PR #131), unless a save of this dialog's for
    // the person hasn't landed and been read back yet: then that save's list.
    const inFlight = (pending.current.get(profile.id) ?? 0) > 0;
    const fresh = (inFlight && saved.current.get(profile.id)) || hiddenAreasOf(profile);
    saved.current.set(profile.id, fresh);
    setHidden(fresh);
    // Re-read only when the dialog opens on someone else: a reload after a
    // save must not flash the switch back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // The roster as it will be once this person's last change has landed.
  // Everyone else's too, while a save of theirs from this dialog hasn't been
  // read back into the roster yet (fallback review, PR #131). Worked out on
  // every render, not memoised: it reads the per-person refs.
  const roster = staff.map((p) => {
    if (profile && p.id === profile.id) return { ...p, hidden_areas: hidden };
    const landing = (pending.current.get(p.id) ?? 0) > 0 ? saved.current.get(p.id) : undefined;
    return landing ? { ...p, hidden_areas: landing } : p;
  });
  const nobody = (["pets", "home"] as const).filter(
    (area) => switches.includes(area) && areaHasNobody(area, roster, leaveRequests, today)
  );

  // One save at a time per person, switches and Undo alike (Codex, PR
  // #131): each list is worked out only once the save before it has landed,
  // so an Undo tapped while another switch is saving can't overwrite it.
  const queues = useRef(new Map<string, Promise<unknown>>());

  /** Shows (`visible`) or hides one area for one person, on top of their latest list. */
  function setArea(person: StaffProfile, area: StaffArea, visible: boolean): Promise<boolean> {
    pending.current.set(person.id, (pending.current.get(person.id) ?? 0) + 1);
    const done = () => pending.current.set(person.id, (pending.current.get(person.id) ?? 1) - 1);
    const run = (queues.current.get(person.id) ?? Promise.resolve()).then(async () => {
      const base = saved.current.get(person.id) ?? hiddenAreasOf(person);
      const next = withArea(base, area, visible);
      try {
        await dataProvider.setStaffHiddenAreas(person.id, next);
      } catch (err) {
        console.error(err);
        toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
        done();
        return false;
      }
      saved.current.set(person.id, next);
      if (openId.current === person.id) setHidden(next);
      // Pending until the roster has it, so a reopen in between still shows
      // this save; the toast doesn't wait for the read.
      void reload()
        .catch(() => {})
        .finally(done);
      return true;
    });
    queues.current.set(person.id, run);
    return run;
  }

  async function toggle(area: StaffArea) {
    if (!profile || busy?.id === profile.id) return;
    const person = profile;
    const visible = hidden.includes(area);
    setBusy({ id: person.id, area });
    const ok = await setArea(person, area, visible);
    setBusy((current) => (current?.id === person.id && current.area === area ? null : current));
    if (!ok) return;
    const name = areaLabel(area, t);
    toast.success(
      visible
        ? t(`${name} on for ${person.name}`, `${name} aktif untuk ${person.name}`)
        : t(`${name} off for ${person.name}`, `${name} dimatikan untuk ${person.name}`),
      {
        action: {
          label: t("Undo", "Batalkan"),
          onClick: () => {
            void setArea(person, area, !visible);
          },
        },
      }
    );
  }

  // Kept through the close animation, when `profile` is already null.
  const lastName = useRef("");
  if (profile) lastName.current = profile.name;
  const name = profile?.name ?? lastName.current;

  return (
    <Dialog open={!!profile} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 shrink-0" aria-hidden />
            {t(`What ${name} sees`, `Yang dilihat ${name}`)}
          </DialogTitle>
          <DialogDescription>
            {t(
              `Anything you give ${name} by name always shows.`,
              `Tugas yang Anda berikan langsung ke ${name} selalu terlihat.`
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border bg-card">
          {switches.map((area, index) => {
            const on = !hidden.includes(area);
            const label = areaLabel(area, t);
            return (
              <div
                key={area}
                className={`flex min-h-14 items-center gap-3 px-4 py-2 ${index > 0 ? "border-t" : ""}`}
              >
                <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
                <Switch
                  on={on}
                  label={label}
                  disabled={!!profile && busy?.id === profile.id}
                  onToggle={() => void toggle(area)}
                  busy={busy?.id === profile?.id && busy?.area === area ? <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" /> : undefined}
                />
              </div>
            );
          })}
        </div>

        {nobody.length > 0 && (
          <div className="flex flex-col gap-1">
            {nobody.map((area) => (
              <p key={area} className="text-xs text-muted-foreground">
                {area === "pets"
                  ? t(
                      "Nobody sees pet routines now, so every staff member sees them.",
                      "Sekarang tidak ada yang melihat rutinitas hewan, jadi semua staf melihatnya."
                    )
                  : t(
                      "Nobody sees chores for anyone now, so every staff member sees them.",
                      "Sekarang tidak ada yang melihat tugas untuk siapa saja, jadi semua staf melihatnya."
                    )}
              </p>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
