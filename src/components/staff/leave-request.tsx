"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarOff, Loader2, MessageCircle, Plane, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WhatsAppNotifyPanel } from "@/components/staff/whatsapp-notify-panel";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useToday } from "@/hooks/use-today";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { formatLeaveRange, leaveApprovalPath, leaveDays, ownLeaveStatus } from "@/lib/leave";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { generateWhatsAppLink } from "@/lib/utils";
import type { LeaveRequest } from "@/types/database";

/**
 * Leave ("Cuti") from Action Mode (Phase 140). Staff-facing, so Bahasa
 * Indonesia.
 *
 * The request is filed pending, then handed to WhatsApp with a link straight
 * to its approval screen: the admin decides there, and says what becomes of
 * the chores meanwhile (app/dashboard/leave/[id]).
 */

function approvalMessage(name: string | null, leave: LeaveRequest): string {
  const days = leaveDays(leave);
  return `Halo! ${name ?? "Saya"} mengajukan cuti ${formatLeaveRange(leave, "id")} (${days} hari). Mohon disetujui di sini:`;
}

/** "Ajukan Cuti" — in the Lapor sheet, beside the other requests to an admin. */
export function LeaveRequestButton() {
  const { requestLeave } = useHousehold();
  const { staffId, staffName } = useStaffIdentity();
  const today = formatDateLocal(useToday());
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [filed, setFiled] = useState<LeaveRequest | null>(null);

  // Fresh form on every open, as the other report sheets do.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStart(today);
      setEnd(today);
      setFiled(null);
    }
  }

  // Nobody to ask for: an admin with no roster row yet (before
  // migrations/106) has no chores to hand over either.
  if (!staffId) return null;

  const invalid = !start || !end || end < start || start < today;

  async function handleSubmit() {
    if (invalid || !staffId) return;
    setSubmitting(true);
    try {
      setFiled(await requestLeave({ staff_id: staffId, start_date: start, end_date: end }));
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengajukan cuti. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="min-h-[48px] w-full">
          <CalendarOff /> Ajukan Cuti
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        {filed ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Cuti diajukan</SheetTitle>
              <SheetDescription>Kirim ke Admin untuk disetujui.</SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <WhatsAppNotifyPanel
                title="Cuti diajukan"
                description="Belum berlaku sampai Admin menyetujui. Kirim pesan supaya cepat ditanggapi."
                ctaLabel="Kirim ke Admin via WhatsApp"
                message={approvalMessage(staffName, filed)}
                linkPath={leaveApprovalPath(filed.id)}
                onDone={() => setOpen(false)}
              />
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Ajukan Cuti</SheetTitle>
              <SheetDescription>
                Pilih tanggal kamu tidak bekerja. Admin yang memutuskan siapa yang mengerjakan
                tugasmu selama itu.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Mulai</Label>
                  <Input
                    type="date"
                    value={start}
                    min={today}
                    onChange={(e) => {
                      setStart(e.target.value);
                      if (e.target.value > end) setEnd(e.target.value);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Sampai</Label>
                  <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              {!invalid && (
                <p className="text-xs text-muted-foreground">
                  {leaveDays({ start_date: start, end_date: end })} hari ·{" "}
                  {formatLeaveRange({ start_date: start, end_date: end }, "id")}
                </p>
              )}
              <Button className="min-h-[52px]" disabled={invalid || submitting} onClick={handleSubmit}>
                {submitting ? <Loader2 className="animate-spin" /> : <Plane />} Ajukan
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The person's own leave, at the top of their list: waiting for an answer,
 * or under way — with "Saya Sudah Kembali" to end it early and take their
 * chores back from today.
 */
export function LeaveStatusBanner() {
  const { leaveRequests, endLeaveEarly } = useHousehold();
  const { staffId, staffName } = useStaffIdentity();
  const today = formatDateLocal(useToday());
  const { profiles } = useStaffProfiles();
  const nameOf = useStaffNameLookup(profiles, "seseorang");
  const [ending, setEnding] = useState(false);

  const status = useMemo(() => ownLeaveStatus(leaveRequests, staffId, today), [leaveRequests, staffId, today]);
  if (!status) return null;
  const { leave } = status;

  if (status.kind === "pending") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 text-sm">
        <p className="flex items-start gap-2 text-gray-700">
          <CalendarOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            Cuti {formatLeaveRange(leave, "id")} menunggu persetujuan Admin. Tugasmu tetap
            seperti biasa sampai disetujui.
          </span>
        </p>
        <Button asChild variant="outline" className="min-h-[44px]">
          <a
            href={generateWhatsAppLink(approvalMessage(staffName, leave), leaveApprovalPath(leave.id))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle /> Kirim Ulang ke Admin
          </a>
        </Button>
      </div>
    );
  }

  const handover =
    leave.fallback_action === "pause"
      ? "Tugasmu dijeda selama cuti."
      : leave.fallback_action === "reassign" && leave.fallback_assignee_id
        ? `Tugasmu dikerjakan ${nameOf(leave.fallback_assignee_id)} selama cuti.`
        : "Tugasmu terbuka untuk siapa saja selama cuti.";

  async function handleBack() {
    setEnding(true);
    try {
      await endLeaveEarly(leave.id);
      toast.success("Selamat datang kembali! Tugasmu sudah kembali ke daftar.");
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 text-sm">
      <p className="flex items-start gap-2 text-gray-700">
        <Plane className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          Kamu sedang cuti sampai{" "}
          {new Date(`${leave.end_date}T00:00:00`).toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "short",
          })}
          . {handover}
        </span>
      </p>
      <Button variant="outline" className="min-h-[44px]" disabled={ending} onClick={handleBack}>
        {ending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Saya Sudah Kembali
      </Button>
    </div>
  );
}
