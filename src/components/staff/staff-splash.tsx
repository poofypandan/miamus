"use client";

import { useState } from "react";
import { Download, Loader2, Share, SquarePlus } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const RUMAH = [
  { letter: "R", rest: "espek & Sopan" },
  { letter: "U", rest: "tamakan Komunikasi" },
  { letter: "M", rest: "enjaga Kebersihan" },
  { letter: "A", rest: "man & Selamat" },
  { letter: "H", rest: "ormati Privasi" },
];

/**
 * The house rules and the install prompt — what used to be the whole landing
 * page at "/".
 *
 * Moved under /staff in Phase 87, where it belongs: "/" became the commercial
 * front door, and these are the things a staff phone needs on the day it is
 * set up. Shown above the name picker, so it is seen once per device and never
 * again.
 *
 * Staff-facing, so entirely Bahasa Indonesia.
 */
export function StaffSplash() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Banyuwangi 11</h1>

      <div className="flex w-fit flex-col items-start space-y-2 text-left text-sm">
        {RUMAH.map((r) => (
          <div key={r.letter}>
            <span className="font-bold text-gray-900">{r.letter}</span>
            <span className="font-normal text-gray-500">{r.rest}</span>
          </div>
        ))}
      </div>

      <InstallPrompt />
    </div>
  );
}

function InstallPrompt() {
  const { isInstallable, isIOS, isStandalone, promptInstall } = usePwaInstall();
  const [prompting, setPrompting] = useState(false);

  // Already running as the installed app, or a browser that offers no install
  // path at all (desktop Firefox/Safari): nothing to say.
  if (isStandalone || (!isInstallable && !isIOS)) return null;

  async function install() {
    setPrompting(true);
    try {
      await promptInstall();
    } finally {
      setPrompting(false);
    }
  }

  return (
    // standalone:hidden is the CSS half of the guard — it holds even if the JS
    // detection above ever disagrees with the browser's actual display mode.
    <div className="flex w-full justify-center standalone:hidden">
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          disabled={prompting}
          className="flex w-full max-w-[220px] items-center justify-center gap-2 rounded-full border border-gray-300 bg-white py-3 text-sm font-medium text-gray-900 transition-transform active:scale-95 disabled:opacity-60"
        >
          {prompting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Pasang Aplikasi
        </button>
      ) : (
        // iOS has no install prompt API, so the best available is showing the
        // way through Safari's own menu. The icons carry the instruction for
        // phones set to English, where the menu labels won't match this text.
        <p className="max-w-[260px] text-xs leading-relaxed text-gray-500">
          Untuk memasang aplikasi, ketuk{" "}
          <Share className="inline size-3.5 -translate-y-px text-gray-700" aria-label="Bagikan" />{" "}
          <span className="font-medium text-gray-700">Bagikan</span>, lalu pilih{" "}
          <SquarePlus
            className="inline size-3.5 -translate-y-px text-gray-700"
            aria-label="Tambahkan ke Layar Utama"
          />{" "}
          <span className="font-medium text-gray-700">Tambahkan ke Layar Utama</span>.
        </p>
      )}
    </div>
  );
}
