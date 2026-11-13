import React from "react";
import { Composition } from "remotion";
import { Film, type FilmProps } from "./Film";
import { WorldTest, type WorldTestProps } from "./WorldTest";
import { FPS, H, W } from "./theme";

/** The four cuts. English 60 s is the primary version; Indonesian second. */
export const CUTS: { id: string; props: FilmProps; seconds: number }[] = [
  { id: "film-60-en", props: { locale: "en", cut: "60", audio: "audio/mix-60-en.wav" }, seconds: 60 },
  { id: "film-60-id", props: { locale: "id", cut: "60", audio: "audio/mix-60-id.wav" }, seconds: 60 },
  { id: "film-15-en", props: { locale: "en", cut: "15", audio: "audio/mix-15-en.wav" }, seconds: 15 },
  { id: "film-15-id", props: { locale: "id", cut: "15", audio: "audio/mix-15-id.wav" }, seconds: 15 },
];

export const RemotionRoot: React.FC = () => (
  <>
    {CUTS.map((cut) => (
      <Composition key={cut.id} id={cut.id} component={Film} durationInFrames={cut.seconds * FPS} fps={FPS} width={W} height={H} defaultProps={cut.props} />
    ))}
    <Composition id="world-test" component={WorldTest} durationInFrames={600} fps={FPS} width={W} height={H} defaultProps={{ tod: 17.6 } as WorldTestProps} />
  </>
);
