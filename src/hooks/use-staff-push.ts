"use client";

import { useCallback, useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { usePushStatus } from "@/hooks/use-push-status";
import { PUSH_CHANGED_EVENT, sendTestPush } from "@/lib/push";
import { readSessionState } from "@/lib/auth/device-session";
import {
  STAFF_PUSH_CHANGED_EVENT,
  myPhonePushPeople,
  peopleLeftAfterTurningOff,
  setMyPushPerson,
  shouldUndoSubscription,
  type PhonePushPeople,
} from "@/lib/staff-push";

export type StaffPushTurnOn = "on" | "denied" | "cancelled" | "failed";

/**
 * Notifications on this staff phone (Phase 166): the browser's push status
 * (shared with the owner side, use-push-status), who this phone notifies,
 * and turning it on or off for the person on duty, or for everyone here.
 *
 * Nothing for an admin in staff view: they are themselves, and their
 * pushes are the owner ones (plan, "How a staff phone subscribes" 7).
 */
export function useStaffPush() {
  const { isHouseholdMember, tenantReady, signedOut } = useHousehold();
  const { staffId, staffName, confirmPerson } = useStaffIdentity();
  // Only a staff phone with a session asks anything: before it has one, every
  // request would go out with the public key alone (signed-out.spec).
  // null while checking; false offline or without one (nothing new shows).
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    if (isHouseholdMember || !tenantReady || signedOut) {
      setHasSession(false);
      return;
    }
    readSessionState()
      .then((state) => live && setHasSession(state === "ready"))
      .catch(() => live && setHasSession(false));
    return () => {
      live = false;
    };
  }, [isHouseholdMember, tenantReady, signedOut]);
  const push = usePushStatus(hasSession === true);
  // undefined while loading; null when not available here (mock mode, an
  // admin, or a database before migrations/141).
  const [people, setPeople] = useState<PhonePushPeople | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (isHouseholdMember || !tenantReady || signedOut) {
      setPeople(null);
      return;
    }
    // Still checking for the session: stays "loading". Without one, nothing.
    if (hasSession === null) return;
    if (!hasSession) {
      setPeople(null);
      return;
    }
    try {
      setPeople(await myPhonePushPeople());
    } catch (err) {
      console.error(err);
      setPeople(null);
    }
  }, [isHouseholdMember, tenantReady, signedOut, hasSession]);

  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener(STAFF_PUSH_CHANGED_EVENT, reload);
    window.addEventListener(PUSH_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener(STAFF_PUSH_CHANGED_EVENT, reload);
      window.removeEventListener(PUSH_CHANGED_EVENT, reload);
    };
  }, [load]);

  const listed = !!staffId && !!people?.people.some((p) => p.staff_id === staffId);
  const onForMe = push.status === "on" && listed;
  const others = (people?.people ?? []).filter((p) => p.staff_id !== staffId);

  /**
   * Straight from the tap: the phone's permission prompt first (Safari needs
   * the gesture), then the person on duty onto this phone's list. If the
   * server wants their PIN (someone else signed in here last), the usual PIN
   * screen asks for it once. `beforePin` runs first: a sheet that is open
   * must close, or its focus trap keeps the PIN pad from being tapped.
   */
  const turnOnForMe = useCallback(async (beforePin?: () => void): Promise<StaffPushTurnOn> => {
    if (!staffId || !staffName) return "failed";
    const subscribedNow = push.status !== "on";
    if (subscribedNow) {
      const result = await push.enable();
      if (result === "denied") return "denied";
      if (result === "unavailable") return "failed";
    }
    // A subscription made just now that ends up notifying nobody (the PIN
    // screen closed, a refused PIN, an error) is taken back: the phone keeps
    // push details only for someone who turned notifications on.
    const undo = async () => {
      if (shouldUndoSubscription(subscribedNow, people)) await push.disable().catch(() => {});
    };
    try {
      let added = await setMyPushPerson(staffId, true);
      if (added.status === "pin_required") {
        beforePin?.();
        if (!(await confirmPerson({ id: staffId, name: staffName }))) {
          await undo();
          return "cancelled";
        }
        added = await setMyPushPerson(staffId, true);
      }
      if (added.status !== "ok") {
        await undo();
        return "failed";
      }
    } catch (err) {
      await undo();
      throw err;
    }
    await load();
    return "on";
  }, [confirmPerson, load, people, push, staffId, staffName]);

  /** Only me. The last person off unsubscribes the phone too. */
  const turnOffForMe = useCallback(async () => {
    if (!staffId) return;
    await setMyPushPerson(staffId, false);
    // Who is left, from the server, or from the list already here when that
    // read fails: an unreadable list must never switch everyone off.
    const after = await myPhonePushPeople().catch(() => null);
    const left = peopleLeftAfterTurningOff(after, people, staffId);
    if (left.length === 0) await push.disable();
    await load();
  }, [load, people, push, staffId]);

  /** "Matikan di HP ini (untuk semua)": everyone's names off, then the subscription. */
  const turnOffForEveryone = useCallback(async () => {
    for (const person of people?.people ?? []) await setMyPushPerson(person.staff_id, false);
    await push.disable();
    await load();
  }, [load, people, push]);

  /** The existing test push; how many of this phone's subscriptions got it. */
  const sendTest = useCallback(() => sendTestPush(), []);

  return {
    status: push.status,
    canEnable: push.canEnable,
    markOff: push.markOff,
    people,
    available: people !== null,
    loaded: people !== undefined,
    listed,
    onForMe,
    others,
    staffId,
    staffName,
    turnOnForMe,
    turnOffForMe,
    turnOffForEveryone,
    sendTest,
  };
}

export type StaffPush = ReturnType<typeof useStaffPush>;
