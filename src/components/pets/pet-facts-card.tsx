"use client";

import { useMemo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { DATE_LOCALE } from "@/lib/owner-locale";
import { firstName, latestWeight, lookedAfterBy, nextVaccine } from "@/lib/pet-facts";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskEntity } from "@/types/database";

/**
 * A pet's facts, like the back of a fine card (21 Nov; Fable's 08, section
 * 5): a small label and a plain value, a hairline between rows. This PR has
 * the facts Miamus already knows: the latest weight, the next vaccine (in
 * amber with its mark once its date has passed) and who looks after it, by
 * first name. A fact that isn't known is left out; with none, no card.
 * Nothing ranks, scores or counts.
 */
export function PetFactsCard({ pet }: { pet: TaskEntity }) {
  const { medicalRecords, schedules } = useHousehold();
  const { allProfiles } = useStaffProfiles();
  const locale = useOwnerLocale();
  const t = useT();
  const today = formatDateLocal(useToday());
  const date = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(DATE_LOCALE[locale], { day: "numeric", month: "short" });

  const facts = useMemo(() => {
    const records = medicalRecords.filter((r) => r.entity_id === pet.id);
    const carer = lookedAfterBy(schedules, pet.id);
    return {
      weight: latestWeight(records),
      vaccine: nextVaccine(records, today),
      carer: carer ? firstName(allProfiles?.find((p) => p.id === carer)?.name) : null,
    };
  }, [medicalRecords, schedules, pet.id, today, allProfiles]);

  const rows: { label: string; value: ReactNode; under?: string }[] = [];
  if (facts.weight) {
    rows.push({
      label: t("Weight", "Berat"),
      value: `${facts.weight.kg.toLocaleString(DATE_LOCALE[locale], { maximumFractionDigits: 2 })} kg`,
      under: date(facts.weight.on),
    });
  }
  if (facts.vaccine) {
    rows.push({
      label: t("Next vaccine", "Vaksin berikutnya"),
      value: facts.vaccine.late ? (
        // The mark inline, beside the words; the date never split.
        <span className="text-attention">
          <TriangleAlert className="mr-1 inline size-3.5 -translate-y-px align-middle" aria-hidden />
          {t("Was due", "Lewat jatuh tempo")} <span className="whitespace-nowrap">{date(facts.vaccine.due)}</span>
        </span>
      ) : (
        date(facts.vaccine.due)
      ),
      under: facts.vaccine.title,
    });
  }
  if (facts.carer) rows.push({ label: t("Looked after by", "Dirawat oleh"), value: facts.carer });
  if (rows.length === 0) return null;

  return (
    <section aria-label={t("About", "Tentang")} className="mt-3">
      <dl className="flex flex-col divide-y rounded-2xl bg-card px-4 shadow-card">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="shrink-0 text-sm text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 text-right">
            <span className="block text-[15px] font-semibold text-gray-900">{row.value}</span>
            {row.under && <span className="block truncate text-xs text-muted-foreground">{row.under}</span>}
          </dd>
        </div>
      ))}
      </dl>
    </section>
  );
}
