/**
 * C1.5 "stills on the score": one held frame per shot, on the shot times in shots.json.
 * In Studio it plays as a slideshow; scripts/c15.mjs renders one PNG per shot and cuts them to the mix.
 * Every frame is wrapped in the readability check (readability.tsx).
 */
import React from "react";
import { AbsoluteFill, Freeze, useCurrentFrame } from "remotion";
import { Film } from "../Film";
import { FPS } from "../theme";
import { Readable } from "./readability";
import { NEW_SHOTS, OVERLAYS } from "./shots";
import shots from "./shots.json";

export type StillsProps = { cut: "60" | "15" };
export type ShotDef = { id: string; from: number; to: number; v17?: number; fadeIn?: number; what: string };
export const SHOTS = shots as Record<"60" | "15", ShotDef[]>;

export function ShotFrame({ cut, shot }: { cut: "60" | "15"; shot: ShotDef }) {
  const New = NEW_SHOTS[cut][shot.id];
  const Over = OVERLAYS[cut][shot.id];
  return (
    <Readable label={`${cut}-${shot.id}`}>
      {New ? (
        <New />
      ) : (
        <Freeze frame={Math.round((shot.v17 ?? shot.from) * FPS)}>
          <Film locale="en" cut={cut} audio={null} />
          {Over && <Over />}
        </Freeze>
      )}
    </Readable>
  );
}

export const Stills: React.FC<StillsProps> = ({ cut }) => {
  const t = useCurrentFrame() / FPS;
  const list = SHOTS[cut];
  const shot = list.find((s) => t >= s.from && t < s.to) ?? list[list.length - 1];
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      <ShotFrame key={shot.id} cut={cut} shot={shot} />
    </AbsoluteFill>
  );
};
