"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PinModal } from "@/components/dashboard/owner-access";

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

      <div className="font-mono-manifesto mx-auto flex w-fit flex-col items-start space-y-3 text-left text-base">
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
        onUnlocked={() => router.push("/dashboard")}
      />
    </main>
  );
}
