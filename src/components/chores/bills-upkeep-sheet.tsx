"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AirVent,
  Bug,
  Car,
  Check,
  Cylinder,
  Droplets,
  Flame,
  GlassWater,
  HeartPulse,
  House,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useSetUpChores } from "@/hooks/use-set-up-chores";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import {
  QUICK_ITEMS,
  alreadyAdded,
  defaultFirstDue,
  quickItem,
  quickSubline,
  savedTitle,
  type QuickChore,
  type QuickIcon,
  type QuickItem,
  type QuickKey,
} from "@/lib/bills-upkeep";
import { REMIND_CHOICES, remindLabel } from "@/lib/chore-reminders";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { CreateHouseholdTaskInput } from "@/lib/data/types";

const ICONS: Record<QuickIcon, LucideIcon> = {
  zap: Zap,
  droplets: Droplets,
  wifi: Wifi,
  house: House,
  "heart-pulse": HeartPulse,
  landmark: Landmark,
  car: Car,
  "air-vent": AirVent,
  cylinder: Cylinder,
  bug: Bug,
  flame: Flame,
  "glass-water": GlassWater,
};

// Radix rejects an empty SelectItem value; "anyone" is the null assignee.
const ANYONE = "anyone";
const OFF = "off";

interface Choice {
  first: string | null;
  /** A roster id, or ANYONE. */
  who: string;
  remind: number | null;
}

/**
 * "Bills and upkeep" (Phase 164, D2): tick what the home pays or services on
 * a date and add them in one go, as ordinary chores (bills owner-assigned,
 * with a reminder) and, for gas and drinking water, supplies in Stok di rumah
 * (D6). Owner-only: opened from Chores → Today and the What's new card.
 */
export function BillsUpkeepSheet({
  open,
  onOpenChange,
  onOtherBill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Other bill": the chore form, preset as a monthly bill. */
  onOtherBill: () => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const today = formatDateLocal(useToday());
  const { memberProfile, createHouseholdTasks, addInventoryItem, inventoryItems } = useHousehold();
  const { profiles } = useStaffProfiles();
  const { rows } = useSetUpChores(today);
  const { householdTasks } = useHousehold();
  const chores = rows ?? householdTasks;

  const [selected, setSelected] = useState<Set<QuickKey>>(new Set());
  const [electricity, setElectricity] = useState<"electricity" | "electricity-token">("electricity");
  const [expanded, setExpanded] = useState<QuickKey | null>(null);
  const [choices, setChoices] = useState<Partial<Record<QuickKey, Partial<Choice>>>>({});
  const [saving, setSaving] = useState(false);

  useBackToClose(open, () => onOpenChange(false));

  // A fresh list each time it opens.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setElectricity("electricity");
    setExpanded(null);
    setChoices({});
  }, [open]);

  const me = memberProfile?.id ?? null;
  // The household's admins, me first. My own row comes from the household
  // context, so I'm offered even before the roster has loaded.
  const admins = useMemo(() => {
    const rows = (profiles ?? []).filter((p) => !!p.user_id && p.id !== memberProfile?.id);
    return memberProfile ? [memberProfile, ...rows] : rows;
  }, [profiles, memberProfile]);
  const staff = useMemo(
    () => (profiles ?? []).filter((p) => !p.user_id && p.id !== memberProfile?.id),
    [profiles, memberProfile]
  );
  const nameOf = (id: string) =>
    id === me ? t("Me", "Saya") : ((profiles ?? []).find((p) => p.id === id)?.name ?? t("Someone", "Seseorang"));

  function choiceFor(item: QuickChore): Choice {
    const own = choices[item.key] ?? {};
    return {
      first: own.first !== undefined ? own.first : defaultFirstDue(item, today),
      who: own.who ?? (item.who === "me" && me ? me : ANYONE),
      remind: own.remind !== undefined ? own.remind : item.remind,
    };
  }

  function setChoice(key: QuickKey, patch: Partial<Choice>) {
    setChoices((previous) => ({ ...previous, [key]: { ...previous[key], ...patch } }));
  }

  function toggle(key: QuickKey) {
    const turningOn = !selected.has(key);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // One whose date only the owner knows opens, so it can be picked.
    const item = actual(quickItem(key));
    if (turningOn && item.kind === "chore" && !choiceFor(item).first) setExpanded(key);
  }

  // The electricity row stands for whichever kind the home has.
  const rowsOf = (group: QuickItem["group"]) =>
    QUICK_ITEMS.filter((item) => item.group === group && !(item.kind === "chore" && item.variantOf));
  const actual = (item: QuickItem): QuickItem => (item.key === "electricity" ? quickItem(electricity) : item);

  const picked = [...selected].map((key) => actual(quickItem(key)));
  const missingDate = picked.find((item) => item.kind === "chore" && !choiceFor(item).first);

  async function add() {
    if (picked.length === 0 || missingDate) return;
    setSaving(true);
    try {
      const inputs: CreateHouseholdTaskInput[] = [];
      for (const item of picked) {
        if (item.kind !== "chore") continue;
        const choice = choiceFor(item);
        const who = choice.who === ANYONE ? null : choice.who;
        const forOwner = !!who && admins.some((a) => a.id === who);
        inputs.push({
          title: savedTitle(item, forOwner, locale),
          category: item.category,
          assigned_to: who,
          due_date: choice.first as string,
          due_time: null,
          notes: null,
          recurrence: item.recurrence,
          recurrence_interval: item.interval,
          remind_days_before: choice.remind,
        });
      }
      if (inputs.length > 0) await createHouseholdTasks(inputs);
      for (const item of picked) {
        if (item.kind !== "supply") continue;
        // As the supply form adds one (Phase 154): no counts, neutral values.
        await addInventoryItem({
          scope: "home",
          name: item.itemName,
          category: "household_supplies",
          photo_url: null,
          quantity: 0,
          unit: "pcs",
          min_threshold: 0,
          audit_frequency_days: 30,
        });
      }
      toast.success(t(`Added ${picked.length}`, `${picked.length} ditambahkan`));
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't add them. Try again.", "Gagal menambahkan. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  function row(base: QuickItem) {
    const item = actual(base);
    const Icon = ICONS[item.icon];
    const added = alreadyAdded(item, chores, inventoryItems);
    const isOn = selected.has(base.key);
    const isOpen = expanded === base.key && item.kind === "chore" && !added;
    const choice = item.kind === "chore" ? choiceFor(item) : null;
    const subline = added
      ? item.kind === "supply"
        ? t("In Supplies at home", "Ada di Stok di rumah")
        : t("Added", "Sudah ditambahkan")
      : item.kind === "supply"
        ? t("Goes to Supplies at home", "Masuk ke Stok di rumah")
        : quickSubline(item, choice?.first ?? null, locale);
    const whoOptions = item.kind === "chore" && item.group === "bill" ? admins : [...admins, ...staff];

    return (
      <li key={base.key} className={cn("border-t first:border-t-0", isOpen && "bg-muted/40")}>
        <div className="flex min-h-14 items-center gap-3 px-3 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-gray-700" aria-hidden />
          </span>
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-col text-left disabled:cursor-default"
            disabled={added || item.kind === "supply"}
            aria-expanded={item.kind === "chore" && !added ? isOpen : undefined}
            onClick={() => setExpanded(isOpen ? null : base.key)}
          >
            <span className="truncate text-sm font-medium text-gray-900">{item.name[locale]}</span>
            <span className={cn("truncate text-xs", added ? "text-emerald-700" : "text-muted-foreground")}>
              {subline}
            </span>
          </button>
          {added ? (
            <Check className="size-4 shrink-0 text-emerald-700" aria-label={t("Added", "Sudah ditambahkan")} />
          ) : (
            <button
              type="button"
              role="checkbox"
              aria-checked={isOn}
              aria-label={item.name[locale]}
              onClick={() => toggle(base.key)}
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-lg",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-md border-[1.5px]",
                  isOn ? "border-gray-900 bg-gray-900 text-white" : "border-gray-400 bg-white"
                )}
              >
                {isOn && <Check className="size-4" aria-hidden />}
              </span>
            </button>
          )}
        </div>

        {isOpen && choice && item.kind === "chore" && (
          <div className="flex flex-col gap-3 px-3 pb-3 pl-14">
            {base.key === "electricity" && (
              <div className="grid grid-cols-2 gap-2">
                {(["electricity", "electricity-token"] as const).map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    size="sm"
                    variant={electricity === kind ? "default" : "outline"}
                    className="min-h-10 rounded-lg"
                    aria-pressed={electricity === kind}
                    onClick={() => setElectricity(kind)}
                  >
                    {kind === "electricity" ? t("Postpaid", "Pascabayar") : t("Token", "Token")}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("Next due", "Jatuh tempo berikutnya")}</Label>
              <Input
                type="date"
                value={choice.first ?? ""}
                min={today}
                onChange={(e) => setChoice(base.key, { first: e.target.value || null })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("Assignee", "Ditugaskan ke")}</Label>
              <Select value={choice.who} onValueChange={(who) => setChoice(base.key, { who })}>
                <SelectTrigger className="min-h-11 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {item.group === "upkeep" && <SelectItem value={ANYONE}>{t("Unassigned", "Belum ditugaskan")}</SelectItem>}
                  {whoOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {nameOf(p.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("Remind me", "Ingatkan saya")}</Label>
              <Select
                value={choice.remind === null ? OFF : String(choice.remind)}
                onValueChange={(v) => setChoice(base.key, { remind: v === OFF ? null : Number(v) })}
              >
                <SelectTrigger className="min-h-11 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMIND_CHOICES.map((days) => (
                    <SelectItem key={days ?? OFF} value={days === null ? OFF : String(days)}>
                      {remindLabel(days, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {item.hint && <p className="text-xs text-muted-foreground">{item.hint[locale]}</p>}
          </div>
        )}
      </li>
    );
  }

  const groups: { group: QuickItem["group"]; label: string }[] = [
    { group: "bill", label: t("Bills", "Tagihan") },
    { group: "upkeep", label: t("Upkeep", "Perawatan rumah") },
    { group: "supply", label: t("Runs out by use", "Habis karena dipakai") },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("Bills and upkeep", "Tagihan dan perawatan")}</SheetTitle>
          <SheetDescription>
            {t(
              "Pick what your home pays or services regularly. You can change each one later.",
              "Pilih yang rutin dibayar atau dirawat di rumah Anda. Semua bisa diubah nanti."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          {groups.map(({ group, label }) => (
            <section key={group} className="flex flex-col gap-1.5" aria-label={label}>
              <h4 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</h4>
              <ul className="overflow-hidden rounded-xl border bg-white">{rowsOf(group).map(row)}</ul>
            </section>
          ))}
          {missingDate && missingDate.kind === "chore" && (
            <p className="text-xs font-medium text-amber-800">
              {t(`Pick the date for ${missingDate.name.en}.`, `Pilih tanggal untuk ${missingDate.name.id}.`)}
            </p>
          )}
        </div>

        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button
            onClick={add}
            disabled={saving || picked.length === 0 || !!missingDate}
            className="min-h-12 rounded-xl"
          >
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            {picked.length > 0 ? t(`Add ${picked.length}`, `Tambah ${picked.length}`) : t("Add", "Tambah")}
          </Button>
          <Button variant="ghost" className="min-h-11 rounded-xl" onClick={onOtherBill}>
            <ReceiptText /> {t("Other bill", "Tagihan lain")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
