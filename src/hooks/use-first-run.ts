"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/context/household-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { recordSetupStage } from "@/hooks/use-setup-stage";
import { stageFrom } from "@/lib/calm-start";
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
  /**
   * True once `view` is settled for this load. Before that "hidden" only
   * means not known yet: whether the household ever finished a chore is a
   * read of its own (Phase 175: Today's status line waits for it, so it
   * never shows for a moment above a Set up card that is about to appear).
   */
  ready: boolean;
  steps: FirstRunStep[];
  /** Staff on the roster, for the step's detail and the new chore's assignee. */
  staff: FirstRunPerson[];
  linkedPhones: number;
  /** Not now. */
  dismiss: () => void;
  /** Takes Not now back (the toast's Undo). */
  undoDismiss: () => void;
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
export function useFirstRun(active = true): FirstRun {
  const { logs, householdTasks, schedules, loading, memberProfile, memberProfileReady, activeHouseholdId, tenantReady } =
    useHousehold();
  const { petsOn } = useHouseholdProfile();
  const { allProfiles } = useStaffProfiles();

  // Per roster row: one owner's card in one household. An admin without a
  // row (a database before migrations/106) falls back to the household.
  const ownerKey =
    tenantReady && memberProfileReady ? firstRunStorageKey(memberProfile?.id ?? activeHouseholdId) : null;

  // Everything below is held with the key it was read for, so nothing from
  // one household (or owner) leaks into another's card: a value for another
  // key reads as not known yet.
  const [memory, setMemory] = useState<Keyed<FirstRunMemory> | null>(null);
  const [phonesRead, setPhonesRead] = useState<Keyed<number> | null>(null);
  const [finishedRead, setFinishedRead] = useState<Keyed<boolean> | null>(null);
  const [tickedRead, setTickedRead] = useState<Keyed<ReadonlySet<FirstRunStepId>> | null>(null);
  const current = forKey(memory, ownerKey);
  const phones = forKey(phonesRead, ownerKey) ?? null;
  const finishedChore = forKey(finishedRead, ownerKey) ?? null;
  const ticked = forKey(tickedRead, ownerKey) ?? NONE_TICKED;

  useEffect(() => {
    if (ownerKey) setMemory({ key: ownerKey, value: readMemory(ownerKey) });
  }, [ownerKey]);

  const closed = current === "dismissed" || current === "finished" || current === "completed";
  // What's loaded already settles it, when it can.
  const pastOnScreen = isPastFirstRun({ chores: householdTasks, logs: logs.length });
  const open = !!ownerKey && current !== undefined && !closed && !pastOnScreen;

  // Ever finished a chore, on any date: once per owner key, only while the
  // checklist could still show. A failed read counts as no.
  useEffect(() => {
    if (!open || !ownerKey || finishedChore !== null) return;
    let live = true;
    dataProvider
      .hasFinishedChore()
      .catch(() => false)
      .then((value) => live && setFinishedRead({ key: ownerKey, value }));
    return () => {
      live = false;
    };
  }, [open, ownerKey, finishedChore]);

  // Linked phones: null until known. A failed read counts as none linked, so
  // the card still shows (step 3 just stays open). Read again when the owner
  // comes back to the app, but only while none is linked yet and Today is
  // on the Day view, where the card lives.
  const wantsPhones = open && active && finishedChore === false && (phones === null || phones === 0);
  useEffect(() => {
    if (!wantsPhones || !ownerKey) return;
    let live = true;
    const load = () => {
      dataProvider
        .listLinkedPhones()
        .then((list) => list.length)
        .catch(() => null)
        .then((count) => {
          if (!live) return;
          setPhonesRead((known) => ({
            key: ownerKey,
            value: count ?? (known?.key === ownerKey ? known.value : 0),
          }));
        });
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
  }, [wantsPhones, ownerKey]);

  const raw = useMemo(
    () =>
      firstRunSteps({
        people: allProfiles,
        linkedPhones: phones,
        chores: householdTasks,
        petRoutines: petsOn ? schedules.length : 0,
        logs: logs.length,
        finishedChore,
      }),
    [allProfiles, phones, householdTasks, petsOn, schedules.length, logs.length, finishedChore]
  );

  // A step once ticked stays ticked for the visit: Today reads chores around
  // the day on screen, and a first chore set for today shouldn't untick when
  // the owner looks at tomorrow.
  useEffect(() => {
    if (!ownerKey) return;
    const fresh = raw.filter((step) => step.done && !ticked.has(step.id));
    if (fresh.length > 0) {
      setTickedRead({ key: ownerKey, value: new Set([...ticked, ...fresh.map((step) => step.id)]) });
    }
  }, [raw, ticked, ownerKey]);
  const steps = useMemo(
    () => raw.map((step) => (step.done || ticked.has(step.id) ? { ...step, done: true } : step)),
    [raw, ticked]
  );

  const past = pastOnScreen || finishedChore === true;
  const ready =
    !loading &&
    current !== undefined &&
    allProfiles !== null &&
    (closed || pastOnScreen || (finishedChore !== null && (past || phones !== null)));
  const view: FirstRunView = ready ? firstRunView(steps, current ?? null) : "hidden";

  useEffect(() => {
    if (!ready || !ownerKey || current === undefined) return;
    const next = nextFirstRunMemory(steps, view, current);
    if (next) {
      writeMemory(ownerKey, next);
      setMemory({ key: ownerKey, value: next });
    }
  }, [ready, ownerKey, current, steps, view]);

  // What the rest of the app waits on (Phase 172, lib/calm-start): What's
  // new until past setup, Add to Home Screen until a first task is given.
  // A checklist this phone already closed as done counts as past.
  useEffect(() => {
    if (!ready || !tenantReady) return;
    recordSetupStage(
      activeHouseholdId,
      stageFrom({
        past: past || current === "finished" || current === "completed",
        taskGiven: steps.some((step) => step.id === "task" && step.done),
      })
    );
  }, [ready, tenantReady, activeHouseholdId, past, current, steps]);

  const remember = useCallback(
    (value: Exclude<FirstRunMemory, null>) => {
      if (!ownerKey) return;
      writeMemory(ownerKey, value);
      setMemory({ key: ownerKey, value });
    },
    [ownerKey]
  );

  const staff = useMemo(() => staffOf(allProfiles), [allProfiles]);

  return {
    view,
    ready,
    steps,
    staff,
    linkedPhones: phones ?? 0,
    dismiss: () => remember("dismissed"),
    // Not now's Undo: back to the checklist, as already seen.
    undoDismiss: () => remember("shown"),
    close: () => remember("finished"),
  };
}

interface Keyed<T> {
  key: string;
  value: T;
}

/** A value read for `key`, or undefined when it was read for another (or none). */
function forKey<T>(read: Keyed<T> | null, key: string | null): T | undefined {
  return read && key && read.key === key ? read.value : undefined;
}

const NONE_TICKED: ReadonlySet<FirstRunStepId> = new Set();
