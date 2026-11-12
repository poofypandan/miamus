"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BellOff,
  BellRing,
  Camera,
  Circle,
  CircleCheck,
  CircleCheckBig,
  ListChecks,
  Loader2,
  MessageCircle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { KakakSheet } from "@/components/kakak/kakak-sheet";
import { SendStaffMessageButton } from "@/components/setup/send-staff-message";
import { StarterListSheet } from "@/components/setup/starter-list-sheet";
import { VideoTip } from "@/components/shared/video-tip";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useKakakStatus } from "@/hooks/use-kakak-status";
import { nextFirstRunStep, type FirstRunStepId } from "@/lib/first-run";
import type { FirstRun } from "@/hooks/use-first-run";
import { moduleHref } from "@/lib/dashboard-modules";
import { isPlainClick, pushInPlace } from "@/lib/in-place-navigation";
import { cn } from "@/lib/utils";

const STAFF_HREF = `${moduleHref("access")}&page=staff`;

const PRIMARY = "min-h-[40px] px-4 text-sm";
const SECONDARY = "min-h-[40px] px-3.5 text-sm";

/**
 * "Set up your home" (audit B1, item 3), the first page a new household sees
 * since Phase 175 S2 (docs/phase-175-tabs-and-today-plan.md, section 4): how
 * Miamus works in three lines, then five rows from naming the home to the
 * first task staff finish. Mockup: "A brand-new household" in the Phase 175
 * mockups.
 *
 * Only the next step to do is open, with its one button (and, for Set up,
 * the starter list beside it); done steps stay as a quiet tick. "Use the
 * starter list" opens the Starter list sheet from Chores, which marks what
 * the home already has and adds only what is ticked. State and
 * rules live in useFirstRun and lib/first-run.
 */
export function FirstRunCard({
  firstRun,
  householdName,
  onAddTask,
}: {
  firstRun: FirstRun;
  householdName: string;
  /** Opens the chore form, with the first staff member chosen. */
  onAddTask: () => void;
}) {
  const t = useT();
  const { view, steps, facts, staff, linkedPhones } = firstRun;
  // The Set up row's two sheets live here, not in the row: saving in either
  // can finish the row (a first chore or pet routine), which stops rendering
  // its buttons, and the sheet must stay open for its saved note and Undo
  // until the owner closes it (Codex, #107). Each mounts on its first tap,
  // so a card that never needs one reads nothing for it.
  const [sheet, setSheet] = useState<"starter" | "kakak" | null>(null);
  const [mounted, setMounted] = useState<{ starter: boolean; kakak: boolean }>({ starter: false, kakak: false });
  function openSheet(which: "starter" | "kakak") {
    setMounted((known) => ({ ...known, [which]: true }));
    setSheet(which);
  }
  const closeSheet = () => setSheet(null);

  if (view === "hidden") return null;

  if (view === "finished") {
    return (
      <section
        aria-label={t("Your home is set up", "Rumah Anda sudah siap")}
        className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 animate-view-fade motion-reduce:animate-none"
      >
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-emerald-800">
          <CircleCheckBig className="size-4 shrink-0" aria-hidden />
          {t("Your home is set up", "Rumah Anda sudah siap")}
        </h3>
        <p className="text-sm text-gray-700">
          {t(
            "The first task is done. Today shows who did what, as it happens.",
            "Tugas pertama sudah selesai. Hari ini menunjukkan siapa mengerjakan apa, saat itu juga."
          )}
        </p>
        <Button variant="outline" className="min-h-[40px] self-start px-4 text-sm" onClick={firstRun.close}>
          {t("Done", "Selesai")}
        </Button>
      </section>
    );
  }

  const doneCount = steps.filter((step) => step.done).length;
  const next = nextFirstRunStep(steps);

  function go(href: string) {
    return (event: React.MouseEvent) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      startTransition(() => pushInPlace(href));
    };
  }

  // Step names only, and the open step's buttons (Phase 172, D11 rule 4):
  // about 40 words before the day, the three lines included (plan, section 4).
  const copy: Record<FirstRunStepId, { title: string; detail?: string | null }> = {
    home: { title: t("Name your home", "Beri nama rumah"), detail: householdName },
    setup: {
      title: t("Set up your home", "Siapkan rumah"),
      detail: staff.length > 0 ? staff.map((person) => person.name).join(", ") : null,
    },
    phone: {
      title: t("Send your staff the link", "Kirim link ke staf Anda"),
      detail:
        linkedPhones > 0
          ? t(`${linkedPhones} phone${linkedPhones === 1 ? "" : "s"}`, `${linkedPhones} HP`)
          : null,
    },
    notify: { title: t("Turn on notifications", "Aktifkan notifikasi") },
    done: { title: t("See the first task done", "Lihat tugas pertama selesai") },
  };

  function action(id: FirstRunStepId) {
    if (id === "setup") {
      // Whichever of staff and a first task is missing, with that step's own
      // button, and the starter list (plan, section 4). Staff first: the
      // starter list adds rooms and chores, not people.
      const addPerson = (
        <Button className={PRIMARY} asChild>
          <Link href={STAFF_HREF} scroll={false} onClick={go(STAFF_HREF)}>
            <Plus /> {t("Add a person", "Tambah Orang")}
          </Link>
        </Button>
      );
      const addTask = (
        <Button variant="outline" className={SECONDARY} onClick={onAddTask}>
          <Plus /> {t("Add a task", "Tambah Tugas")}
        </Button>
      );
      return (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {!facts.staff && addPerson}
          <Button
            variant={facts.staff ? "default" : "outline"}
            className={facts.staff ? PRIMARY : SECONDARY}
            onClick={() => openSheet("starter")}
          >
            <ListChecks /> {t("Use the starter list", "Pakai daftar awal")}
          </Button>
          {facts.staff && !facts.task && addTask}
          <TellKakakButton onOpen={() => openSheet("kakak")} />
        </div>
      );
    }
    if (id === "phone") {
      // The message itself, from the owner's own WhatsApp: the button from
      // /setup, with its label as it is, instead of a trip to Invite.
      return (
        <div className="mt-1.5 flex flex-col items-start gap-1.5">
          <SendStaffMessageButton />
          {staff.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t(
                `${Math.min(linkedPhones, staff.length)} of ${staff.length} phone${staff.length === 1 ? "" : "s"} linked`,
                `${Math.min(linkedPhones, staff.length)} dari ${staff.length} HP terhubung`
              )}
            </span>
          )}
        </div>
      );
    }
    if (id === "notify") return <NotifyAction firstRun={firstRun} />;
    return null;
  }

  const title = t("Set up your home", "Siapkan rumah Anda");

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-xl border bg-card px-3.5 pt-3 pb-1 animate-view-fade motion-reduce:animate-none"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
          {t(`${doneCount} of ${steps.length}`, `${doneCount} dari ${steps.length}`)}
        </span>
      </header>
      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-label={title}
      >
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      {/* How Miamus works, in three lines (plan, section 4, row 1). */}
      <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/60 px-3 py-2.5">
        <li className="flex items-center gap-2 text-[13px] text-gray-700">
          <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {t("Tell it once.", "Bilang sekali.")}
        </li>
        <li className="flex items-center gap-2 text-[13px] text-gray-700">
          <Camera className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {t("Staff do it, with a photo.", "Staf mengerjakan, dengan foto.")}
        </li>
        <li className="flex items-center gap-2 text-[13px] text-gray-700">
          <BellOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {t("You only hear about what didn't happen.", "Anda hanya dikabari kalau ada yang belum.")}
        </li>
      </ul>
      <ol className="flex flex-col divide-y divide-gray-100">
        {steps.map((step) => {
          const open = step.id === next;
          const { title: stepTitle, detail } = copy[step.id];
          return (
            <li
              key={step.id}
              data-step={step.id}
              data-done={step.done ? "true" : "false"}
              className="flex items-start gap-2.5 py-2"
            >
              {step.done ? (
                <CircleCheck className="mt-px size-5 shrink-0 text-emerald-700" aria-hidden />
              ) : (
                <Circle className="mt-px size-5 shrink-0 text-gray-300" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-sm",
                    step.done ? "text-muted-foreground" : open ? "font-semibold text-gray-900" : "font-medium text-gray-900"
                  )}
                >
                  <span className="sr-only">{step.done ? t("Done: ", "Selesai: ") : ""}</span>
                  {stepTitle}
                </span>
                {open && action(step.id)}
              </div>
              {step.done && detail && (
                <span className="max-w-[40%] shrink-0 truncate pt-0.5 text-[13px] text-muted-foreground">{detail}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            firstRun.dismiss();
            toast(t("Hidden. Staff and invites are in the Settings tab.", "Disembunyikan. Staf dan undangan ada di tab Pengaturan."), {
              duration: 6000,
              action: { label: t("Undo", "Batalkan"), onClick: firstRun.undoDismiss },
            });
          }}
          className="min-h-11 rounded-lg px-2 text-[13px] font-medium text-muted-foreground active:bg-muted"
        >
          {t("Not now", "Nanti saja")}
        </button>
      </div>
      {mounted.starter && (
        <StarterListSheet open={sheet === "starter"} onOpenChange={(open) => setSheet(open ? "starter" : null)} />
      )}
      {mounted.kakak && <KakakSheet open={sheet === "kakak"} onClose={closeSheet} />}
    </section>
  );
}

/**
 * "Or tell Kakak" (plan, section 4): opens her sheet, as the Tell Kakak
 * button does. Only in a home with Kakak on; nothing here depends on her.
 * The sheet itself is the card's (see FirstRunCard).
 */
function TellKakakButton({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const { status } = useKakakStatus();
  if (!status?.allowed || !status.enabled) return null;
  return (
    <Button variant="outline" className={cn(SECONDARY, "pl-2")} onClick={onOpen}>
      <KakakAvatar className="size-6" />
      {t("Or tell Kakak", "Atau bilang ke Kakak")}
    </Button>
  );
}

/**
 * "Turn on notifications" (plan, section 4): one tap where the phone can;
 * on an iPhone in a browser tab, Add to Home Screen first, which nobody
 * guesses; where they are blocked, where to allow them. The wording is the
 * notifications prompt's own (push-prompt.tsx).
 */
function NotifyAction({ firstRun }: { firstRun: FirstRun }) {
  const t = useT();
  const locale = useOwnerLocale();
  const [busy, setBusy] = useState(false);
  const { push, canEnablePush, enablePush } = firstRun;

  if (push === "ios-install-first") {
    return (
      <div className="mt-1 flex flex-col items-start gap-1.5">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t(
            "Tap Share, then Add to Home Screen. Open Miamus from your Home Screen and turn notifications on there.",
            "Ketuk Bagikan, lalu Tambahkan ke Layar Utama. Buka Miamus dari Layar Utama, lalu aktifkan notifikasi di sana."
          )}
        </p>
        <VideoTip id="owner-home-screen" locale={locale} />
      </div>
    );
  }

  if (push === "denied") {
    return (
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {t(
          "Miamus can't alert you on this phone. Allow notifications for Miamus in your browser or phone settings.",
          "Miamus tidak bisa memberi peringatan di HP ini. Izinkan notifikasi untuk Miamus di pengaturan browser atau HP."
        )}
      </p>
    );
  }

  async function turnOn() {
    if (!canEnablePush || busy) return;
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === "enabled") {
        toast.success(t("Notifications on for this device", "Notifikasi aktif di perangkat ini"));
      } else if (result === "denied") {
        toast.error(t("Notifications weren't allowed", "Notifikasi tidak diizinkan"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't turn on notifications", "Notifikasi gagal diaktifkan"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className={cn(PRIMARY, "mt-1.5 self-start")} onClick={turnOn} disabled={busy || !canEnablePush}>
      {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
      {t("Turn on", "Aktifkan")}
    </Button>
  );
}
