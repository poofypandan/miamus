"use client";

import type { MouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsGroup, SettingsRow } from "@/components/dashboard/settings-list";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useScrollTopOnChange } from "@/hooks/use-tab-navigation";
import { GUIDE, GUIDE_GROUPS, GUIDE_GROUP_TITLES, GUIDE_PLACES, guideEntry, type GuideEntry } from "@/lib/guide";
import { isPlainClick, pushInPlace } from "@/lib/in-place-navigation";
import { guideEntryHref } from "@/lib/settings-pages";

/**
 * How Miamus works (Phase 180 H2, docs/phase-180-kakak-answers-plan.md,
 * section 5): the guide in src/lib/guide.ts as a screen anyone can read by
 * hand, the same words Kakak answers from. Settings → About Miamus → How
 * Miamus works; owners only, in the owner's language.
 *
 * A plain list in the guide's five groups. A tap opens an entry: its title,
 * its few sentences, and one button to the screen it is about. The open
 * entry is in the URL (&entry=today), like every other page here (CLAUDE.md,
 * State Persistence), so it survives a remount and Back steps out of it.
 * No search and no images in this version: thirty short titles in five
 * groups read in one scroll.
 */
export function HowMiamusWorks() {
  const searchParams = useSearchParams();
  const entry = guideEntry(searchParams.get("entry") ?? "");
  useScrollTopOnChange(entry?.id ?? "list");
  return entry ? <GuideEntryPage entry={entry} /> : <GuideList />;
}

function GuideList() {
  const locale = useOwnerLocale();
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-900">{t("How Miamus works", "Cara pakai Miamus")}</h2>
      {GUIDE_GROUPS.map((group) => (
        <section key={group} className="flex flex-col gap-2" aria-label={GUIDE_GROUP_TITLES[group][locale]}>
          <h3 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {GUIDE_GROUP_TITLES[group][locale]}
          </h3>
          <SettingsGroup>
            {GUIDE.filter((entry) => entry.group === group).map((entry) => (
              <SettingsRow
                key={entry.id}
                label={entry.title[locale]}
                wrap
                onPress={() => pushInPlace(guideEntryHref(entry.id))}
              />
            ))}
          </SettingsGroup>
        </section>
      ))}
    </div>
  );
}

/** Whether this home has the entry's feature switched off (Settings → Features). */
function useSwitchedOff(entry: GuideEntry): boolean {
  const features = useHouseholdFeatures();
  const profile = useHouseholdProfile();
  if (!entry.needs) return false;
  // Until the real answer is in, say nothing rather than flash "switched off".
  if (entry.needs === "pets") return profile.ready && !profile.petsOn;
  return features.ready && !features.flags[entry.needs];
}

function GuideEntryPage({ entry }: { entry: GuideEntry }) {
  const locale = useOwnerLocale();
  const t = useT();
  const off = useSwitchedOff(entry);
  // Switched off: the button goes where it can be turned on instead.
  const place = off ? "settings_features" : entry.where;
  const target = place ? GUIDE_PLACES[place] : null;

  function go(event: MouseEvent<HTMLAnchorElement>) {
    if (!target || !isPlainClick(event)) return;
    event.preventDefault();
    pushInPlace(target.href);
  }

  return (
    <article className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900">{entry.title[locale]}</h2>
      <p className="text-[15px] leading-relaxed text-gray-800">{entry.body[locale]}</p>
      {off && (
        <p className="text-sm text-muted-foreground">
          {t(
            "Switched off. Turn it on in Settings → Features.",
            "Sedang dimatikan. Nyalakan di Pengaturan → Fitur."
          )}
        </p>
      )}
      {target && (
        <Button asChild className="min-h-12 w-full rounded-xl text-base">
          <a href={target.href} onClick={go}>
            {t(`Go to ${target.en}`, `Buka ${target.id}`)}
          </a>
        </Button>
      )}
    </article>
  );
}
