"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { dataProvider } from "@/lib/data";
import { getStaffClaimLink, staffInOneGoMessage } from "@/lib/setup-apply";
import { whatsAppShareUrl } from "@/lib/share-text";
import { videoTip } from "@/lib/video-tips";

/**
 * Staff in one go (Phase 172 PR A2, D10): one WhatsApp message with the
 * house link and the claim code (audit L5) for everyone who still has to
 * pick their name and make a PIN.
 * The message is Indonesian (staff read it); the button is the owner's
 * language.
 *
 * The house code is read before the tap, so WhatsApp opens inside the tap
 * itself: iPhone Safari blocks a window opened after waiting on the network
 * (Codex, PR #90), as the house-code and invite panels already avoid.
 */
export function SendStaffMessageButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const t = useT();
  const { activeHouseholdId } = useHousehold();
  const [code, setCode] = useState<{ house: string; claim: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    (async () => {
      try {
        const [house, claim] = await Promise.all([
          dataProvider.getHouseCode().then((value) => value ?? dataProvider.rotateHouseCode()),
          getStaffClaimLink(activeHouseholdId),
        ]);
        if (live) setCode({ house, claim });
      } catch (err) {
        console.error("Could not get the house code", err);
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt, activeHouseholdId]);

  function send() {
    if (!code) {
      if (failed) setAttempt((n) => n + 1);
      toast.error(t("Couldn't get the house code. Try again.", "Kode rumah gagal diambil. Coba lagi."));
      return;
    }
    const origin = window.location.origin;
    const tip = videoTip("staff-house-code");
    const message = staffInOneGoMessage(code.house, origin, code.claim, tip?.ready ? `${origin}/tips/staff-house-code` : null);
    window.open(whatsAppShareUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <Button variant={variant} className="min-h-[48px]" onClick={send} disabled={!code && !failed}>
      {!code && !failed ? <Loader2 className="animate-spin" /> : <MessageCircle />}
      {t("Send one WhatsApp message", "Kirim satu pesan WhatsApp")}
    </Button>
  );
}
