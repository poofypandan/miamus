import React from "react";
import { Composition } from "remotion";
import { Film, type FilmProps } from "./Film";
import { WorldTest, type WorldTestProps } from "./WorldTest";
import { Stills, type StillsProps } from "./stills/Stills";
import { A2Film, type A2Props } from "./a2/A2Film";
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
    {/* C1.5: stills on the score (trailer-reset 16, step A1); English. */}
    <Composition id="stills-60-en" component={Stills} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60" } as StillsProps} />
    <Composition id="stills-15-en" component={Stills} durationInFrames={15 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "15" } as StillsProps} />
    {/* A2: Acts 1, 2 and 4 moving, Act 3 as the C1.6 stills (trailer-reset 16); English, half resolution until C2. */}
    <Composition id="a2-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a2-60-en.wav" } as A2Props} />
    <Composition id="a2-15-en" component={A2Film} durationInFrames={15 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "15", audio: "audio/a2-15-en.wav" } as A2Props} />
    <Composition id="world-test" component={WorldTest} durationInFrames={600} fps={FPS} width={W} height={H} defaultProps={{ tod: 17.6 } as WorldTestProps} />
  </>
);
