"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { isPlainClick } from "@/lib/in-place-navigation";
import { beginNavigation, type CoverVariant } from "@/lib/launch-state";

/**
 * The one header both views wear, so moving between the owner dashboard and
 * the staff view changes what is in it, never where anything sits (Phase 84C).
 *
 *   ┌───────────────────────────────────────┐
 *   │ Household name             [action]   │  fixed-height row
 *   │ [ segmented control               ]   │  optional
 *   └───────────────────────────────────────┘
 *
 * The row has a fixed height rather than hugging its contents: the action
 * slot holds a ghost button on one side and the on-duty badge on the other,
 * and those are different heights — left to size itself, the row (and
 * everything under it) would shift by a few pixels between the two views.
 *
 * Top left is the Miamus mark and name, never the household's (Phase 153;
 * it showed the household's name from Phase 107). Owners show the app to
 * friends, and a household name is often the street address — so the
 * header carries the brand instead.
 *
 * Sticky, so the segmented control stays in reach while a long feed scrolls.
 * Callers render it outside PullToRefresh, so the pull moves the content
 * beneath it rather than the header itself.
 */
export function AppHeader({ action, children }: { action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 border-b bg-background">
      <div className="flex h-17 items-center justify-between gap-2 px-4">
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="shrink-0" aria-hidden>
            <BrandMark size={28} rounded />
          </span>
          <span className="truncate">Miamus</span>
        </h1>
        {action}
      </div>
      {children && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

/**
 * The cross-view link in the header's right slot — "Open Staff View →" on the
 * owner side, "← Owner Dashboard" on the staff side. One component so the two
 * can't drift apart: ghost, so it reads as a way out rather than an action on
 * the page. The 44px minimum is the touch target; ghost has no fill, so it
 * adds reach without adding visual weight.
 */
export function HeaderNavLink({
  href,
  switchTo,
  children,
}: {
  href: string;
  /**
   * The view this link switches into (Phase 132). If the switch is slow, that
   * view's branded cover — the Miamus mark for the owner, RUMAH for staff —
   * hides the route change until it has loaded and settled (Phase 134); a
   * fast one shows none.
   */
  switchTo?: CoverVariant;
  children: ReactNode;
}) {
  return (
    <Button variant="ghost" size="sm" asChild className="min-h-11 shrink-0 text-muted-foreground">
      <Link
        href={href}
        onClick={(event) => {
          // Only a plain tap navigates here; a new tab needs no cover.
          if (switchTo && isPlainClick(event)) beginNavigation("switch", switchTo);
        }}
      >
        {children}
      </Link>
    </Button>
  );
}

type View = "owner" | "staff";

/**
 * Overview | Staff: the switch between the owner dashboard and the staff
 * view (Phase 153; it replaced "Action Mode →" and "← Manage").
 *
 * Owners only. The dashboard renders it behind the middleware and
 * useRequireOwner, and the staff page only for a household member (a Google
 * account with a household_members row), so a staff phone never sees it.
 * Hiding it is not the protection: the middleware sends anonymous sessions
 * away from /dashboard whatever they tap.
 */
export function ViewSwitch({ current, locale }: { current: View; locale: "en" | "id" }) {
  const router = useRouter();
  return (
    <SegmentedControl<View>
      size="sm"
      ariaLabel={locale === "id" ? "Pilih tampilan" : "Choose view"}
      value={current}
      segments={[
        { value: "owner", label: locale === "id" ? "Ringkasan" : "Overview" },
        { value: "staff", label: locale === "id" ? "Staf" : "Staff" },
      ]}
      onChange={(next) => {
        if (next === current) return;
        beginNavigation("switch", next);
        router.push(next === "owner" ? "/dashboard" : "/staff");
      }}
    />
  );
}
