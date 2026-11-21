"use client";

import { useEffect, useMemo } from "react";
import { Stethoscope, TriangleAlert } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useToday } from "@/hooks/use-today";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useTaskExceptions } from "@/hooks/use-task-exceptions";
import { itemException } from "@/lib/couldnt-do";
import { earliestLate, factsLine, lateLine, tilePhotoWidth, wallLayout, type WallLayout } from "@/lib/pet-wall";
import { getPetMeta, isAdmitted, petFocus, petPictureKind } from "@/lib/pets";
import { photoSrc } from "@/lib/photos";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import { FocusImg } from "@/components/pets/focus-img";
import type { TaskEntity } from "@/types/database";

/**
 * The Pets tab: every pet at once, as large as the screen allows, like the
 * framed photos on a wall at home (21 Nov; Fable's 08, section 5, decisions
 * 19–35; pets-profile.html). Every pet the same size, always; the wall fills
 * the space down to Kakak's pill and scrolls only from seven pets.
 *
 * A tile is the pet's own photo, edge to edge, with its name and one quiet
 * line: the facts that are known, or, when a routine is late, that routine in
 * pale amber with its mark (Today's own rule). Never a badge or a count, and a
 * tile never moves when it turns amber. A tap opens the pet's page.
 */
export function PetWall({ pets }: { pets: TaskEntity[] }) {
  const t = useT();
  const layout = wallLayout(pets.length);
  const fills = layout.rows !== null;
  useEffect(() => {
    if (!fills) return;
    document.body.dataset.petsWall = "";
    return () => {
      delete document.body.dataset.petsWall;
    };
  }, [fills]);
  const style =
    layout.rows === null
      ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridAutoRows: "233px" }
      : {
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(${layout.rows === 1 ? 320 : 150}px, 1fr))`,
        };
  return (
    <ul
      aria-label={t("Your pets", "Hewan Anda")}
      // Shares the column down to Kakak's pill (flex-1) while every pet fits;
      // from seven, fixed rows that scroll, the cut row showing there is more.
      // While every pet fits, the wall reaches 20 px into the room kept
      // above Kakak's band, ending about 12 px above her strip (Fable's
      // look, #197); the band's fade steps aside meanwhile (data-pets-wall).
      className={cn("grid gap-2", layout.rows !== null && "-mb-5 min-h-0 flex-1")}
      style={style}
    >
      {pets.map((pet) => (
        <li key={pet.id} className="min-h-0 min-w-0">
          <PetTile pet={pet} layout={layout} single={pets.length === 1} />
        </li>
      ))}
    </ul>
  );
}

function PetTile({ pet, layout, single }: { pet: TaskEntity; layout: WallLayout; single: boolean }) {
  const { schedules, logs, setActivePetId, userRole } = useHousehold();
  const locale = useOwnerLocale();
  const t = useT();
  const today = useToday();
  const todayStr = formatDateLocal(today);
  const meta = getPetMeta(pet);
  const kind = petPictureKind(pet);
  const atVet = isAdmitted(pet);

  // Today's routines for this pet, by Today's rule (useStaffProgress): read
  // again each minute, so a routine that crosses its grace turns amber while
  // the tab is open; one that someone said couldn't be done is explained,
  // never late (Codex, PR #197). Nothing is late while the pet is at the
  // clinic: its routines are paused.
  const { exceptions } = useTaskExceptions();
  const clock = useMinuteClock();
  const late = useMemo(() => {
    if (atVet) return null;
    const now = new Date(clock);
    const items = buildAgenda({ date: todayStr, entities: [pet], schedules, logs, now })
      .flatMap((g) => g.items)
      .filter((item) => !itemException(exceptions, todayStr, item));
    return earliestLate(items, todayStr, now.getHours() * 60 + now.getMinutes());
  }, [atVet, todayStr, pet, schedules, logs, exceptions, clock]);

  const facts = factsLine({ breed: meta.breed }, layout.columns);
  const line = late
    ? { text: lateLine(late, locale), tone: "late" as const }
    : atVet
      ? { text: t("At the vet", "Di klinik"), tone: "vet" as const }
      : facts
        ? { text: facts, tone: "quiet" as const }
        : null;
  // One button whose name carries its line: "Mocha. Late: Makan malam."
  const spoken = line ? `${pet.name}. ${line.text}.` : pet.name;
  const nameSize = single ? "text-[30px] leading-9" : "text-[22px] leading-7";

  return (
    <button
      type="button"
      onClick={() => setActivePetId(pet.id)}
      aria-label={spoken}
      className="relative block size-full overflow-hidden rounded-[24px] text-left shadow-card active:opacity-90"
    >
      {kind === "full" ? (
        <>
          <FocusImg
            src={photoSrc(meta.full_image_url ?? null, tilePhotoWidth(layout))}
            focus={petFocus(pet)}
            loading="lazy"
            className="absolute inset-0 size-full bg-zinc-200 object-cover"
          />
          {/* The soft shade that keeps the name readable on any photo: only
              the words' height and about 40 px above, no darker than 55 %, so
              the pet shows (Fable's look, #197). */}
          <span
            aria-hidden
            // A soft shadow on the words themselves lifts them on a pale photo
            // and hides nothing of the pet (Fable's look, #197).
            className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/55 via-black/35 to-transparent px-4 pt-10 pb-3.5 [text-shadow:0_1px_3px_rgb(31_26_23/0.45)]"
          >
            <span className={cn("truncate font-semibold tracking-[-0.02em] text-[#fff6e8]", nameSize)}>{pet.name}</span>
            {line && <TileLine line={line} onPhoto />}
          </span>
        </>
      ) : kind === "print" ? (
        // An old small square: a print on paper at its own size, never
        // stretched, the name under it in ink.
        <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoSrc(meta.avatar_url ?? null, 320)}
            alt=""
            loading="lazy"
            className="aspect-square max-h-[62%] max-w-[62%] min-h-0 rounded-md bg-zinc-100 object-cover shadow-[0_2px_8px_rgb(60_40_20/0.18)] ring-4 ring-white"
          />
          <span className="flex w-full flex-col items-center">
            <span className={cn("max-w-full truncate font-semibold tracking-[-0.02em] text-gray-900", nameSize)}>{pet.name}</span>
            {line && <TileLine line={line} />}
          </span>
        </span>
      ) : (
        // No photo: warm paper, the initial large and faint, never a grey placeholder.
        <span aria-hidden className="absolute inset-0 flex flex-col justify-end bg-[#f3ece1] px-4 pb-3.5">
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[96px] leading-none font-semibold text-[#e2d6c3] select-none">
            {pet.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="relative flex flex-col gap-0.5">
            <span className={cn("truncate font-semibold tracking-[-0.02em] text-gray-900", nameSize)}>{pet.name}</span>
            {line ? (
              <TileLine line={line} />
            ) : (
              userRole === "owner" && <span className="text-sm text-gray-600">{t("Add a photo", "Tambah foto")}</span>
            )}
          </span>
        </span>
      )}
    </button>
  );
}

function TileLine({
  line,
  onPhoto = false,
}: {
  line: { text: string; tone: "late" | "vet" | "quiet" };
  onPhoto?: boolean;
}) {
  if (line.tone === "late") {
    return (
      <span
        className={cn(
          "flex min-w-0 items-start gap-1 text-sm leading-5 font-medium",
          onPhoto ? "text-attention-tint" : "text-attention"
        )}
      >
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span className="line-clamp-2">{line.text}</span>
      </span>
    );
  }
  return (
    <span className={cn("flex min-w-0 items-center gap-1 text-sm leading-5", onPhoto ? "text-white/85" : "text-gray-600")}>
      {line.tone === "vet" && <Stethoscope className="size-3.5 shrink-0" />}
      <span className="truncate">{line.text}</span>
    </span>
  );
}
