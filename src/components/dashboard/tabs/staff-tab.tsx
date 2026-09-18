"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Info, KeyRound, Loader2, PackageX, Plus, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { useStaffProfiles, useStaffNameLookup } from "@/hooks/use-staff-profiles";
import { describeLog } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import type { ItemType, StaffProfile } from "@/types/database";

const AUDIT_LIMIT = 20;

const ITEM_LABELS: Record<ItemType, string> = {
  food: "Food",
  medicine: "Medicine",
  treats: "Treats",
  shampoo: "Shampoo",
  pee_pad: "Pee Pad",
  other: "Other",
};

type AuditKind = "log" | "proposal" | "alert";

interface AuditEntry {
  id: string;
  kind: AuditKind;
  at: string;
  action: string;
  subject: string;
  actor: string;
}

const KIND_META: Record<AuditKind, { icon: typeof Camera; label: string; className: string }> = {
  log: { icon: Camera, label: "Task", className: "bg-emerald-100 text-emerald-900" },
  proposal: { icon: Send, label: "Proposal", className: "bg-amber-100 text-amber-900" },
  alert: { icon: PackageX, label: "Inventory", className: "bg-sky-100 text-sky-900" },
};

// Owner-facing, so entirely English per the Phase 46 language boundary.
export function StaffTab() {
  const { logs, routineProposals, inventoryAlerts, pets, schedules, loading } = useHousehold();
  const isOwner = useRequireOwner();
  const { profiles, failed, reload } = useStaffProfiles();

  const staffName = useStaffNameLookup(profiles);

  const petName = useMemo(() => {
    const byId = new Map(pets.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? "Unknown pet") : "Household");
  }, [pets]);

  // Three tables, one chronology. Built from data the dashboard already holds
  // rather than re-querying, so the list stays in step with everything else on
  // screen.
  const entries = useMemo<AuditEntry[]>(() => {
    const rows: AuditEntry[] = [
      ...logs.map((log) => ({
        id: `log-${log.id}`,
        kind: "log" as const,
        at: log.completed_at,
        action: log.photo_url ? "Logged with photo" : "Logged",
        subject: `${describeLog(log, schedules).title} · ${petName(log.entity_id)}`,
        actor: staffName(log.staff_id),
      })),
      ...routineProposals.map((proposal) => ({
        id: `proposal-${proposal.id}`,
        kind: "proposal" as const,
        at: proposal.created_at,
        action: `Proposed routine · ${proposal.status}`,
        subject: `${proposal.title} · ${petName(proposal.pet_id)}`,
        // staff_id when the proposal was filed by someone who had signed in;
        // created_by ("staff"/"owner") is all the older rows carry.
        actor: proposal.staff_id
          ? staffName(proposal.staff_id)
          : proposal.created_by
            ? titleCase(proposal.created_by)
            : "Staff",
      })),
      ...inventoryAlerts.map((alert) => ({
        id: `alert-${alert.id}`,
        kind: "alert" as const,
        at: alert.created_at,
        action: "Reported low stock",
        subject: `${ITEM_LABELS[alert.item_type]} · ${petName(alert.pet_id)}`,
        actor: staffName(alert.staff_id),
      })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, AUDIT_LIMIT);
  }, [logs, routineProposals, inventoryAlerts, schedules, petName, staffName]);

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
      <StaffRoster profiles={profiles} failed={failed} reload={reload} />

      <h2 className="mt-2 text-sm font-semibold text-gray-900">Audit Log</h2>

      {/* Stated rather than implied. Since Phase 71 each person signs in under
          their own name, so most rows can name someone — but that name is
          whoever was selected on the device, not a proven identity, and
          anything filed before Phase 71 has no author at all. Both limits are
          worth saying out loud rather than letting the list imply more
          certainty than it has. */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Names come from who was signed in on the phone, so they show who was on duty rather than
          proving who tapped. Entries from before staff sign-ins simply read &ldquo;Staff&rdquo;.
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">No staff activity yet.</p>
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
        <span className="block">{at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <span className="block tabular-nums">{formatTime12h(at)}</span>
      </span>
      <Badge variant="secondary" className="hidden shrink-0 text-[10px] sm:inline-flex">
        {meta.label}
      </Badge>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Owner-facing, so entirely English per the Phase 46 language boundary.
function StaffRoster({
  profiles,
  failed,
  reload,
}: {
  profiles: StaffProfile[] | null;
  failed: boolean;
  reload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  async function addStaff() {
    const name = newName.trim();
    if (!name) {
      toast.error("Enter a name first");
      return;
    }
    setAdding(true);
    try {
      await dataProvider.createStaffProfile(name);
      await reload();
      setNewName("");
      toast.success(`${name} added — they choose their own PIN on first sign-in`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add staff member");
    } finally {
      setAdding(false);
    }
  }

  // No confirmation step: clearing a PIN costs the person one setup screen on
  // their next sign-in and nothing else, so a dialog would be more friction
  // than the action deserves.
  async function resetPin(profile: StaffProfile) {
    setResetting(profile.id);
    try {
      await dataProvider.setStaffPin(profile.id, null);
      await reload();
      toast.success(`${profile.name} will set a new PIN next time they sign in`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to reset PIN");
    } finally {
      setResetting(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Staff &amp; PINs</h2>

      {failed ? (
        <p className="text-sm text-destructive">Couldn&apos;t load the staff list.</p>
      ) : profiles === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <Card className="py-2">
          <CardContent className="flex flex-col divide-y px-0">
            {profiles.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No staff yet.</p>
            ) : (
              profiles.map((profile) => (
                <div key={profile.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <UserRound className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{profile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      PIN:{" "}
                      {profile.pin ? (
                        <span className="font-mono tracking-widest text-gray-900">{profile.pin}</span>
                      ) : (
                        "Not set"
                      )}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[40px] shrink-0"
                    onClick={() => resetPin(profile)}
                    disabled={!profile.pin || resetting === profile.id}
                  >
                    {resetting === profile.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <KeyRound />
                    )}
                    Reset PIN
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card className="py-4">
        <CardContent className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">New staff name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Budi"
            />
          </div>
          <Button onClick={addStaff} disabled={adding} className="min-h-[48px]">
            {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add New Staff
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
