"use client";

import { Suspense, useMemo } from "react";
import { BedDouble, BellRing, CircleHelp, ListChecks, PawPrint, Refrigerator, ShoppingCart, type LucideIcon } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { kakakExamples, type KakakExample, type KakakExampleKind } from "@/lib/kakak/examples";

const ICONS: Record<KakakExampleKind, LucideIcon> = {
  chore: ListChecks,
  reminder: BellRing,
  shopping: ShoppingCart,
  pet: PawPrint,
  food: Refrigerator,
  sheets: BedDouble,
  question: CircleHelp,
};

/**
 * The Kakak sheet's first screen: five things to say and one to ask, in the
 * owner's language and with this household's own names (lib/kakak/examples.ts).
 * Tapping one puts it in the typing box, so the owner can change it first.
 * The roster loads on demand; until it has, the examples use no names.
 */
export function KakakExamples({ onPick }: { onPick: (text: string) => void }) {
  return (
    <Suspense fallback={<ExampleList onPick={onPick} staffNames={[]} />}>
      <HouseholdExamples onPick={onPick} />
    </Suspense>
  );
}

function HouseholdExamples({ onPick }: { onPick: (text: string) => void }) {
  const { profiles } = useStaffProfiles();
  // Staff who sign in by PIN, not admins (who are on the roster too since Phase 139).
  const staffNames = useMemo(
    () =>
      (profiles ?? [])
        .filter((p) => !p.user_id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p) => p.name),
    [profiles],
  );
  return <ExampleList onPick={onPick} staffNames={staffNames} />;
}

function ExampleList({ onPick, staffNames }: { onPick: (text: string) => void; staffNames: string[] }) {
  const t = useT();
  const locale = useOwnerLocale();
  const { pets } = useHousehold();
  const { petsOn } = useHouseholdProfile();
  const examples: KakakExample[] = useMemo(
    () =>
      kakakExamples({
        locale,
        staffNames,
        petNames: petsOn ? [...pets].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => p.name) : [],
      }),
    [locale, staffNames, pets, petsOn],
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{t("Try saying", "Coba bilang")}</p>
      <ul className="flex flex-col gap-2">
        {examples.map((example) => {
          const Icon = ICONS[example.kind];
          return (
            <li key={example.kind}>
              <button
                type="button"
                onClick={() => onPick(example.text)}
                className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm text-gray-900 transition-colors active:bg-muted"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">{example.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
