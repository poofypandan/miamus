"use client";

import { useCallback, useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";
import {
  currentSubscription,
  disablePush,
  enablePush,
  fetchPushPublicKey,
  pushAvailability,
} from "@/lib/push";
import type { PushStatus } from "@/lib/push-prompt";

/** Fired when this device's push state changes, so every card agrees. */
const CHANGED_EVENT = "miamus:push-changed";

/**
 * This device's push status, and turning it on or off (2026-11-10).
 *
 * Shared by the Household → Notifications card, its row in the Household
 * list and the dashboard prompt. Each holds its own copy; a change made
 * through any of them is broadcast so the others re-check.
 */
export function usePushStatus() {
  const { activeHouseholdId, tenantReady } = useHousehold();
  const [status, setStatus] = useState<PushStatus>("loading");
  // Fetched before any tap, so enabling can ask for permission first thing
  // (see enablePush on why Safari needs that).
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const check = useCallback(async () => {
    const availability = pushAvailability();
    if (availability !== "supported") {
      setStatus(availability);
      return;
    }
    try {
      const [key, subscription] = await Promise.all([fetchPushPublicKey(), currentSubscription()]);
      setPublicKey(key);
      if (!key) setStatus("unconfigured");
      else if (Notification.permission === "denied") setStatus("denied");
      else if (subscription && Notification.permission === "granted") setStatus("on");
      else setStatus("off");
    } catch (err) {
      console.error(err);
      setStatus("unconfigured");
    }
  }, []);

  useEffect(() => {
    void check();
    // Coming back from the system settings after unblocking notifications
    // should update the card without a reload.
    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }
    function onChanged() {
      void check();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHANGED_EVENT, onChanged);
    };
  }, [check]);

  /** Straight from the tap. "denied" when the person said no (or had blocked it). */
  const enable = useCallback(async (): Promise<"enabled" | "denied" | "unavailable"> => {
    if (!publicKey || !tenantReady) return "unavailable";
    const result = await enablePush(activeHouseholdId, publicKey);
    if (result === "denied") {
      setStatus(Notification.permission === "denied" ? "denied" : "off");
    } else {
      setStatus("on");
    }
    window.dispatchEvent(new Event(CHANGED_EVENT));
    return result;
  }, [activeHouseholdId, publicKey, tenantReady]);

  const disable = useCallback(async () => {
    await disablePush();
    setStatus("off");
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }, []);

  /** The server lost this device (Send test found none): show it as off. */
  const markOff = useCallback(() => setStatus("off"), []);

  return { status, canEnable: publicKey !== null && tenantReady, enable, disable, markOff };
}
