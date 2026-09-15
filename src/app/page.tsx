"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, Share, SquarePlus } from "lucide-react";
import { PinModal } from "@/components/dashboard/owner-access";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const RUMAH = [
  { letter: "R", rest: "espek & Sopan" },
  { letter: "U", rest: "tamakan Komunikasi" },
  { letter: "M", rest: "enjaga Kebersihan" },
  { letter: "A", rest: "man & Selamat" },
  { letter: "H", rest: "ormati Privasi" },
];

export default function Home() {
  const router = useRouter();
  const [pinOpen, setPinOpen] = useState(false);

  function handleHiddenLogin() {
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
    setPinOpen(true);
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12 text-center select-none">
      <h1 className="mb-12 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
        Banyuwangi 11
      </h1>

      <div className="mx-auto flex w-fit flex-col items-start space-y-3 text-left text-base">
        {RUMAH.map((r) => (
          <div key={r.letter}>
            <span className="font-bold text-gray-900">{r.letter}</span>
            <span className="font-normal text-gray-500">{r.rest}</span>
          </div>
        ))}
      </div>

      <div className="mt-12 flex w-full justify-center">
        <Link
          href="/staff"
          className="w-full max-w-[220px] rounded-full bg-black py-3.5 text-base font-medium text-white shadow-sm transition-transform active:scale-95"
        >
          Jadwal
        </Link>
      </div>

      <InstallPrompt />

      {/* Deliberately invisible — owner access is a hidden gesture, not a
          visible button. Double-click (not single) so staff can't trigger
          it by accidentally tapping the corner of the screen. Mirrored on
          both corners so it works regardless of which hand holds the phone. */}
      <div
        className="fixed right-0 bottom-0 z-50 h-32 w-32 opacity-0"
        onDoubleClick={handleHiddenLogin}
      />
      <div
        className="fixed bottom-0 left-0 z-50 h-32 w-32 opacity-0"
        onDoubleClick={handleHiddenLogin}
      />

      <PinModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        // replace, not push: the landing screen must not sit behind the
        // dashboard in history, or Back drops an owner straight back out to it.
        onUnlocked={() => router.replace("/dashboard")}
      />
    </main>
  );
}

// Staff-facing, so entirely Bahasa Indonesia per the Phase 46 language boundary.
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
    <div className="mt-6 flex w-full justify-center standalone:hidden">
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
