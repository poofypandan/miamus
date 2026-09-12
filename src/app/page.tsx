"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PinModal } from "@/components/dashboard/owner-access";

const RUMAH = [
  { letter: "R", text: "Respek & Sopan" },
  { letter: "U", text: "Utamakan Komunikasi" },
  { letter: "M", text: "Menjaga Kebersihan" },
  { letter: "A", text: "Aman & Selamat" },
  { letter: "H", text: "Hormati Privasi" },
];

export default function Home() {
  const router = useRouter();
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Banyuwangi 11</h1>
      </div>

      <div className="mx-auto flex w-fit flex-col items-start text-left text-sm text-gray-500">
        {RUMAH.map((r) => (
          <p key={r.letter}>
            <span className="font-semibold text-gray-700">{r.letter}</span> — {r.text}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/staff">Jadwal</Link>
        </Button>
        <Button size="lg" variant="outline" onClick={() => setPinOpen(true)}>
          Owner Dashboard
        </Button>
      </div>

      <PinModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        onUnlocked={() => router.push("/dashboard")}
      />
    </div>
  );
}
