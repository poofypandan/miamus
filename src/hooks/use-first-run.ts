"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/context/household-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { dataProvider } from "@/lib/data";
import {
  firstRunSteps,
  firstRunStorageKey,
  firstRunView,
  isPastFirstRun,
  nextFirstRunMemory,
  parseFirstRunMemory,
  staffOf,
  type FirstRunMemory,
  type FirstRunPerson,
  type FirstRunStep,
  type FirstRunStepId,
  type FirstRunView,
} from "@/lib/first-run";

function readMemory(key: string): FirstRunMemory {
  try {
    return parseFirstRunMemory(localStorage.getItem(key));
  } catch {
    // Storage off: the card shows, and closing it lasts for this visit only.
    return null;
  }
}

function writeMemory(key: string, value: Exclude<FirstRunMemory, null>) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // As above.
  }
}

export interface FirstRun {
  view: FirstRunView;
  steps: FirstRunStep[];
  /** Staff on the roster, for the step's detail and the new chore's assignee. */
  staff: FirstRunPerson[];
  linkedPhones: number;
  /** Not now. */
  dismiss: () => void;
  /** Closes the one-time "your home is set up" note. */
  close: () => void;
}

/**
 * The first-run checklist's state on an owner's Today (audit B1, item 3):
 * which steps are done, read from what the household already holds, and
 * whether this owner has closed the card on this phone (lib/first-run).
 *
 * Linked phones are the one extra read (list_linked_phones, admins only),
 * made only while the checklist could still show, and again whenever the
 * owner comes back to the app: the usual way through step 3 is "send the
 * link on WhatsApp, wait, come back".
 */
export function useFirstRun(): FirstRun {
  const { logs, householdTasks, schedules, loading, memberProfile, memberProfileReady, activeHouseholdId, tenantReady } =
    useHousehold();
  const { petsOn } = useHouseholdProfile();
  const { allProfiles } = useStaffProfiles();

  // Per roster row: one owner's card in one household. An admin without a
  // row (a database before migrations/106) falls back to the household.
  const ownerKey =
    tenantReady && memberProfileReady ? firstRunStorageKey(memberProfile?.id ?? activeHouseholdId) : null;

  // undefined until read for this owner: nothing shows before that.
  const [memory, setMemory] = useState<{ key: string; value: FirstRunMemory } | null>(null);
  useEffect(() => {
    if (ownerKey) setMemory({ key: ownerKey, value: readMemory(ownerKey) });
  }, [ownerKey]);
  const current = memory && memory.key === ownerKey ? memory.value : undefined;

  const past = isPastFirstRun({ chores: householdTasks, logs: logs.length });
  const closed = current === "dismissed" || current === "finished" || current === "completed";

  // Linked phones: null until known. A failed read counts as none linked,
  // so the card still shows (step 3 just stays open).
  const [phones, setPhones] = useState<number | null>(null);
  const wantsPhones = current !== undefined && !closed && !past;
  useEffect(() => {
    if (!wantsPhones) return;
    let live = true;
    const load = () => {
      dataProvider
        .listLinkedPhones()
        .then((list) => live && setPhones(list.length))
        .catch(() => live && setPhones((known) => known ?? 0));
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [wantsPhones]);

  const raw = useMemo(
    () =>
      firstRunSteps({
        people: allProfiles,
        linkedPhones: phones,
        chores: householdTasks,
        petRoutines: petsOn ? schedules.length : 0,
        logs: logs.length,
      }),
    [allProfiles, phones, householdTasks, petsOn, schedules.length, logs.length]
  );

  // A step once ticked stays ticked for the visit: Today reads chores around
  // the day on screen, and a first chore set for today shouldn't untick when
  // the owner looks at tomorrow.
  const [ticked, setTicked] = useState<ReadonlySet<FirstRunStepId>>(new Set());
  useEffect(() => {
    const fresh = raw.filter((step) => step.done && !ticked.has(step.id));
    if (fresh.length > 0) setTicked(new Set([...ticked, ...fresh.map((step) => step.id)]));
  }, [raw, ticked]);
  const steps = useMemo(
    () => raw.map((step) => (step.done || ticked.has(step.id) ? { ...step, done: true } : step)),
    [raw, ticked]
  );

  const ready = !loading && current !== undefined && allProfiles !== null && (closed || past || phones !== null);
  const view: FirstRunView = ready ? firstRunView(steps, current ?? null) : "hidden";

  useEffect(() => {
    if (!ready || !ownerKey || current === undefined) return;
    const next = nextFirstRunMemory(steps, view, current);
    if (next) {
      writeMemory(ownerKey, next);
      setMemory({ key: ownerKey, value: next });
    }
  }, [ready, ownerKey, current, steps, view]);

  const remember = useCallback(
    (value: "dismissed" | "finished") => {
      if (!ownerKey) return;
      writeMemory(ownerKey, value);
      setMemory({ key: ownerKey, value });
    },
    [ownerKey]
  );

  return {
    view,
    steps,
    staff: staffOf(allProfiles),
    linkedPhones: phones ?? 0,
    dismiss: () => remember("dismissed"),
    close: () => remember("finished"),
  };
}
