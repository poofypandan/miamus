import React from "react";
import { Composition } from "remotion";
import { Trailer, type TrailerProps } from "./Trailer";
import { FPS, H, W } from "./theme";

/** The four cuts. English 60 s is the primary version (owner, 13 Nov 2026); Indonesian second. */
export const CUTS: { id: string; props: TrailerProps; seconds: number }[] = [
  { id: "trailer-60-en", props: { locale: "en", cut: "60", music: null }, seconds: 60 },
  { id: "trailer-60-id", props: { locale: "id", cut: "60", music: null }, seconds: 60 },
  { id: "trailer-15-en", props: { locale: "en", cut: "15", music: null }, seconds: 15 },
  { id: "trailer-15-id", props: { locale: "id", cut: "15", music: null }, seconds: 15 },
];

export const RemotionRoot: React.FC = () => (
  <>
    {CUTS.map((cut) => (
      <Composition
        key={cut.id}
        id={cut.id}
        component={Trailer}
        durationInFrames={cut.seconds * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={cut.props}
      />
    ))}
  </>
);
