/**
 * A2 (trailer-reset 16): Acts 1, 2 and 4 move; Act 3 holds the C1.6 stills on their shot times until Fable's C1.6
 * review and product changes #1/#2 (shots 8, 10, 11). English only, half resolution until C2.
 *
 *  60: 0–5 the hook (v17, with fix 13) · 5–15 Act 2, animated (act2.tsx) · 15–41 the Act 3 stills · 41–60 the ending
 *      (v17, with fix 9: 50 px plates, Mama's answer in her own bubble, the hand, the plain end line).
 *  15: 0–3 the hook · 3–10 the stills B1, B2, C, D (AI tab at 44 px, the plate held 3.0 to 7.6 s) · 10–15 the ending
 *      (Mama's answer up by 11.0 s; one plain line under the name at a time; no plate on the end card).
 */
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Ending, Hook, Voice } from "../film/scenes";
import { FPS, S15, S60, type Span, len } from "../film/timeline";
import voData from "../film/vo-data.json";
import { COPY } from "../film/copy";
import { SHOTS, ShotFrame } from "../stills/Stills";
import { loadFonts } from "../theme";
import { Captions } from "../ui/kakak";
import { Grain, ramp } from "../ui/kit";
import { Act2 } from "./act2";
import { Turn } from "../motion/turn";
import { TurnB } from "../motion/turn-b";
import { TurnC } from "../motion/turn-c";
import { TurnD } from "../motion/turn-d";
import { Act3, Act3Short } from "../a3/act3";
import { FrameCheck } from "../stills/readability";

loadFonts();

/** A3: `act3` animates Act 3 of the 60 (src/a3/act3.tsx); `check` runs the frame check on every frame ("strict" fails the render). */
/** `motion`: 5–15 s of the 60 on the motion kit (src/motion/turn.tsx; the blind motion test, trailer-reset 28). "b": its second pass, in v17's composition (turn-b.tsx). "c": the third (turn-c.tsx). "d": the fourth (turn-d.tsx). */
export type A2Props = { cut: "60" | "15"; audio: string | null; act3?: boolean; check?: "log" | "strict"; motion?: boolean | "b" | "c" | "d" };
type VoCut = { cues: { id: string; from: number; to: number }[]; env: number[]; pulse?: number[] };

function Scene({ span, children }: { span: Span; children: React.ReactNode }) {
  return (
    <Sequence from={span[0]} durationInFrames={len(span)} layout="none">
      {children}
    </Sequence>
  );
}

/** The stills of one stretch, each from its time (with its crossfade) to the next one's. */
function StillsStretch({ cut, from, to }: { cut: "60" | "15"; from: number; to: number }) {
  const list = SHOTS[cut].filter((s) => s.from >= from - 1e-6 && s.to <= to + 1e-6);
  return (
    <>
      {list.map((s, i) => {
        const fade = s.fadeIn ?? 0;
        const next = list[i + 1]?.fadeIn ?? 0;
        const start = Math.round((s.from - fade) * FPS);
        const dur = Math.round((s.to - s.from + fade + next) * FPS);
        return (
          <Sequence key={s.id} from={start} durationInFrames={dur} layout="none">
            <Faded frames={Math.round(fade * FPS)}>
              <ShotFrame cut={cut} shot={s} />
            </Faded>
          </Sequence>
        );
      })}
    </>
  );
}
function Faded({ frames, children }: { frames: number; children: React.ReactNode }) {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: frames > 0 ? ramp(f, 0, frames) : 1 }}>{children}</AbsoluteFill>;
}

export const A2Film: React.FC<A2Props> = ({ cut, audio, act3 = false, check, motion = false }) => {
  const frame = useCurrentFrame();
  const copy = COPY.en;
  const vo = (voData as Record<string, VoCut>)[`${cut}-en`];
  const cues = vo.cues.map((c) => ({ from: Math.round(c.from * FPS), to: Math.round(c.to * FPS), text: copy.lines[c.id as keyof typeof copy.lines] as string, id: c.id }));
  const voice = { level: vo.env[frame] ?? 0, pulse: vo.pulse?.[frame] ?? 0, cue: (id: string) => cues.find((c) => c.id === id) ?? null };
  const p = { locale: "en" as const };
  const lead = 12; // the hook crossfades into the dusk over 0.4 s
  const film = (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      {audio && <Audio src={staticFile(audio)} />}
      <Voice.Provider value={voice}>
        {cut === "60" ? (
          <>
            <Scene span={S60.hook}><Hook {...p} t0={0} /></Scene>
            <Sequence from={S60.turn[0] - lead} durationInFrames={S60.kakak[1] - S60.turn[0] + lead} layout="none">
              <Faded frames={lead}>
                {motion === "d" ? <TurnD base={S60.turn[0]} lead={lead} /> : motion === "c" ? <TurnC base={S60.turn[0]} lead={lead} /> : motion === "b" ? <TurnB base={S60.turn[0]} lead={lead} /> : motion ? <Turn base={S60.turn[0]} lead={lead} /> : <Act2 base={S60.turn[0]} lead={lead} />}
              </Faded>
            </Sequence>
            {act3 ? (
              <Sequence from={S60.cards[0]} durationInFrames={len(S60.cards)} layout="none">
                <Act3 from={S60.cards[0]} />
              </Sequence>
            ) : (
              <StillsStretch cut="60" from={15} to={41} />
            )}
            <Sequence from={S60.ending[0] - 9} durationInFrames={len(S60.ending) + 9} layout="none">
              <Faded frames={9}>
                <Sequence from={9} layout="none">
                  <Ending {...p} t0={S60.ending[0]} a2 />
                </Sequence>
              </Faded>
            </Sequence>
            {/* Act 4's one Kakak plate ("That one's yours.", 50 px); her end line is the plain line under the name. */}
            <Captions cues={cues.filter((c) => c.id === "L10")} level={voice.level} pulse={voice.pulse} />
          </>
        ) : (
          <>
            <Scene span={S15.hook}><Hook {...p} t0={0} fast /></Scene>
            {act3 ? (
              <Sequence from={S15.cards[0]} durationInFrames={len(S15.cards)} layout="none">
                <Act3Short from={S15.cards[0]} />
              </Sequence>
            ) : (
              <StillsStretch cut="15" from={3} to={10} />
            )}
            <Scene span={S15.ending}><Ending {...p} t0={S15.ending[0]} fast a2 /></Scene>
          </>
        )}
      </Voice.Provider>
      <Grain />
    </AbsoluteFill>
  );
  return check ? <FrameCheck frame={frame} strict={check === "strict"}>{film}</FrameCheck> : film;
};
