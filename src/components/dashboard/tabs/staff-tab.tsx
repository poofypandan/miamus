"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  CalendarOff,
  Camera,
  ChevronLeft,
  ChevronRight,
  Crown,
  DoorOpen,
  History,
  Info,
  MessageSquareText,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  LogOut,
  PackageX,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserMinus,
  UserPlus,
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
import { formatCode, HouseCodePanel } from "@/components/dashboard/house-code-panel";
import { HouseholdMembersPanel } from "@/components/dashboard/household-members-panel";
import { SecuritySettings } from "@/components/dashboard/security-settings";
import { PushNotificationSettings, pushStatusLabel } from "@/components/dashboard/push-notification-settings";
import { usePushStatus } from "@/hooks/use-push-status";
import { LanguageSettings } from "@/components/dashboard/language-settings";
import { KakakSettings } from "@/components/kakak/kakak-settings";
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { useKakakStatus } from "@/hooks/use-kakak-status";
import { useOwnerLocale, useT, type Translate } from "@/context/owner-locale-context";
import { DATE_LOCALE } from "@/lib/owner-locale";
import { ITEM_TYPE_LABELS } from "@/lib/item-types";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { useStaffProfiles, useStaffNameLookup } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { useScrollTopOnChange } from "@/hooks/use-tab-navigation";
import { pushInPlace } from "@/lib/in-place-navigation";
import { isOnLeave } from "@/lib/leave";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { LeavePanel } from "@/components/dashboard/leave-panel";
import { SignOutSheet } from "@/components/auth/sign-out-sheet";
import { HouseholdDataPanel } from "@/components/dashboard/household-data-panel";
import { useHouseholdDeletion } from "@/hooks/use-household-deletion";
import { AboutMiamus } from "@/components/dashboard/about-miamus";
import { WhatsNewCard, WhatsNewList } from "@/components/shared/whats-new";
import { VideoTip } from "@/components/shared/video-tip";
import { useStaffPushOverview } from "@/hooks/use-staff-push-overview";
import { FeedbackSheet } from "@/components/shared/feedback-sheet";
import { RoomsManager } from "@/components/dashboard/rooms-manager";
import { FeaturesPanel } from "@/components/dashboard/features-panel";
import { SendStaffMessageButton } from "@/components/setup/send-staff-message";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { featuresOnCount } from "@/lib/features";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
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

const HOUSEHOLD_PAGES = [
  "family",
  "staff",
  "leave",
  "invite",
  "sign-in",
  "notifications",
  "language",
  "lock",
  "kakak",
  "activity",
  "data",
  "about",
  "whats-new",
  "rooms",
  "features",
] as const;
type HouseholdPage = (typeof HOUSEHOLD_PAGES)[number];

/** Kakak's avatar at the size of a row icon. */
function KakakRowIcon() {
  return <KakakAvatar className="size-5 shrink-0" />;
}

/** A rounded group of rows, like a section of iPhone Settings (Phase 155). */
function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">{children}</div>;
}

function SettingsRow({
  icon: Icon,
  label,
  detail,
  waiting = false,
  onPress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail?: string;
  /** Amber: something is waiting for the owner (Phase 153 colour rule). */
  waiting?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex min-h-[52px] items-center gap-3 px-4 text-left text-sm active:bg-muted"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{label}</span>
      {detail && (
        <span className={waiting ? "text-xs font-medium text-amber-700" : "text-xs text-muted-foreground"}>
          {detail}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * The Household tab (Phase 155; "Access" until Phase 153): a short list in
 * four groups — people; inviting and staff sign-in; this phone's settings;
 * activity — each row opening its own page. It was one page with ten
 * sections in a single scroll.
 *
 * Owner-facing: English or Bahasa Indonesia, as the owner chose (Phase 149).
 */
export function StaffTab() {
  const { logs, routineProposals, inventoryAlerts, pets, schedules, loading, leaveRequests } = useHousehold();
  // Which page of the Household tab, in the URL like the tab itself
  // (CLAUDE.md, State Persistence): ?module=access&page=staff. None = the list.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  useScrollTopOnChange(pageParam ?? "list");
  function open(next: HouseholdPage | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("page", next);
    else params.delete("page");
    pushInPlace(`${pathname}?${params.toString()}`);
  }
  const today = formatDateLocal(useToday());
  // Leave worth a row: waiting for an answer, or approved and not over yet —
  // the same rule as LeavePanel.
  const openLeave = leaveRequests.filter(
    (l) => (l.status === "pending" || l.status === "approved") && l.end_date >= today
  ).length;
  const pendingLeave = leaveRequests.filter((l) => l.status === "pending" && l.end_date >= today).length;
  const locale = useOwnerLocale();
  const t = useT();
  const isOwner = useRequireOwner();
  // Household → Features (Phase 171; it replaced "Who lives here"): "4 on".
  const { petsOn } = useHouseholdProfile();
  const { flags: featureFlags } = useHouseholdFeatures();
  const { profiles, failed, reload, allProfiles } = useStaffProfiles();
  // Kakak's row only for a household on the family list (Phase 156 step 2).
  const { status: kakak, reload: reloadKakak } = useKakakStatus();
  // Scheduled deletion (R7): shown at the top of the list, managed on the
  // Your data page. One instance, passed down, so both agree.
  const deletion = useHouseholdDeletion();
  // This device's notifications, on the row (On / Off / Blocked).
  const { status: pushStatus } = usePushStatus();
  // Feedback (roadmap item 9): a sheet over the list, not a page of its own.
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
        action: t("Added to the shopping list", "Menambah ke daftar belanja"),
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

  // ?page=who-lives-here (Phase 162's links, its What's new card) opens Features.
  const pageName = pageParam === "who-lives-here" ? "features" : pageParam;
  const page = HOUSEHOLD_PAGES.includes(pageName as HouseholdPage) ? (pageName as HouseholdPage) : null;

  if (!page) {
    const staffCount = (profiles ?? []).filter((p) => !p.user_id).length;
    return (
      <div className="flex flex-col gap-5">
        {/* Where the switches live, so the tutorial sits here (Phase 171, D8). */}
        <WhatsNewCard id="features-2026-11" onTry={() => open("features")} />
        {deletion.status?.scheduled && deletion.status.deleteAfter && (
          <SettingsGroup>
            <SettingsRow
              icon={Trash2}
              label={t("Household will be deleted", "Rumah tangga akan dihapus")}
              detail={new Date(deletion.status.deleteAfter).toLocaleDateString(DATE_LOCALE[locale], {
                day: "numeric",
                month: "short",
              })}
              waiting
              onPress={() => open("data")}
            />
          </SettingsGroup>
        )}
        <SettingsGroup>
          <SettingsRow icon={Crown} label={t("Family", "Keluarga")} onPress={() => open("family")} />
          <SettingsRow
            icon={UserRound}
            label={t("Staff", "Staf")}
            detail={profiles ? String(staffCount) : undefined}
            onPress={() => open("staff")}
          />
          <SettingsRow icon={DoorOpen} label={t("Rooms", "Ruangan")} onPress={() => open("rooms")} />
          <SettingsRow
            icon={SlidersHorizontal}
            label={t("Features", "Fitur")}
            detail={t(`${featuresOnCount(featureFlags, petsOn)} on`, `${featuresOnCount(featureFlags, petsOn)} aktif`)}
            onPress={() => open("features")}
          />
          {openLeave > 0 && (
            <SettingsRow
              icon={CalendarOff}
              label={t("Leave", "Cuti")}
              detail={
                pendingLeave > 0
                  ? t(`${pendingLeave} to decide`, `${pendingLeave} perlu keputusan`)
                  : String(openLeave)
              }
              waiting={pendingLeave > 0}
              onPress={() => open("leave")}
            />
          )}
        </SettingsGroup>
        <SettingsGroup>
          <SettingsRow icon={UserPlus} label={t("Invite someone", "Undang")} onPress={() => open("invite")} />
          <SettingsRow icon={KeyRound} label={t("Staff sign-in", "Masuk staf")} onPress={() => open("sign-in")} />
        </SettingsGroup>
        <SettingsGroup>
          <SettingsRow
            icon={Bell}
            label={t("Notifications", "Notifikasi")}
            detail={pushStatusLabel(pushStatus, t)}
            waiting={pushStatus === "off" || pushStatus === "denied"}
            onPress={() => open("notifications")}
          />
          <SettingsRow
            icon={Languages}
            label={t("Language", "Bahasa")}
            detail={locale === "id" ? "Bahasa Indonesia" : "English"}
            onPress={() => open("language")}
          />
          <SettingsRow icon={Lock} label={t("App lock", "Kunci aplikasi")} onPress={() => open("lock")} />
        </SettingsGroup>
        {kakak?.allowed && (
          <SettingsGroup>
            <SettingsRow
              icon={KakakRowIcon}
              label="Kakak"
              detail={kakak.enabled ? t("On", "Aktif") : t("Off", "Mati")}
              onPress={() => open("kakak")}
            />
          </SettingsGroup>
        )}
        <SettingsGroup>
          <SettingsRow icon={History} label={t("Activity", "Aktivitas")} onPress={() => open("activity")} />
          <SettingsRow icon={ShieldCheck} label={t("Your data", "Data Anda")} onPress={() => open("data")} />
        </SettingsGroup>
        <SettingsGroup>
          <SettingsRow icon={Sparkles} label={t("What's new", "Yang baru")} onPress={() => open("whats-new")} />
          <SettingsRow icon={Info} label={t("About Miamus", "Tentang Miamus")} onPress={() => open("about")} />
          <SettingsRow
            icon={MessageSquareText}
            label={t("Send feedback", "Kirim masukan")}
            onPress={() => setFeedbackOpen(true)}
          />
        </SettingsGroup>
        <SignOutRow locale={locale} />
        <FeedbackSheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} locale={locale} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => open(null)}
        className="-ml-2 flex min-h-11 items-center gap-0.5 self-start rounded-lg px-2 text-sm font-medium text-muted-foreground active:bg-muted"
      >
        <ChevronLeft className="size-4" /> {t("Household", "Rumah")}
      </button>

      {page === "family" && <HouseholdMembersPanel />}
      {page === "staff" && (
        <StaffRoster profiles={profiles} allProfiles={allProfiles} failed={failed} reload={reload} />
      )}
      {page === "leave" &&
        (openLeave > 0 ? (
          <LeavePanel staffName={staffName} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("No leave right now.", "Tidak ada cuti saat ini.")}</p>
        ))}
      {page === "invite" && <InvitePanel />}
      {page === "sign-in" && <HouseCodePanel />}
      {page === "notifications" && <PushNotificationSettings />}
      {page === "language" && <LanguageSettings />}
      {page === "lock" && <SecuritySettings />}
      {page === "kakak" &&
        (kakak?.allowed ? (
          <KakakSettings status={kakak} reload={reloadKakak} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("Kakak isn't available for this household yet.", "Kakak belum tersedia untuk rumah ini.")}
          </p>
        ))}
      {page === "activity" && <ActivityPage entries={entries} />}
      {page === "data" && <HouseholdDataPanel status={deletion.status} reload={deletion.reload} />}
      {page === "about" && <AboutMiamus />}
      {page === "whats-new" && <WhatsNewList />}
      {page === "rooms" && <RoomsManager />}
      {page === "features" && <FeaturesPanel />}
    </div>
  );
}

function ActivityPage({ entries }: { entries: AuditEntry[] }) {
  const t = useT();
  return (
    <>
      <h2 className="text-sm font-semibold text-gray-900">{t("Activity", "Aktivitas")}</h2>

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
    </>
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
  // Who has notifications on a phone (Phase 166): owners see it, never set it.
  const staffPush = useStaffPushOverview();
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
      // Archiving also gives the house a new code (migrations/146), so the
      // old one can't be used to sign in again. Shown here, once.
      const code = await dataProvider.getHouseCode().catch(() => null);
      toast.success(
        code
          ? t(
              `${profile.name} removed. The house code is now ${formatCode(code)}; share the new one with your staff.`,
              `${profile.name} dihapus. Kode rumah sekarang ${formatCode(code)}; bagikan kode baru ke staf Anda.`
            )
          : t(
              `${profile.name} removed. The house code has changed; see it under Staff sign-in.`,
              `${profile.name} dihapus. Kode rumah sudah diganti; lihat di Masuk staf.`
            ),
        { duration: 10000 }
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

      {/* How the pieces fit (Phase 120): until the first person is added
          (Phase 155). One line and an optional video since Phase 172 (D11
          rule 7); it was three numbered steps. */}
      {staff !== null && staff.length === 0 && (
        <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "Add your staff, then send one WhatsApp message.",
              "Tambah staf, lalu kirim satu pesan WhatsApp."
            )}
          </p>
          <VideoTip id="owner-staff-phones" locale={locale} />
        </div>
      )}
      {/* Staff in one go (Phase 172 PR A2): while someone added this week
          still has to pick their name and make a PIN. */}
      {staff !== null && staff.some((p) => !p.has_pin && !p.user_id && isClaimable(p.created_at)) && (
        <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t("Send this to your staff. Each person picks their name.", "Kirim ke staf Anda. Masing-masing memilih namanya.")}
          </p>
          <SendStaffMessageButton variant="outline" />
        </div>
      )}

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
                      {staffPush.overview && !profile.user_id && (
                        <>
                          {" · "}
                          {staffPush.isOn(profile.id)
                            ? t("Notifications on", "Notifikasi aktif")
                            : t("Notifications off", "Notifikasi mati")}
                        </>
                      )}
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

/**
 * The last row of the Household tab: who is signed in on this phone, and the
 * way out (owner request, 2026-11-08). Red text and a confirmation sheet, so
 * it is easy to find and hard to hit by accident.
 */
function SignOutRow({ locale }: { locale: "en" | "id" }) {
  const t = useT();
  const [email, setEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/supabase/client").then(async ({ supabase }) => {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      if (!cancelled) setEmail(data.session?.user.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SettingsGroup>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex min-h-[52px] items-center gap-3 px-4 text-left text-sm active:bg-muted"
        >
          <LogOut className="size-4 shrink-0 text-red-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-red-600">{t("Sign out", "Keluar")}</span>
            {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
          </span>
        </button>
      </SettingsGroup>
      <SignOutSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        lang={locale}
        account={email}
      />
    </>
  );
}

/** Added less than 7 days ago: the claim window (migrations/147). */
function isClaimable(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const at = new Date(createdAt).getTime();
  return Number.isFinite(at) && Date.now() - at < 7 * 24 * 60 * 60 * 1000;
}
