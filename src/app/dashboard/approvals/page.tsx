"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChartColumn, Check, ChevronRight, Loader2, Mail, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/context/owner-locale-context";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { moduleHref } from "@/lib/dashboard-modules";
import {
  emailThemHref,
  requesterLabel,
  sortAccessRequests,
  type AccessRequest,
} from "@/lib/household-access";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * New-household requests (Phase 148, migrations/113). Only platform admins —
 * the operator's own account, seeded by hand per project — get a list; for
 * anyone else the database refuses and this page says so. Owner-facing, so
 * English.
 *
 * Under /dashboard, so the middleware's sign-in guard and the app lock both
 * apply. Reached from the dashboard banner and from the push notification
 * a new request sends.
 */
type Load =
  | { state: "loading" }
  | { state: "forbidden" }
  | { state: "failed" }
  | { state: "ready"; requests: AccessRequest[] };

export default function HouseholdApprovalsPage() {
  const isOwner = useRequireOwner();
  const t = useT();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [deciding, setDeciding] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!supabase) {
      setLoad({ state: "forbidden" });
      return;
    }
    const { data, error } = await supabase.rpc("list_household_access_requests");
    if (error) {
      // 42501 is "not a platform admin": not an error worth a retry button.
      setLoad(error.code === "42501" ? { state: "forbidden" } : { state: "failed" });
      if (error.code !== "42501") console.error(error);
      return;
    }
    setLoad({ state: "ready", requests: sortAccessRequests((data ?? []) as AccessRequest[]) });
  }, []);

  useEffect(() => {
    if (isOwner) void fetchRequests();
  }, [isOwner, fetchRequests]);

  async function decide(request: AccessRequest, approve: boolean) {
    if (!supabase) return;
    setDeciding(request.user_id);
    try {
      const { error } = await supabase.rpc("decide_household_access", {
        p_user_id: request.user_id,
        p_approve: approve,
      });
      if (error) throw error;
      toast.success(
        approve
          ? `${requesterLabel(request)} can now set up a household`
          : `Request from ${requesterLabel(request)} rejected`
      );
      await fetchRequests();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save the decision. Check your connection and try again.");
    } finally {
      setDeciding(null);
    }
  }

  if (!isOwner) return null;

  if (load.state === "loading") {
    return (
      <Shell>
        <Skeleton className="h-24 w-full rounded-xl" />
      </Shell>
    );
  }
  if (load.state === "forbidden") {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Not available.</p>
      </Shell>
    );
  }
  if (load.state === "failed") {
    return (
      <Shell>
        <p className="text-sm text-destructive">Couldn&apos;t load requests.</p>
        <Button variant="outline" onClick={() => void fetchRequests()} className="w-fit">
          Try again
        </Button>
      </Shell>
    );
  }

  const pending = load.requests.filter((r) => r.status === "pending");
  const decided = load.requests.filter((r) => r.status !== "pending");

  return (
    <Shell>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        Approving lets that Google account set up one household. Rejected requests, and the
        sign-in they came from, are deleted after 30 days.
      </p>

      {/* The north star in numbers (Phase 172 PR 0): only platform admins
          get this far, and only they can read it. */}
      <Link
        href="/dashboard/north-star"
        className="flex min-h-[44px] items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm font-medium text-gray-900"
      >
        <ChartColumn className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1">{t("North star numbers", "Angka ukuran utama")}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Waiting</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests waiting.</p>
        ) : (
          pending.map((request) => (
            <Card key={request.user_id} className="py-4">
              <CardContent className="flex flex-col gap-3 px-4">
                <RequestIdentity request={request} />
                <div className="flex gap-2">
                  <Button
                    onClick={() => void decide(request, true)}
                    disabled={deciding !== null}
                    className="min-h-[44px] flex-1"
                  >
                    {deciding === request.user_id ? <Loader2 className="animate-spin" /> : <Check />}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void decide(request, false)}
                    disabled={deciding !== null}
                    className="min-h-[44px] flex-1"
                  >
                    <X /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {decided.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Decided in the last 30 days</h2>
          <Card className="py-2">
            <CardContent className="flex flex-col divide-y px-0">
              {decided.map((request) => (
                <div key={request.user_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <RequestIdentity request={request} />
                  </div>
                  <StatusBadge status={request.status} />
                  {/* Approved by hand: tell them (Phase 172, D2). Miamus sends
                      no email; this opens the mail app with a ready text in
                      their language, sent from the support address. */}
                  {request.status === "approved" && !request.auto && emailThemHref(request) && (
                    <a
                      href={emailThemHref(request) ?? undefined}
                      className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium text-gray-900 active:bg-muted"
                    >
                      <Mail className="size-3.5" aria-hidden /> {t("Email them", "Kirim email")}
                    </a>
                  )}
                  {/* A mis-tapped Reject is undone here; the database allows
                      changing a decision (migrations/113). */}
                  {request.status === "rejected" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void decide(request, true)}
                      disabled={deciding !== null}
                      className="min-h-[36px] shrink-0"
                    >
                      Approve
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </Shell>
  );
}

function RequestIdentity({ request }: { request: AccessRequest }) {
  const t = useT();
  const when = new Date(request.decided_at ?? request.requested_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-gray-900">{requesterLabel(request)}</span>
      {request.full_name && request.email && (
        <span className="truncate text-xs text-muted-foreground">{request.email}</span>
      )}
      <span className="text-xs text-muted-foreground">
        {request.status === "pending" ? `Asked ${when}` : `Decided ${when}`}
        {/* Approved at sign-up, reviewed afterwards (Phase 172, D1). */}
        {request.auto && <> · {t("Automatic", "Otomatis")}</>}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: AccessRequest["status"] }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0 text-[10px]",
        status === "approved" && "bg-emerald-100 text-emerald-800",
        status === "rejected" && "bg-slate-100 text-slate-700"
      )}
    >
      {status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Pending"}
    </Badge>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <Link
        href={moduleHref("agenda")}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        <ArrowLeft className="size-3.5" /> Dashboard
      </Link>
      <h1 className="text-lg font-semibold text-gray-900">Household requests</h1>
      {children}
    </div>
  );
}
