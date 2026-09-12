"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { MODULES } from "@/config/modules";
import { cn } from "@/lib/utils";
import { PetsRow } from "@/components/dashboard/pets-row";

const SUB_NAV = [
  { href: "/dashboard", label: "Daily Feed" },
  { href: "/dashboard/schedules", label: "Schedules" },
  { href: "/dashboard/health", label: "Health Passport" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-lg font-semibold">Maimus</span>
        <Link
          href="/staff"
          className="flex min-h-[48px] items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Open Staff View →
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ModuleTab label="🐶 Pets" active enabled />
        <ModuleTab label="🏠 Household" active={false} enabled={MODULES.household} />
        <ModuleTab label="👥 Staff" active={false} enabled={MODULES.staff} />
      </div>

      <PetsRow />

      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SUB_NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[48px] shrink-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function ModuleTab({
  label,
  active,
  enabled,
}: {
  label: string;
  active: boolean;
  enabled: boolean;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : enabled
            ? "border-border text-foreground"
            : "border-border/60 text-muted-foreground opacity-60"
      )}
    >
      {label}
      {!enabled && (
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          Soon
        </Badge>
      )}
    </span>
  );
}
