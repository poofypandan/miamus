"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Info,
  KeyRound,
  Loader2,
  PackageX,
  Plus,
  RotateCcw,
  Send,
  UserMinus,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PinPad, PIN_LENGTH } from "@/components/auth/pin-pad";
import { Skeleton } from "@/components/ui/skeleton";
import { InvitePanel } from "@/components/dashboard/invite-panel";
import { HouseCodePanel } from "@/components/dashboard/house-code-panel";
import { HouseholdMembersPanel } from "@/components/dashboard/household-members-panel";
import { SecuritySettings } from "@/components/dashboard/security-settings";
import { PushNotificationSettings } from "@/components/dashboard/push-notification-settings";
import { LanguageSettings } from "@/components/dashboard/language-settings";
import { useOwnerLocale, useT, type Translate } from "@/context/owner-locale-context";
import { DATE_LOCALE } from "@/lib/owner-locale";
import { ITEM_TYPE_LABELS } from "@/lib/item-types";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { useStaffProfiles, useStaffNameLookup } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { isOnLeave } from "@/lib/leave";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { LeavePanel } from "@/components/dashboard/leave-panel";
import { describeLog } from "@/lib/schedule-categories";
import { useFormatTime } from "@/components/ui/ui-labels";
import type { ProposalStatus, StaffProfile } from "@/types/database";

const AUDIT_LIMIT = 20;

type AuditKind = "log" | "proposal" | "alert";

interface AuditEntry {
  id: string;
  kind: AuditKind;
  at: string;
  action: string;
  subject: string;
  actor: string;
}

const KIND_META: Record<
  AuditKind,
  { icon: typeof Camera; label: (t: Translate) => string; className: string }
> = {
  log: { icon: Camera, label: (t) => t("Task", "Tugas"), className: "bg-zinc-100 text-zinc-700" },
  proposal: { icon: Send, label: (t) => t("Suggestion", "Usulan"), className: "bg-zinc-100 text-zinc-700" },
  alert: { icon: PackageX, label: (t) => t("Shopping", "Belanja"), className: "bg-zinc-100 text-zinc-700" },
};

function proposalStatus(status: ProposalStatus, t: Translate): string {
  if (status === "approved") return t("approved", "disetujui");
  if (status === "rejected") return t("rejected", "ditolak");
  return t("pending", "menunggu");
}

// Owner-facing: English or Bahasa Indonesia, as the owner chose (Phase 149).
export function StaffTab() {
  const { logs, routineProposals, inventoryAlerts, pets, schedules, loading } = useHousehold();
  const locale = useOwnerLocale();
  const t = useT();
  const isOwner = useRequireOwner();
  const { profiles, failed, reload, allProfiles } = useStaffProfiles();

  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));

  const petName = useMemo(() => {
    const byId = new Map(pets.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? t("Unknown pet", "Hewan tidak dikenal")) : t("Household", "Rumah"));
  }, [pets, t]);

  // Three tables, one chronology. Built from data the dashboard already holds
  // rather than re-querying, so the list stays in step with everything else on
  // screen.
  const entries = useMemo<AuditEntry[]>(() => {
    const rows: AuditEntry[] = [
      ...logs.map((log) => ({
        id: `log-${log.id}`,
        kind: "log" as const,
        at: log.completed_at,
        action: log.photo_url ? t("Logged with photo", "Dicatat dengan foto") : t("Logged", "Dicatat"),
        subject: `${describeLog(log, schedules).title} · ${petName(log.entity_id)}`,
        actor: staffName(log.staff_id),
      })),
      ...routineProposals.map((proposal) => ({
        id: `proposal-${proposal.id}`,
        kind: "proposal" as const,
        at: proposal.created_at,
        action: `${t("Suggested routine", "Usulan rutinitas")} · ${proposalStatus(proposal.status, t)}`,
        subject: `${proposal.title} · ${petName(proposal.pet_id)}`,
        // staff_id when the proposal was filed by someone who had signed in;
        // created_by ("staff"/"owner") is all the older rows carry — shown
        // in the app's words, not the database's (Phase 139).
        actor: proposal.staff_id
          ? staffName(proposal.staff_id)
          : proposal.created_by === "owner"
            ? t("Admin", "Admin")
            : t("Member", "Anggota"),
      })),
      ...inventoryAlerts.map((alert) => ({
        id: `alert-${alert.id}`,
        kind: "alert" as const,
        at: alert.created_at,
        action: t("Reported low stock", "Melaporkan stok menipis"),
        subject: `${ITEM_TYPE_LABELS[locale][alert.item_type]} · ${petName(alert.pet_id)}`,
        actor: staffName(alert.staff_id),
      })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, AUDIT_LIMIT);
  }, [logs, routineProposals, inventoryAlerts, schedules, petName, staffName, locale, t]);

  if (!isOwner) return null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HouseholdMembersPanel />

      <StaffRoster
        profiles={profiles}
        allProfiles={allProfiles}
        failed={failed}
        reload={reload}
      />

      <LeavePanel staffName={staffName} />

      <InvitePanel />

      <HouseCodePanel />

      <PushNotificationSettings />

      <LanguageSettings />

      <SecuritySettings />

      <h2 className="mt-2 text-sm font-semibold text-gray-900">{t("Activity", "Aktivitas")}</h2>

      {/* Stated rather than implied. Since Phase 71 each person signs in under
          their own name, so most rows can name someone — but that name is
          whoever was selected on the device, not a proven identity, and
          anything filed before Phase 71 has no author at all. Both limits are
          worth saying out loud rather than letting the list imply more
          certainty than it has. */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {t(
            "Names come from who was signed in on the phone, so they show who was on duty rather than proving who tapped. Entries from before name sign-ins simply read “Someone”.",
            "Nama diambil dari siapa yang masuk di HP, jadi menunjukkan siapa yang bertugas, bukan bukti siapa yang mengetuk. Catatan dari sebelum ada masuk dengan nama tertulis “Seseorang”."
          )}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">
          {t("No staff activity yet.", "Belum ada aktivitas staf.")}
        </p>
      ) : (
        <Card className="py-2">
          <CardContent className="flex flex-col divide-y px-0">
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const formatTime = useFormatTime();
  const locale = useOwnerLocale();
  const t = useT();
  const meta = KIND_META[entry.kind];
  const Icon = meta.icon;
  const at = new Date(entry.at);

  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm">
      <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${meta.className}`}>
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{entry.subject}</span>
        <span className="truncate text-xs text-muted-foreground">
          {entry.action} · {entry.actor}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs text-muted-foreground">
        <span className="block">{at.toLocaleDateString(DATE_LOCALE[locale], { month: "short", day: "numeric" })}</span>
        <span className="block tabular-nums">{formatTime(at)}</span>
      </span>
      <Badge variant="secondary" className="hidden shrink-0 text-[10px] sm:inline-flex">
        {meta.label(t)}
      </Badge>
    </div>
  );
}

function StaffRoster({
  profiles,
  allProfiles,
  failed,
  reload,
}: {
  /** On the roster now. */
  profiles: StaffProfile[] | null;
  /** Including people who have been taken off it (Phase 141). */
  allProfiles: StaffProfile[] | null;
  failed: boolean;
  reload: () => Promise<void>;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<StaffProfile | null>(null);
  // Who the owner is about to take off the roster, held until they confirm.
  const [removeTarget, setRemoveTarget] = useState<StaffProfile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const archived = useMemo(
    () => (allProfiles ?? []).filter((p) => p.archived_at),
    [allProfiles]
  );
  // Who is away today (Phase 140): a red badge on their row.
  const { leaveRequests } = useHousehold();
  const today = formatDateLocal(useToday());

  async function addStaff() {
    const name = newName.trim();
    if (!name) {
      toast.error(t("Enter a name first", "Masukkan nama dulu"));
      return;
    }
    setAdding(true);
    try {
      await dataProvider.createStaffProfile(name);
      await reload();
      setNewName("");
      toast.success(
        t(
          `${name} added — they choose their own PIN on first sign-in`,
          `${name} ditambahkan — PIN dipilih sendiri saat pertama masuk`
        )
      );
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to add this person", "Gagal menambahkan orang ini"));
    } finally {
      setAdding(false);
    }
  }

  async function archive(profile: StaffProfile) {
    setBusyId(profile.id);
    try {
      await dataProvider.archiveStaffProfile(profile.id);
      await reload();
      setRemoveTarget(null);
      toast.success(
        t(
          `${profile.name} removed — their past work keeps their name`,
          `${profile.name} dihapus — pekerjaan sebelumnya tetap atas namanya`
        )
      );
    } catch (err) {
      console.error(err);
      toast.error(t(`Couldn't remove ${profile.name}`, `Gagal menghapus ${profile.name}`));
    } finally {
      setBusyId(null);
    }
  }

  async function restore(profile: StaffProfile) {
    setBusyId(profile.id);
    try {
      await dataProvider.restoreStaffProfile(profile.id);
      await reload();
      toast.success(
        t(
          `${profile.name} is back — they pick a new PIN at next sign-in`,
          `${profile.name} kembali — dia memilih PIN baru saat masuk nanti`
        )
      );
    } catch (err) {
      console.error(err);
      toast.error(t(`Couldn't bring ${profile.name} back`, `Gagal mengembalikan ${profile.name}`));
    } finally {
      setBusyId(null);
    }
  }

  async function applyPin(profile: StaffProfile, pin: string | null) {
    setResetting(profile.id);
    try {
      await dataProvider.setStaffPin(profile.id, pin);
      await reload();
      toast.success(
        pin
          ? t(`${profile.name}'s PIN updated`, `PIN ${profile.name} diperbarui`)
          : t(
              `${profile.name} will choose a new PIN next time they sign in`,
              `${profile.name} akan memilih PIN baru saat masuk berikutnya`
            )
      );
      setPinTarget(null);
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to update PIN", "Gagal memperbarui PIN"));
    } finally {
      setResetting(null);
    }
  }

  // Staff only: admins sign in with Google and have their own section above
  // (HouseholdMembersPanel). Their roster rows still exist for chores and
  // names (migrations/106); they just aren't listed twice.
  const staff = profiles === null ? null : profiles.filter((p) => !p.user_id);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t("Staff", "Staf")}</h2>

      {/* How the pieces fit (Phase 120). A new owner meets a roster, an
          invite card further down and the word "PIN" with nothing saying they
          are one flow — and which half the staff member does themselves. */}
      <ol className="flex flex-col gap-1.5 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-gray-900">{t("1. Add each person", "1. Tambahkan setiap orang")}</span>{" "}
          {t(
            "who helps run the house, by name, below.",
            "yang membantu di rumah, dengan namanya, di bawah."
          )}
        </li>
        <li>
          <span className="font-medium text-gray-900">{t("2. Invite their phone", "2. Undang HP-nya")}</span>{" "}
          {t(
            "with a staff-phone link (under Invite someone). A shared house phone works too.",
            "dengan link HP staf (di bagian Undang). HP bersama di rumah juga bisa."
          )}
        </li>
        <li>
          <span className="font-medium text-gray-900">{t("3. They sign in", "3. Mereka masuk")}</span>{" "}
          {t(
            `on that phone by tapping their name and choosing a ${PIN_LENGTH}-digit PIN. You never need to know it.`,
            `di HP itu dengan mengetuk namanya dan memilih PIN ${PIN_LENGTH} angka. Anda tidak perlu tahu PIN-nya.`
          )}
        </li>
      </ol>

      <SetPinDialog
        profile={pinTarget}
        busy={!!pinTarget && resetting === pinTarget.id}
        onClose={() => setPinTarget(null)}
        onSubmit={(pin) => pinTarget && applyPin(pinTarget, pin)}
      />

      {failed ? (
        <p className="text-sm text-destructive">
          {t("Couldn't load the list of people.", "Daftar orang gagal dimuat.")}
        </p>
      ) : staff === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <Card className="py-2">
          <CardContent className="flex flex-col divide-y px-0">
            {staff.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {t(
                  "Nobody yet. Add the first name below — their PIN can wait until they sign in.",
                  "Belum ada. Tambahkan nama pertama di bawah — PIN-nya bisa menunggu sampai mereka masuk."
                )}
              </p>
            ) : (
              staff.map((profile) => (
                <div key={profile.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <UserRound className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{profile.name}</span>
                      {isOnLeave(leaveRequests, profile.id, today) && (
                        <Badge className="shrink-0 bg-red-100 text-[10px] text-red-700">
                          {t("On Leave", "Cuti")}
                        </Badge>
                      )}
                    </span>
                    {/* The PIN itself is never shown, and cannot be: it is a
                        bcrypt hash in a column no client may read
                        (migrations/095-096). Only whether one exists. */}
                    <span className="text-xs text-muted-foreground">
                      {profile.has_pin
                        ? t("PIN set", "PIN sudah diatur")
                        : t("No PIN yet", "Belum ada PIN")}
                    </span>
                  </span>
                  <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[40px] shrink-0"
                        onClick={() => setPinTarget(profile)}
                        disabled={resetting === profile.id}
                      >
                        {resetting === profile.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <KeyRound />
                        )}
                        {profile.has_pin ? t("Change PIN", "Ubah PIN") : t("Set PIN", "Atur PIN")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[40px] shrink-0 px-2 text-destructive"
                        onClick={() => setRemoveTarget(profile)}
                        disabled={busyId === profile.id}
                        aria-label={t(`Remove ${profile.name}`, `Hapus ${profile.name}`)}
                      >
                        {busyId === profile.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <UserMinus className="size-4" />
                        )}
                      </Button>
                    </>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card className="py-4">
        {/* A form, so the keyboard's Go / Enter adds the name too (Phase 120). */}
        <form
          className="flex flex-col gap-3 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding) void addStaff();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-staff-name" className="text-xs">
              {t("New person's name", "Nama orang baru")}
            </Label>
            <Input
              id="new-staff-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("e.g. Budi", "mis. Budi")}
              maxLength={40}
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "The name they'll tap when signing in with a PIN, so use what they go by.",
                "Nama yang mereka ketuk saat masuk dengan PIN, jadi pakai nama panggilannya."
              )}
            </p>
          </div>
          <Button type="submit" disabled={adding} className="min-h-[48px]">
            {adding ? <Loader2 className="animate-spin" /> : <Plus />} {t("Add Person", "Tambah Orang")}
          </Button>
        </form>
      </Card>

      {/* Kept visible rather than hidden away: their name is still on months
          of finished work, so an owner who finds it there needs somewhere
          that explains why, and a way back if they tapped the wrong person. */}
      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-gray-500">
            {t("No longer here", "Sudah tidak bekerja")}
          </h3>
          <Card className="py-2">
            <CardContent className="flex flex-col divide-y px-0">
              {archived.map((profile) => (
                <div key={profile.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                    <UserRound className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-muted-foreground">
                      {profile.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(() => {
                        const when = profile.archived_at
                          ? new Date(profile.archived_at).toLocaleDateString(
                              locale === "id" ? "id-ID" : "en-US",
                              { month: "short", day: "numeric" }
                            )
                          : "";
                        return t(
                          `Removed ${when} · past work still shows their name`,
                          `Dihapus ${when} · pekerjaan sebelumnya tetap menampilkan namanya`
                        );
                      })()}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[40px] shrink-0"
                    onClick={() => restore(profile)}
                    disabled={busyId === profile.id}
                  >
                    {busyId === profile.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    {t("Bring back", "Kembalikan")}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(`Remove ${removeTarget?.name ?? ""}?`, `Hapus ${removeTarget?.name ?? ""}?`)}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p>
                  {t(
                    "Their PIN stops working straight away, and their name comes off the sign-in screen and every assignee list.",
                    "PIN-nya langsung tidak berlaku, dan namanya hilang dari layar masuk dan dari semua daftar penugasan."
                  )}
                </p>
                <p>
                  {t(
                    "Anything of theirs that is still unfinished goes back to Unassigned, so someone else can pick it up. Everything they already finished keeps their name on it.",
                    "Tugasnya yang belum selesai kembali ke Belum ditugaskan, supaya bisa diambil orang lain. Semua yang sudah selesai tetap atas namanya."
                  )}
                </p>
                <p>
                  {t(
                    "Phones they last signed in on are signed out too. If they had their own phone, also remove it under Linked staff phones.",
                    "HP yang terakhir mereka pakai untuk masuk juga ikut keluar. Kalau mereka punya HP sendiri, hapus juga di HP staf yang terhubung."
                  )}
                </p>
                <p>
                  {t(
                    "You can bring them back later if you need to.",
                    "Anda bisa mengembalikannya nanti jika perlu."
                  )}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setRemoveTarget(null)}
            >
              {t("Cancel", "Batal")}
            </Button>
            <Button
              variant="destructive"
              className="min-h-[44px]"
              disabled={!!busyId}
              onClick={() => removeTarget && archive(removeTarget)}
            >
              {busyId ? <Loader2 className="animate-spin" /> : <UserMinus />}{" "}
              {t("Remove", "Hapus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/**
 * Setting a staff member's PIN, or handing the choice back to them.
 *
 * The owner types the new PIN here and it is hashed before it is stored
 * (migrations/095) — this app never holds a stored PIN, and the old screen
 * that printed everyone's in plain text is gone with it.
 *
 * Owner-facing: English or Bahasa Indonesia, as the owner chose (Phase 149).
 */
function SetPinDialog({
  profile,
  busy,
  onClose,
  onSubmit,
}: {
  profile: StaffProfile | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (pin: string | null) => void;
}) {
  const t = useT();
  const [pin, setPin] = useState("");

  // Cleared whenever the dialog opens on someone else, so a half-typed PIN
  // can never be submitted against the wrong person.
  useEffect(() => {
    setPin("");
  }, [profile?.id]);

  return (
    <Dialog open={!!profile} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${profile?.name ?? ""}'s PIN`, `PIN ${profile?.name ?? ""}`)}</DialogTitle>
          <DialogDescription>
            {t(
              `Type a new ${PIN_LENGTH}-digit PIN, or let them choose their own next time they sign in.`,
              `Ketik PIN baru ${PIN_LENGTH} angka, atau biarkan mereka memilih sendiri saat masuk berikutnya.`
            )}
          </DialogDescription>
        </DialogHeader>

        <PinPad
          pin={pin}
          onDigit={(digit) => setPin((p) => (p.length >= PIN_LENGTH ? p : p + digit))}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
        />

        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={busy}
            onClick={() => onSubmit(null)}
          >
            {t("Let them choose", "Biar mereka pilih")}
          </Button>
          <Button
            className="min-h-[44px]"
            disabled={busy || pin.length !== PIN_LENGTH}
            onClick={() => onSubmit(pin)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} {t("Save PIN", "Simpan PIN")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
