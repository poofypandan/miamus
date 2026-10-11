"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarOff, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { formatLeaveRange, leaveApprovalPath, leaveCovering } from "@/lib/leave";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

/**
 * Leave on the Access tab (Phase 140): requests waiting for a decision, and
 * approved leave that is under way or still to come. The WhatsApp link is
 * the quick way to a request; this is where it can always be found again.
 * Past and rejected leave is left out — it changes nothing any more.
 *
 * Owner-facing, so English.
 */
export function LeavePanel({ staffName }: { staffName: (id: string) => string }) {
  const { leaveRequests } = useHousehold();
  const today = formatDateLocal(useToday());

  const open = useMemo(
    () =>
      leaveRequests
        .filter(
          (l) =>
            (l.status === "pending" && l.end_date >= today) ||
            (l.status === "approved" && l.end_date >= today)
        )
        // Waiting for an answer first, then by start date.
        .sort(
          (a, b) =>
            Number(a.status !== "pending") - Number(b.status !== "pending") ||
            a.start_date.localeCompare(b.start_date)
        ),
    [leaveRequests, today]
  );

  if (open.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Leave</h2>
      <Card className="py-2">
        <CardContent className="flex flex-col divide-y px-0">
          {open.map((leave) => {
            const away = leaveCovering([leave], leave.staff_id, today) !== null;
            return (
              <Link
                key={leave.id}
                href={leaveApprovalPath(leave.id)}
                className="flex items-center gap-3 px-4 py-3 text-sm active:bg-muted/50"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                  <CalendarOff className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{staffName(leave.staff_id)}</span>
                  <span className="text-xs text-muted-foreground">{formatLeaveRange(leave, "en")}</span>
                </span>
                <Badge
                  className={cn(
                    "shrink-0 text-[10px]",
                    leave.status === "pending"
                      ? "bg-slate-100 text-slate-700"
                      : away
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-800"
                  )}
                >
                  {leave.status === "pending" ? "Needs decision" : away ? "On Leave" : "Approved"}
                </Badge>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
