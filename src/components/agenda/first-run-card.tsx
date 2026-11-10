"use client";

import { startTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Circle, CircleCheck, CircleCheckBig, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/context/owner-locale-context";
import { nextFirstRunStep, type FirstRunStepId } from "@/lib/first-run";
import type { FirstRun } from "@/hooks/use-first-run";
import { moduleHref } from "@/lib/dashboard-modules";
import { isPlainClick, pushInPlace } from "@/lib/in-place-navigation";
import { cn } from "@/lib/utils";

const STAFF_HREF = `${moduleHref("access")}&page=staff`;
const INVITE_HREF = `${moduleHref("access")}&page=invite`;

/**
 * "Set up your home" (audit B1, item 3): the first-run checklist on an
 * owner's Today, from naming the household to the first task staff finish.
 * Mockup: docs/mockups/b1-first-run-calmer-staff.html.
 *
 * Only the next step to do is open, with its one button; done steps stay as
 * a quiet tick. State and rules live in useFirstRun and lib/first-run.
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
  const { view, steps, staff, linkedPhones } = firstRun;

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

  const copy: Record<FirstRunStepId, { title: string; hint?: string; detail?: string | null }> = {
    home: { title: t("Name your home", "Beri nama rumah"), detail: householdName },
    staff: {
      title: t("Add who helps at home", "Tambah staf"),
      hint: t(
        "Add each person by name. They can choose their own PIN on their phone.",
        "Tambahkan setiap orang dengan namanya. Mereka bisa memilih PIN sendiri di HP-nya."
      ),
      detail: staff.length > 0 ? staff.map((person) => person.name).join(", ") : null,
    },
    phone: {
      title: t("Link their phone", "Hubungkan HP staf"),
      hint: t(
        "Make a link and send it on WhatsApp. Opening it connects their phone, with no account needed.",
        "Buat link lalu kirim lewat WhatsApp. Begitu dibuka, HP-nya terhubung, tanpa akun."
      ),
      detail:
        linkedPhones > 0
          ? t(`${linkedPhones} phone${linkedPhones === 1 ? "" : "s"}`, `${linkedPhones} HP`)
          : null,
    },
    task: {
      title: t("Give them a first task", "Beri tugas pertama"),
      hint: t(
        "A chore for today, like Sweep the terrace. It shows on their phone straight away.",
        "Tugas untuk hari ini, misalnya Sapu teras. Langsung muncul di HP-nya."
      ),
    },
    done: {
      title: t("See it done", "Lihat hasilnya"),
      hint: t(
        "This ticks itself when the task is finished, with photos, on their phone.",
        "Tercentang sendiri saat tugasnya selesai, dengan foto, di HP mereka."
      ),
    },
  };

  function action(id: FirstRunStepId) {
    if (id === "staff") {
      return (
        <Button className="mt-1.5 min-h-[40px] self-start px-4 text-sm" asChild>
          <Link href={STAFF_HREF} scroll={false} onClick={go(STAFF_HREF)}>
            <Plus /> {t("Add a person", "Tambah Orang")}
          </Link>
        </Button>
      );
    }
    if (id === "phone") {
      return (
        <Button className="mt-1.5 min-h-[40px] self-start px-4 text-sm" asChild>
          <Link href={INVITE_HREF} scroll={false} onClick={go(INVITE_HREF)}>
            <Smartphone /> {t("Get the link", "Buat link")}
          </Link>
        </Button>
      );
    }
    if (id === "task") {
      return (
        <Button className="mt-1.5 min-h-[40px] self-start px-4 text-sm" onClick={onAddTask}>
          <Plus /> {t("Add a task", "Tambah Tugas")}
        </Button>
      );
    }
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
      <p className="-mt-1 text-[13px] text-muted-foreground">
        {t("From here to the first task your staff finish.", "Dari sini sampai tugas pertama diselesaikan staf Anda.")}
      </p>
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
      <ol className="flex flex-col divide-y divide-gray-100">
        {steps.map((step) => {
          const open = step.id === next;
          const { title: stepTitle, hint, detail } = copy[step.id];
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
                {open && hint && <span className="text-[13px] leading-snug text-gray-700">{hint}</span>}
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
            toast(t("Hidden. Staff and invites are in the Household tab.", "Disembunyikan. Staf dan undangan ada di tab Rumah."));
          }}
          className="min-h-11 rounded-lg px-2 text-[13px] font-medium text-muted-foreground active:bg-muted"
        >
          {t("Not now", "Nanti saja")}
        </button>
      </div>
    </section>
  );
}
