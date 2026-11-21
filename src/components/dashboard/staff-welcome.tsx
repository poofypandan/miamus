"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStaffJoinCodes } from "@/components/setup/send-staff-message";
import { useT } from "@/context/owner-locale-context";
import { qrPath } from "@/lib/qr";
import { personalWelcomeMessage, welcomeLink } from "@/lib/setup-apply";
import { whatsAppShareUrl } from "@/lib/share-text";
import { videoTip } from "@/lib/video-tips";

/**
 * The personal welcome (staff onboarding, step 3): one WhatsApp message with
 * her name, her own link ("Anda Sri?" when she opens it) and the privacy line
 * (owner decision 10), or the same link as a QR code drawn on this phone,
 * for when she is standing in the kitchen and her number isn't saved yet.
 *
 * As SendStaffMessageButton: the codes are read before the tap, so WhatsApp
 * opens inside the tap itself (iPhone Safari). Owner-facing buttons in the
 * owner's language; the message is Bahasa Indonesia, as staff read it.
 */
export function StaffWelcome({ person }: { person: { id: string; name: string } }) {
  const t = useT();
  const { code, failed, retry } = useStaffJoinCodes();
  const [showQr, setShowQr] = useState(false);
  const loading = !code && !failed;

  const link = code && typeof window !== "undefined" ? welcomeLink(code.house, window.location.origin, code.claim, person.id) : null;
  const qr = useMemo(() => (showQr && link ? qrPath(link) : null), [showQr, link]);

  function noCode() {
    if (failed) retry();
    toast.error(t("Couldn't get the house code. Try again.", "Kode rumah gagal diambil. Coba lagi."));
  }

  function send() {
    if (!code) return noCode();
    const origin = window.location.origin;
    const tip = videoTip("staff-house-code");
    const message = personalWelcomeMessage({
      name: person.name,
      code: code.house,
      origin,
      claim: code.claim,
      staffId: person.id,
      videoUrl: tip?.ready ? `${origin}/tips/staff-house-code` : null,
    });
    window.open(whatsAppShareUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-2">
      <Button className="min-h-[48px] rounded-xl" onClick={send} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <MessageCircle />}
        {t("Send welcome on WhatsApp", "Kirim sambutan lewat WhatsApp")}
      </Button>
      <Button
        variant="outline"
        className="min-h-[48px] rounded-xl"
        aria-expanded={showQr}
        onClick={() => (code ? setShowQr((on) => !on) : noCode())}
        disabled={loading}
      >
        <QrCode />
        {showQr ? t("Hide QR code", "Sembunyikan kode QR") : t("Show QR code", "Tampilkan kode QR")}
      </Button>
      {qr && (
        <figure className="flex flex-col items-center gap-2 pt-2">
          <svg
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            role="img"
            aria-label={t(`QR code for ${person.name}`, `Kode QR untuk ${person.name}`)}
            className="size-56 rounded-lg bg-white"
            shapeRendering="crispEdges"
            data-testid="welcome-qr"
          >
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.path} fill="#111" />
          </svg>
          <figcaption className="text-center text-xs text-muted-foreground">
            {t(
              `${person.name} points their phone's camera at it, opens the link and makes a PIN.`,
              `${person.name} mengarahkan kamera HP-nya ke sini, membuka link-nya, lalu membuat PIN.`
            )}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
