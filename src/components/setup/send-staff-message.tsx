"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/context/owner-locale-context";
import { dataProvider } from "@/lib/data";
import { staffInOneGoMessage } from "@/lib/setup-apply";
import { whatsAppShareUrl } from "@/lib/share-text";
import { videoTip } from "@/lib/video-tips";

/**
 * Staff in one go (Phase 172 PR A2, D10): one WhatsApp message with the
 * house link for everyone who still has to pick their name and make a PIN.
 * The message is Indonesian (staff read it); the button is the owner's
 * language.
 */
export function SendStaffMessageButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const t = useT();
  const [opening, setOpening] = useState(false);

  async function send() {
    if (opening) return;
    setOpening(true);
    try {
      const code = (await dataProvider.getHouseCode()) ?? (await dataProvider.rotateHouseCode());
      const origin = window.location.origin;
      const tip = videoTip("staff-house-code");
      const message = staffInOneGoMessage(code, origin, tip?.ready ? `${origin}/tips/staff-house-code` : null);
      window.open(whatsAppShareUrl(message), "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Could not make the staff message", err);
      toast.error(t("Couldn't get the house code. Try again.", "Kode rumah gagal diambil. Coba lagi."));
    } finally {
      setOpening(false);
    }
  }

  return (
    <Button variant={variant} className="min-h-[48px]" onClick={() => void send()} disabled={opening}>
      {opening ? <Loader2 className="animate-spin" /> : <MessageCircle />}
      {t("Send one WhatsApp message", "Kirim satu pesan WhatsApp")}
    </Button>
  );
}
