"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { List, Loader2, Pill, Scissors, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import {
  DEFAULT_DOSE_TIMES,
  DOSE_COUNT_OPTIONS,
  INTERVAL_UNIT_OPTIONS,
  TIME_INPUT_CLASS,
  daysBetweenInclusive,
  formatDateShort,
  generateGroomingOccurrences,
  type IntervalUnit,
} from "@/components/dashboard/schedule-editor";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { CreateRoutineProposalInput } from "@/lib/data";
import type { ScheduleCategoryName, TaskEntity } from "@/types/database";

// Indonesian labels for the owner-side interval options, which are English.
const INTERVAL_UNIT_LABELS: Record<IntervalUnit, string> = {
  days: "Hari",
  weeks: "Minggu",
};

/**
 * The staff counterpart to ManageRoutinesSheet.
 *
 * Meals and the potty routine are deliberately absent: those are the standing
 * shape of the household's day and belong to the owner. Staff propose the
 * things that come up — a course of medicine, a grooming visit, a one-off —
 * and every submission lands as pending proposals rather than real schedules.
 */
export function StaffRoutineSheet({
  entity,
  onClose,
}: {
  entity: TaskEntity | null;
  onClose: () => void;
}) {
  useBackToClose(!!entity, onClose);

  return (
    <Sheet open={!!entity} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-none gap-0 p-0 sm:max-w-none">
        {entity && (
          <>
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Usulan Rutinitas {entity.name}</SheetTitle>
              <SheetDescription>
                Usulan dikirim ke pemilik dulu. Rutinitas baru aktif setelah disetujui.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-4">
                <MedicineProposalCard entity={entity} />
                <GroomingProposalCard entity={entity} />
                <OtherProposalCard entity={entity} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Submits one batch of proposals under a shared batch_id, so the owner decides
 * on the whole course at once instead of ten separate doses.
 */
function useProposalBatch() {
  const { submitRoutineProposalsBatch } = useHousehold();
  const [sending, setSending] = useState(false);

  async function send(
    rows: Omit<CreateRoutineProposalInput, "batch_id" | "created_by">[],
    onDone: () => void
  ) {
    setSending(true);
    try {
      const batchId = crypto.randomUUID();
      await submitRoutineProposalsBatch(
        rows.map((row) => ({ ...row, batch_id: batchId, created_by: "staff" }))
      );
      toast.success("Usulan berhasil dikirim");
      onDone();
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengirim usulan");
    } finally {
      setSending(false);
    }
  }

  return { sending, send };
}

function ProposalCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Pill;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Icon className="size-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">{children}</CardContent>
    </Card>
  );
}

function MedicineProposalCard({ entity }: { entity: TaskEntity }) {
  const today = formatDateLocal(new Date());
  const [label, setLabel] = useState("");
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [doseTimes, setDoseTimes] = useState<string[]>(["09:00"]);
  const [endDate, setEndDate] = useState("");
  const { sending, send } = useProposalBatch();

  function changeFrequency(count: number) {
    setTimesPerDay(count);
    setDoseTimes((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push(DEFAULT_DOSE_TIMES[next.length] ?? "09:00");
      return next;
    });
  }

  // A date input's `min` is advisory — a typed or pasted value can still land
  // before it — so the range is checked here too, and surfaced inline rather
  // than only as a toast after a wasted tap.
  const endBeforeToday = !!endDate && endDate < today;
  const totalDays = endDate && !endBeforeToday ? Math.max(0, daysBetweenInclusive(today, endDate)) : 0;
  const totalDoses = totalDays * timesPerDay;

  function submit() {
    if (!label.trim()) {
      toast.error("Isi nama obat dulu");
      return;
    }
    if (!endDate || endDate < today) {
      toast.error("Pilih tanggal selesai hari ini atau setelahnya");
      return;
    }
    // One proposal per dose time, not per dose: the owner approves a repeating
    // daily time, exactly as the owner-side medication builder creates one.
    send(
      doseTimes.map((time) => ({
        pet_id: entity.id,
        title: label.trim(),
        category: "medication" as ScheduleCategoryName,
        time,
        notes: `Sampai ${formatDateShort(endDate)} · ${timesPerDay}x/hari`,
      })),
      () => {
        setLabel("");
        setEndDate("");
      }
    );
  }

  return (
    <ProposalCard icon={Pill} title="Obat & Vitamin">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Nama obat</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="mis. Antibiotik"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Berapa kali sehari</Label>
        <div className="grid grid-cols-4 gap-2">
          {DOSE_COUNT_OPTIONS.map((count) => (
            <Button
              key={count}
              type="button"
              variant={timesPerDay === count ? "default" : "outline"}
              className="min-h-[48px]"
              onClick={() => changeFrequency(count)}
            >
              {count}x
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Jam minum</Label>
        {/* auto-fit rather than a hard 2 columns: below ~7rem a time control
            has no room left for its value once the picker indicator is drawn,
            so on a narrow phone the row collapses to one per line instead of
            clipping both. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
          {doseTimes.map((time, index) => (
            <input
              key={index}
              type="time"
              value={time}
              onChange={(e) =>
                setDoseTimes((prev) => prev.map((t, i) => (i === index ? e.target.value : t)))
              }
              className={TIME_INPUT_CLASS}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Sampai tanggal</Label>
        <input
          type="date"
          value={endDate}
          min={today}
          onChange={(e) => setEndDate(e.target.value)}
          className={TIME_INPUT_CLASS}
        />
        {endBeforeToday ? (
          <p className="text-xs font-medium text-destructive">
            Tanggal selesai tidak boleh sebelum hari ini.
          </p>
        ) : (
          totalDoses > 0 && (
            <p className="text-xs text-muted-foreground">
              Total {totalDoses} dosis dalam {totalDays} hari.
            </p>
          )
        )}
      </div>

      <Button onClick={submit} disabled={sending || endBeforeToday} className="min-h-[48px]">
        {sending ? <Loader2 className="animate-spin" /> : <Send />} Kirim Usulan
      </Button>
    </ProposalCard>
  );
}

function GroomingProposalCard({ entity }: { entity: TaskEntity }) {
  const today = formatDateLocal(new Date());
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("weeks");
  const [endDate, setEndDate] = useState("");
  const { sending, send } = useProposalBatch();

  const endBeforeStart = !!endDate && !!startDate && endDate < startDate;

  const occurrences = useMemo(
    () =>
      endBeforeStart
        ? []
        : generateGroomingOccurrences(startDate, time, intervalValue, intervalUnit, endDate),
    [endBeforeStart, startDate, time, intervalValue, intervalUnit, endDate]
  );

  function submit() {
    if (!label.trim()) {
      toast.error("Isi nama perawatan dulu");
      return;
    }
    if (occurrences.length === 0) {
      toast.error("Pilih tanggal dan jarak yang menghasilkan minimal satu jadwal");
      return;
    }
    send(
      occurrences.map(({ date, time: occTime }) => ({
        pet_id: entity.id,
        title: label.trim(),
        category: "grooming" as ScheduleCategoryName,
        time: occTime,
        notes: `Tanggal ${formatDateShort(date)}`,
      })),
      () => {
        setLabel("");
        setEndDate("");
      }
    );
  }

  return (
    <ProposalCard icon={Scissors} title="Perawatan">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Nama perawatan</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="mis. Mandi & Sikat"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-xs">Mulai</Label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={TIME_INPUT_CLASS}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-xs">Jam</Label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={TIME_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Diulang setiap</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            min={1}
            value={intervalValue}
            onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value) || 1))}
            className="min-h-[48px] w-20 shrink-0"
          />
          {INTERVAL_UNIT_OPTIONS.map((unit) => (
            <Button
              key={unit.value}
              type="button"
              variant={intervalUnit === unit.value ? "default" : "outline"}
              className="min-h-[48px] flex-1"
              onClick={() => setIntervalUnit(unit.value)}
            >
              {INTERVAL_UNIT_LABELS[unit.value]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Sampai tanggal</Label>
        <input
          type="date"
          value={endDate}
          min={startDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={TIME_INPUT_CLASS}
        />
        {endBeforeStart ? (
          <p className="text-xs font-medium text-destructive">
            Tanggal selesai tidak boleh sebelum tanggal mulai.
          </p>
        ) : (
          occurrences.length > 0 && (
            <p className="text-xs text-muted-foreground">Total {occurrences.length} kali.</p>
          )
        )}
      </div>

      <Button
        onClick={submit}
        disabled={sending || endBeforeStart}
        className="min-h-[48px]"
      >
        {sending ? <Loader2 className="animate-spin" /> : <Send />} Kirim Usulan
      </Button>
    </ProposalCard>
  );
}

function OtherProposalCard({ entity }: { entity: TaskEntity }) {
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("12:00");
  const [notes, setNotes] = useState("");
  const { sending, send } = useProposalBatch();

  function submit() {
    if (!label.trim()) {
      toast.error("Isi nama tugas dulu");
      return;
    }
    send(
      [
        {
          pet_id: entity.id,
          title: label.trim(),
          category: "temporary" as ScheduleCategoryName,
          time,
          notes: notes.trim() || null,
        },
      ],
      () => {
        setLabel("");
        setNotes("");
      }
    );
  }

  return (
    <ProposalCard icon={List} title="Lainnya">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Nama tugas</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="mis. Potong kuku"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Jam</Label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={TIME_INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Catatan (opsional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="mis. Bawa ke klinik"
        />
      </div>

      <Button onClick={submit} disabled={sending} className="min-h-[48px]">
        {sending ? <Loader2 className="animate-spin" /> : <Send />} Kirim Usulan
      </Button>
    </ProposalCard>
  );
}
