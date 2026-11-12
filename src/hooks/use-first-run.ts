"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/context/household-context";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { recordSetupStage } from "@/hooks/use-setup-stage";
import { stageFrom } from "@/lib/calm-start";
import { usePushStatus } from "@/hooks/use-push-status";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { dataProvider } from "@/lib/data";
import type { PushStatus } from "@/lib/push-prompt";
import {
  firstRunFacts,
  firstRunStorageKey,
  firstRunView,
  isPastFirstRun,
  nextFirstRunMemory,
  parseFirstRunMemory,
  staffOf,
  stepsFromFacts,
  type FirstRunFact,
  type FirstRunFacts,
  type FirstRunMemory,
  type FirstRunPerson,
  type FirstRunStep,
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
  /** What the rows are made from: the Set up row shows whichever of staff and task is missing. */
  facts: FirstRunFacts;
  /** Staff on the roster, for the step's detail and the new chore's assignee. */
  staff: FirstRunPerson[];
  linkedPhones: number;
  /** This phone's notifications, for the "Turn on notifications" row. */
  push: PushStatus;
  canEnablePush: boolean;
  /** Straight from the tap (Safari asks only inside one). */
  enablePush: () => Promise<"enabled" | "denied" | "unavailable">;
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
 * Linked phones are one extra read (list_linked_phones, admins only),
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
  const [tickedRead, setTickedRead] = useState<Keyed<ReadonlySet<FirstRunFact>> | null>(null);
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

  // This phone's notifications (Phase 175 S2): asked only while the
  // checklist could show. It re-checks on its own when the owner comes back
  // from the phone's settings or turns them on anywhere in the app.
  const { status: push, canEnable: canEnablePush, enable: enablePush } = usePushStatus(open);

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
      firstRunFacts({
        people: allProfiles,
        linkedPhones: phones,
        chores: householdTasks,
        petRoutines: petsOn ? schedules.length : 0,
        logs: logs.length,
        finishedChore,
        push,
      }),
    [allProfiles, phones, householdTasks, petsOn, schedules.length, logs.length, finishedChore, push]
  );

  // A fact once true stays true for the visit: Today reads chores around the
  // day on screen, and a first chore set for today shouldn't untick when the
  // owner looks at tomorrow. Notifications are the exception: they are read
  // live from this phone, and turning them off should show.
  useEffect(() => {
    if (!ownerKey) return;
    const fresh = STICKY.filter((fact) => raw[fact] && !ticked.has(fact));
    if (fresh.length > 0) {
      setTickedRead({ key: ownerKey, value: new Set([...ticked, ...fresh]) });
    }
  }, [raw, ticked, ownerKey]);
  const facts = useMemo<FirstRunFacts>(
    () => ({
      staff: raw.staff || ticked.has("staff"),
      task: raw.task || ticked.has("task"),
      phone: raw.phone || ticked.has("phone"),
      notify: raw.notify,
      done: raw.done || ticked.has("done"),
    }),
    [raw, ticked]
  );
  const steps = useMemo(() => stepsFromFacts(facts, push), [facts, push]);

  const past = pastOnScreen || finishedChore === true;
  const ready =
    !loading &&
    current !== undefined &&
    allProfiles !== null &&
    (closed || pastOnScreen || (finishedChore !== null && (past || (phones !== null && push !== "loading"))));
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
  // new until past setup, Add to Home Screen and the notifications prompt
  // until a first task is given. A checklist this phone already closed as
  // done counts as past.
  //
  // Phase 175 S2: while the checklist is on screen it has its own "Turn on
  // notifications" row (with the iPhone's Add to Home Screen first), so the
  // two prompts above Today wait for the card to go: Not now, or the first
  // finished task. If notifications are still off then, the prompt takes
  // over (plan, section 4).
  const taskGiven = facts.task && view !== "checklist";
  useEffect(() => {
    if (!ready || !tenantReady) return;
    recordSetupStage(
      activeHouseholdId,
      stageFrom({
        past: past || current === "finished" || current === "completed",
        taskGiven,
      })
    );
  }, [ready, tenantReady, activeHouseholdId, past, current, taskGiven]);

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
    facts,
    staff,
    linkedPhones: phones ?? 0,
    push,
    canEnablePush,
    enablePush,
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

const NONE_TICKED: ReadonlySet<FirstRunFact> = new Set();

/** Facts that stay ticked for the visit once true (all but notifications). */
const STICKY: readonly FirstRunFact[] = ["staff", "task", "phone", "done"];
