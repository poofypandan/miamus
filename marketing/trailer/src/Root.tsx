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
    {/* A3: Act 3 of the 60 moving, with the frame check on every frame (trailer-reset 23); English, half resolution until C2. */}
    <Composition id="a3-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a3-60-en.wav", act3: true, check: "log" } as A2Props} />
    <Composition id="a3-15-en" component={A2Film} durationInFrames={15 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "15", audio: "audio/a3-15-en.wav", act3: true, check: "log" } as A2Props} />
    {/* The blind motion test (trailer-reset 28): the same film with 5–15 s rebuilt on the motion kit (src/motion). */}
    <Composition id="m1-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a4-60-en.wav", act3: true, motion: true } as A2Props} />
    {/* Its second pass (owner's pick, 20 Nov): the kit's motion in v17's composition (src/motion/turn-b.tsx). */}
    <Composition id="m2-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a4-60-en.wav", act3: true, motion: "b" } as A2Props} />
    {/* Its third pass (owner's notes on 2b, 20 Nov): v17's light, line 1 in the sky, Kakak centred, one firefly to her plate (src/motion/turn-c.tsx). */}
    <Composition id="m3-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a4-60-en.wav", act3: true, motion: "c" } as A2Props} />
    {/* Its fourth pass (owner's notes on 2c, 20 Nov): Mama walks out of the house; one light's journey (src/motion/turn-d.tsx). */}
    <Composition id="m4-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a4-60-en.wav", act3: true, motion: "d" } as A2Props} />
    {/* Its fifth pass (owner's questions on 2d, 20 Nov): calmer lights, no light to the subtitle, the footnote without the name (src/motion/turn-e.tsx). */}
    <Composition id="m5-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a4-60-en.wav", act3: true, motion: "e" } as A2Props} />
    {/* Its sixth pass (owner's note on 2e, 20 Nov): the rising light never crosses type (src/motion/turn-f.tsx). */}
    <Composition id="m6-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a4-60-en.wav", act3: true, motion: "f" } as A2Props} />
    {/* Its seventh pass (owner's note on 2f, 20 Nov): centred on the frame, x 540 (src/motion/turn-g.tsx). */}
    <Composition id="m7-60-en" component={A2Film} durationInFrames={60 * FPS} fps={FPS} width={W} height={H} defaultProps={{ cut: "60", audio: "audio/a4-60-en.wav", act3: true, motion: "g" } as A2Props} />
    <Composition id="world-test" component={WorldTest} durationInFrames={600} fps={FPS} width={W} height={H} defaultProps={{ tod: 17.6 } as WorldTestProps} />
  </>
);
