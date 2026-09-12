"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Banyuwangi 11</h1>
      </div>

      <div className="mx-auto flex w-fit flex-col items-start text-left text-sm">
        {RUMAH.map((r) => (
          <div key={r.letter}>
            <span className="font-bold text-black">{r.letter}</span>
            <span className="text-gray-500">{r.rest}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/staff">Jadwal</Link>
        </Button>
      </div>

      {/* Deliberately invisible — owner access is a hidden gesture, not a
          visible button. Double-click (not single) so staff can't trigger
          it by accidentally tapping the corner of the screen. */}
      <div
        className="fixed right-0 bottom-0 z-50 h-32 w-32 opacity-0"
        onDoubleClick={() => setPinOpen(true)}
      />

      <PinModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        onUnlocked={() => router.push("/dashboard")}
      />
    </div>
  );
}
