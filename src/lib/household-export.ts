import { supabase } from "@/lib/supabase/client";
import { formatDateLocal } from "@/lib/scheduleEngine";

/**
 * "Download a copy" (R7, migration 127): the household's records as one
 * JSON file, built by export_household_data() so that what is in it is
 * decided and tested in one place.
 */

/** miamus-rumah-kenanga-2026-11-08.json */
export function exportFileName(householdName: string | null | undefined, today: Date = new Date()): string {
  const slug = (householdName ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `miamus-${slug || "household"}-${formatDateLocal(today)}.json`;
}

export type ExportOutcome = "shared" | "downloaded" | "cancelled";

export async function downloadHouseholdExport(): Promise<ExportOutcome> {
  if (!supabase) throw new Error("not_configured");
  const { data, error } = await supabase.rpc("export_household_data");
  if (error) throw error;

  const name = (data as { household?: { name?: string } } | null)?.household?.name;
  const fileName = exportFileName(name);
  const file = new File([JSON.stringify(data, null, 2)], fileName, { type: "application/json" });

  // On a phone the share sheet is the natural "save": Files, Drive, or
  // sending it to yourself. A computer gets a plain download.
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Share refused for another reason: fall back to a download.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
