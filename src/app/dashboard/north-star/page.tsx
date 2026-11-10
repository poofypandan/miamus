"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerLocale, useT, type Translate } from "@/context/owner-locale-context";
import { useRequireOwner } from "@/hooks/use-require-owner";
import {
  formatMinutes,
  parseNorthStar,
  percent,
  share,
  signalTiles,
  type NorthStarReport,
  type NorthStarWeek,
  type SignalStatus,
  type SignalTile,
} from "@/lib/north-star";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * The north star in numbers (Phase 172 PR 0, migrations/145): S1–S5 with
 * their targets, then the same per sign-up week. Platform admins only — the
 * database refuses everyone else (42501) and this page says "Not available".
 * Counts, medians and shares only: the function returns no names, emails or
 * household ids. Reached from Household requests.
 */
type Load =
  | { state: "loading" }
  | { state: "forbidden" }
  | { state: "failed" }
  | { state: "ready"; report: NorthStarReport };

const WEEKS = 8;

export default function NorthStarPage() {
  const isOwner = useRequireOwner();
  const t = useT();
  const locale = useOwnerLocale();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const fetchReport = useCallback(async () => {
    if (!supabase) {
      setLoad({ state: "forbidden" });
      return;
    }
    setLoad({ state: "loading" });
    const { data, error } = await supabase.rpc("platform_north_star", { p_weeks: WEEKS });
    if (error) {
      setLoad(error.code === "42501" ? { state: "forbidden" } : { state: "failed" });
      if (error.code !== "42501") console.error(error);
      return;
    }
    const report = parseNorthStar(data);
    setLoad(report ? { state: "ready", report } : { state: "failed" });
  }, []);

  useEffect(() => {
    if (isOwner) void fetchReport();
  }, [isOwner, fetchReport]);

  if (!isOwner) return null;

  if (load.state === "loading") {
    return (
      <Shell t={t}>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </Shell>
    );
  }
  if (load.state === "forbidden") {
    return (
      <Shell t={t}>
        <p className="text-sm text-muted-foreground">{t("Not available.", "Tidak tersedia.")}</p>
      </Shell>
    );
  }
  if (load.state === "failed") {
    return (
      <Shell t={t}>
        <p className="text-sm text-destructive">{t("Couldn't load the numbers.", "Angka belum bisa dimuat.")}</p>
        <Button variant="outline" onClick={() => void fetchReport()} className="w-fit rounded-lg">
          {t("Try again", "Coba lagi")}
        </Button>
      </Shell>
    );
  }

  const { report } = load;
  const s = report.summary;
  const tiles = signalTiles(report);

  return (
    <Shell t={t}>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
        {t(
          `Numbers only, from every household, as of ${dayLabel(report.asOf, locale)}. No names.`,
          `Hanya angka, dari semua rumah, per ${dayLabel(report.asOf, locale)}. Tanpa nama.`
        )}
      </p>

      <section className="flex flex-col gap-2" aria-label={t("Signals", "Ukuran")}>
        {tiles.map((tile) => (
          <SignalCard key={tile.key} tile={tile} t={t}>
            <SignalDetail tile={tile} report={report} t={t} locale={locale} />
          </SignalCard>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{t("By sign-up week", "Per minggu pendaftaran")}</h2>
        {s.households === 0 && report.weeks.every((w) => w.s3Due === 0) ? (
          <p className="text-sm text-muted-foreground">
            {t("Nothing yet in these weeks.", "Belum ada apa-apa di minggu-minggu ini.")}
          </p>
        ) : (
          report.weeks.map((week) => <WeekCard key={week.weekStart} week={week} t={t} locale={locale} />)
        )}
      </section>
    </Shell>
  );
}

function signalTitle(key: SignalTile["key"], t: Translate): string {
  switch (key) {
    case "s1":
      return t("Staff finish a first task the same day", "Staf menyelesaikan tugas pertama di hari yang sama");
    case "s2":
      return t("Typed fields to set up a home", "Kolom yang diketik untuk menyiapkan rumah");
    case "s3":
      return t("Due tasks closed (done or couldn't)", "Tugas yang selesai atau ditandai tidak bisa");
    case "s4":
      return t("Households active in week 4", "Rumah yang aktif di minggu ke-4");
    case "s5":
      return t("Kakak used 3+ times in week 3", "Kakak dipakai 3+ kali di minggu ke-3");
  }
}

function targetLine(key: SignalTile["key"], report: NorthStarReport, t: Translate): string {
  const target = report.targets;
  switch (key) {
    case "s1":
      return t("Target: most households", "Target: sebagian besar rumah");
    case "s2":
      return t(`Target: ${target.s2TypedFields} or fewer`, `Target: ${target.s2TypedFields} atau kurang`);
    case "s3":
      return t(`Target: ${percent(target.s3Share)} or more`, `Target: ${percent(target.s3Share)} atau lebih`);
    case "s4":
      return t(`Target: ${percent(target.s4Share)} of new households`, `Target: ${percent(target.s4Share)} rumah baru`);
    case "s5":
      return t(
        `Target: ${percent(target.s5Share)} of those who tried her`,
        `Target: ${percent(target.s5Share)} dari yang pernah mencoba`
      );
  }
}

function SignalCard({ tile, t, children }: { tile: SignalTile; t: Translate; children: React.ReactNode }) {
  const label = tile.key.toUpperCase();
  return (
    <Card className={cn("py-4", tile.status === "below" && "border-amber-200 bg-amber-50/40")}>
      <CardContent className="flex flex-col gap-1.5 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">{label}</p>
            <h3 className="text-sm font-medium text-gray-900">{signalTitle(tile.key, t)}</h3>
          </div>
          <StatusChip status={tile.status} t={t} />
        </div>
        <p className="text-2xl font-semibold tabular-nums text-gray-900" data-testid={`signal-${tile.key}`}>
          {tile.value ?? <span className="text-muted-foreground">–</span>}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

function SignalDetail({
  tile,
  report,
  t,
  locale,
}: {
  tile: SignalTile;
  report: NorthStarReport;
  t: Translate;
  locale: "en" | "id";
}) {
  const s = report.summary;
  const lines: string[] = [];
  switch (tile.key) {
    case "s1": {
      lines.push(t(`${s.sameDay} of ${households(s.sameDayOf)}`, `${s.sameDay} dari ${s.sameDayOf} rumah`));
      const first = formatMinutes(s.firstFinishMinutes, locale);
      if (first) lines.push(t(`Median to the first staff finish: ${first}`, `Median sampai tugas staf pertama selesai: ${first}`));
      const setup = formatMinutes(s.setupMinutes, locale);
      lines.push(
        setup
          ? t(
              `Owner's setup time: ${setup} (target under ${report.targets.s1SetupMinutes} min)`,
              `Waktu pemilik menyiapkan: ${setup} (target di bawah ${report.targets.s1SetupMinutes} mnt)`
            )
          : t("Owner's setup time: counted once the new setup ships", "Waktu pemilik menyiapkan: dihitung setelah persiapan baru tersedia")
      );
      const wait = formatMinutes(s.signupMinutes, locale);
      if (wait) lines.push(t(`Median wait for approval: ${wait}`, `Median waktu menunggu persetujuan: ${wait}`));
      break;
    }
    case "s2":
      lines.push(
        s.setupHouseholds > 0
          ? t(`Median of ${households(s.setupHouseholds)} set up`, `Median dari ${s.setupHouseholds} rumah yang disiapkan`)
          : t("Counted once the new setup ships", "Dihitung setelah persiapan baru tersedia")
      );
      if (s.handItems14d !== null) {
        const n = Math.round(s.handItems14d);
        lines.push(
          t(
            `Before: ${n} things added by hand in the first 14 days (median of ${households(s.handItems14dOf)})`,
            `Sebelumnya: ${n} hal ditambahkan manual dalam 14 hari pertama (median dari ${s.handItems14dOf} rumah)`
          )
        );
      }
      break;
    case "s3":
      lines.push(t(`Last 7 days: ${s.s3Closed} of ${s.s3Due}`, `7 hari terakhir: ${s.s3Closed} dari ${s.s3Due}`));
      break;
    case "s4":
      lines.push(
        t(`${s.s4Active} of ${households(s.s4Of)} at least 4 weeks old`, `${s.s4Active} dari ${s.s4Of} rumah yang berumur 4 minggu atau lebih`)
      );
      break;
    case "s5":
      lines.push(t(`${s.s5Repeat} of ${households(s.s5Of)} that tried her`, `${s.s5Repeat} dari ${s.s5Of} rumah yang pernah mencoba`));
      break;
  }
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <p>{targetLine(tile.key, report, t)}</p>
    </div>
  );
}

function StatusChip({ status, t }: { status: SignalStatus; t: Translate }) {
  const Icon = status === "met" ? Check : status === "below" ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "met" && "bg-emerald-100 text-emerald-800",
        status === "below" && "bg-amber-100 text-amber-800",
        status === "none" && "bg-slate-100 text-slate-600"
      )}
    >
      <Icon className="size-3" aria-hidden />
      {status === "met"
        ? t("On target", "Sesuai target")
        : status === "below"
          ? t("Below target", "Di bawah target")
          : t("No data yet", "Belum ada data")}
    </span>
  );
}

function WeekCard({ week, t, locale }: { week: NorthStarWeek; t: Translate; locale: "en" | "id" }) {
  const dash = "–";
  const sameDay = share(week.sameDay, week.sameDayOf);
  const rows: [string, string][] = [
    [t("New households", "Rumah baru"), String(week.households)],
    [
      t("Staff finished on day one", "Staf selesai di hari pertama"),
      week.sameDayOf ? `${week.sameDay} / ${week.sameDayOf}${sameDay === null ? "" : ` · ${percent(sameDay)}`}` : dash,
    ],
    [t("To the first staff finish", "Sampai tugas staf pertama"), formatMinutes(week.firstFinishMinutes, locale) ?? dash],
    [t("Wait for approval", "Menunggu persetujuan"), formatMinutes(week.signupMinutes, locale) ?? dash],
    [t("Setup time (owner)", "Waktu menyiapkan (pemilik)"), formatMinutes(week.setupMinutes, locale) ?? dash],
    [t("Typed fields in setup", "Kolom diketik saat persiapan"), week.typedFields === null ? dash : String(Math.round(week.typedFields))],
    [t("Added by hand, 14 days", "Ditambah manual, 14 hari"), week.handItems14d === null ? dash : String(Math.round(week.handItems14d))],
    [t("Due tasks closed", "Tugas ditutup"), week.s3Due ? `${week.s3Closed} / ${week.s3Due} · ${percent(share(week.s3Closed, week.s3Due))}` : dash],
    [t("Active in week 4", "Aktif di minggu ke-4"), week.s4Of ? `${week.s4Active} / ${week.s4Of}` : dash],
    [t("Kakak 3+ in week 3", "Kakak 3+ di minggu ke-3"), week.s5Of ? `${week.s5Repeat} / ${week.s5Of}` : dash],
  ];
  return (
    <Card className="py-3" data-testid="north-star-week">
      <CardContent className="flex flex-col gap-2 px-4">
        <h3 className="text-sm font-medium text-gray-900">
          {t(`Week of ${dayLabel(week.weekStart, locale)}`, `Minggu ${dayLabel(week.weekStart, locale)}`)}
        </h3>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right tabular-nums text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** "1 household", "3 households" (English only: Indonesian has no plural). */
function households(n: number): string {
  return n === 1 ? "1 household" : `${n} households`;
}

/** "2 Nov" / "2 Nov" from YYYY-MM-DD, read as a calendar day (no time zone shift). */
function dayLabel(day: string, locale: "en" | "id"): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "short",
  });
}

function Shell({ t, children }: { t: Translate; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <Link
        href="/dashboard/approvals"
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("Household requests", "Permintaan rumah")}
      </Link>
      <h1 className="text-lg font-semibold text-gray-900">{t("North star", "Ukuran utama")}</h1>
      {children}
    </div>
  );
}
