"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, PauseCircle, UserRoundCheck, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { expandChores } from "@/lib/chore-recurrence";
import { dataProvider } from "@/lib/data";
import { moduleHref } from "@/lib/dashboard-modules";
import { assigneeOptions, formatLeaveRange, leaveDays } from "@/lib/leave";
import { cn } from "@/lib/utils";
import type { LeaveFallbackAction, LeaveRequest } from "@/types/database";

/**
 * Where a leave request's WhatsApp link lands (Phase 140): the admin reads
 * it, says what happens to the person's chores while they are away, and
 * approves or rejects. Owner-facing, so English.
 *
 * Under /dashboard, so the middleware's sign-in guard and the app lock both
 * apply to it as to every other admin screen.
 */
export default function LeaveApprovalPage() {
  return (
    // useStaffProfiles suspends on its first read (lib/resource).
    <Suspense fallback={<ApprovalSkeleton />}>
      <LeaveApproval />
    </Suspense>
  );
}

const ACTIONS: {
  value: LeaveFallbackAction;
  label: string;
  hint: string;
  icon: typeof Users;
}[] = [
  {
    value: "reassign",
    label: "Re-assign",
    hint: "Their chores go to one person you choose.",
    icon: UserRoundCheck,
  },
  {
    value: "unassign",
    label: "Unassign",
    hint: "Their chores become open for anyone to pick up.",
    icon: Users,
  },
  {
    value: "pause",
    label: "Pause",
    hint: "Their chores are skipped for those days.",
    icon: PauseCircle,
  },
];

/** Long enough for any real leave; caps the chore count's day-by-day walk. */
const MAX_PREVIEW_DAYS = 62;

function LeaveApproval() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isOwner = useRequireOwner();
  const { leaveRequests, decideLeave, householdTasks, memberProfile, tenantReady } = useHousehold();
  const { profiles } = useStaffProfiles();
  const nameOf = useStaffNameLookup(profiles, "Someone");

  // The context's copy when it has one — it updates the moment a decision is
  // saved. Otherwise fetched directly: a link opened cold can arrive before
  // the household's leave has loaded.
  const fromContext = leaveRequests.find((l) => l.id === id) ?? null;
  const [fetched, setFetched] = useState<LeaveRequest | null | undefined>(undefined);
  useEffect(() => {
    if (fromContext || !tenantReady) return;
    let live = true;
    dataProvider
      .getLeaveRequest(id)
      .then((row) => live && setFetched(row))
      .catch((err) => {
        console.error(err);
        if (live) setFetched(null);
      });
    return () => {
      live = false;
    };
  }, [id, fromContext, tenantReady]);
  const leave = fromContext ?? fetched;

  const [action, setAction] = useState<LeaveFallbackAction | null>(null);
  const [cover, setCover] = useState<string>("");
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);

  // Who can cover: everyone but the person leaving, anyone else away at the
  // start of this leave sorted last and marked.
  const coverOptions = useMemo(
    () =>
      leave
        ? assigneeOptions(profiles ?? [], {
            selfId: memberProfile?.id,
            leaves: leaveRequests,
            date: leave.start_date,
            exclude: leave.staff_id,
          })
        : [],
    [leave, profiles, memberProfile?.id, leaveRequests]
  );

  // How many of their chores Pause would skip. Repeats are counted across the
  // whole leave; one-off chores only where this week's rows are loaded — so
  // it is a floor, and says so.
  const pausedCount = useMemo(() => {
    if (!leave) return 0;
    let n = 0;
    const day = new Date(`${leave.start_date}T00:00:00`);
    for (let i = 0; i < Math.min(leaveDays(leave), MAX_PREVIEW_DAYS); i++) {
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      // `today` far ahead: count each day's own chores, not a rollover pile.
      n += expandChores({ rows: householdTasks, date, today: "9999-12-31" }).filter(
        (o) => o.status === "pending" && o.task.assigned_to === leave.staff_id && o.date === date
      ).length;
      day.setDate(day.getDate() + 1);
    }
    return n;
  }, [leave, householdTasks]);

  if (!isOwner) return null;
  if (leave === undefined) return <ApprovalSkeleton />;
  if (leave === null) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          This leave request no longer exists, or belongs to another household.
        </p>
      </Shell>
    );
  }

  const name = nameOf(leave.staff_id);
  const pending = leave.status === "pending";
  const canApprove = !!action && (action !== "reassign" || !!cover);

  async function decide(kind: "approve" | "reject") {
    if (!leave) return;
    setSaving(kind);
    try {
      if (kind === "reject") {
        await decideLeave(leave.id, { status: "rejected" });
        toast.success(`Leave for ${name} rejected`);
      } else {
        if (!action) return;
        await decideLeave(leave.id, {
          status: "approved",
          fallback_action: action,
          fallback_assignee_id: action === "reassign" ? cover : null,
        });
        toast.success(`Leave for ${name} approved`);
      }
      router.push(moduleHref("access"));
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the decision. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Shell>
      <Card className="py-4">
        <CardContent className="flex flex-col gap-1 px-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold text-gray-900">{name} is asking for leave</p>
            <StatusBadge status={leave.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatLeaveRange(leave, "en")} · {leaveDays(leave)}{" "}
            {leaveDays(leave) === 1 ? "day" : "days"}
          </p>
        </CardContent>
      </Card>

      {!pending ? (
        <Card className="py-4">
          <CardContent className="px-4 text-sm text-muted-foreground">
            {leave.status === "rejected"
              ? "This request was rejected."
              : leave.fallback_action === "pause"
                ? "Approved. Their chores are paused for these days."
                : leave.fallback_action === "reassign" && leave.fallback_assignee_id
                  ? `Approved. ${nameOf(leave.fallback_assignee_id)} covers their chores.`
                  : "Approved. Their chores are open for anyone."}
            {leave.status === "ended_early" && " They have since come back early."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">While {name} is away, their chores…</Label>
            {/* Required before approving: a leave with no rule would leave
                every chore of theirs assigned to someone who is not there. */}
            <div className="grid grid-cols-3 gap-2">
              {ACTIONS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={action === value ? "default" : "outline"}
                  className="min-h-[52px] flex-col gap-0.5 text-xs"
                  onClick={() => setAction(value)}
                >
                  <Icon className="size-4" />
                  {label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {action
                ? ACTIONS.find((a) => a.value === action)?.hint
                : "Choose what happens to their chores before approving."}
            </p>
          </div>

          {action === "reassign" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Covered by</Label>
              <Select value={cover} onValueChange={setCover}>
                <SelectTrigger className="min-h-[48px] w-full">
                  <SelectValue placeholder="Choose who covers" />
                </SelectTrigger>
                <SelectContent>
                  {coverOptions.map(({ profile, label }) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {action === "pause" && (
            <div className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">
                {pausedCount > 0
                  ? `At least ${pausedCount} of ${name}'s chores will be skipped and not done by anyone.`
                  : `Any chores assigned to ${name} on these days will be skipped and not done by anyone.`}
              </p>
              <p>
                Pet routines — meals, walks, medication — are shared by the household and are never
                paused; someone still has to do them. If {name} usually handles the pets, choose
                Re-assign instead so it is clear who does.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              className="min-h-[52px]"
              disabled={!canApprove || !!saving}
              onClick={() => decide("approve")}
            >
              {saving === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve leave
            </Button>
            <Button
              variant="outline"
              className="min-h-[48px]"
              disabled={!!saving}
              onClick={() => decide("reject")}
            >
              {saving === "reject" ? <Loader2 className="animate-spin" /> : <X />} Reject
            </Button>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <Link
        href={moduleHref("access")}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        <ArrowLeft className="size-3.5" /> People
      </Link>
      <h1 className="text-lg font-semibold text-gray-900">Leave request</h1>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: LeaveRequest["status"] }) {
  const copy = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    ended_early: "Ended early",
  }[status];
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0 text-[10px]",
        status === "pending" && "bg-slate-100 text-slate-700",
        status === "approved" && "bg-emerald-100 text-emerald-800"
      )}
    >
      {copy}
    </Badge>
  );
}

function ApprovalSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4">
      <Skeleton className="h-6 w-40 rounded-lg" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
