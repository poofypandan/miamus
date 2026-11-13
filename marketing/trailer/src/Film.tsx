import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { COPY, type Locale } from "./film/copy";
import { Day, Ending, Hook, Know, MeetKakak, Quiet, Sari, Tell, Turn, Voice } from "./film/scenes";
import { FPS, S15, S60, type Span, len } from "./film/timeline";
import voData from "./film/vo-data.json";
import { loadFonts } from "./theme";
import { Captions } from "./ui/kakak";
import { Grain } from "./ui/kit";

loadFonts();

export type FilmProps = {
  locale: Locale;
  cut: "60" | "15";
  /** The finished sound for this cut, under public/ (audio/mix.py writes it), or null for a silent render. */
  audio: string | null;
};

/** Lines that are already on screen in large type: the dawn question, the end card. */
const SHOWN_LARGE = ["L2", "L11", "S3"];

type VoCut = { cues: { id: string; from: number; to: number }[]; env: number[] };

function Scene({ span, children }: { span: Span; children: React.ReactNode }) {
  return (
    <Sequence from={span[0]} durationInFrames={len(span)} layout="none">
      {children}
    </Sequence>
  );
}

/**
 * The film. One day at home, told in the order it happens; the scenes are in
 * film/scenes.tsx, the words in film/copy.ts, every timing in
 * film/timeline.ts, and Kakak's voice timings in film/vo-data.json.
 */
export const Film: React.FC<FilmProps> = ({ locale, cut, audio }) => {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const vo = (voData as Record<string, VoCut>)[`${cut}-${locale}`];
  const cues = vo.cues.map((c) => ({ from: Math.round(c.from * FPS), to: Math.round(c.to * FPS), text: copy.lines[c.id], id: c.id }));
  const voice = {
    level: vo.env[frame] ?? 0,
    cue: (id: string) => cues.find((c) => c.id === id) ?? null,
  };
  const p = { locale };
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      {audio && <Audio src={staticFile(audio)} />}
      <Voice.Provider value={voice}>
        {cut === "60" ? (
          <>
            <Scene span={S60.hook}><Hook {...p} t0={S60.hook[0]} /></Scene>
            <Scene span={S60.turn}><Turn {...p} t0={S60.turn[0]} /></Scene>
            <Scene span={S60.kakak}><MeetKakak {...p} t0={S60.kakak[0]} /></Scene>
            <Scene span={S60.tell}><Tell {...p} t0={S60.tell[0]} /></Scene>
            <Scene span={S60.know}><Know {...p} t0={S60.know[0]} /></Scene>
            <Scene span={S60.sari}><Sari {...p} t0={S60.sari[0]} /></Scene>
            <Scene span={S60.day}><Day {...p} t0={S60.day[0]} /></Scene>
            <Scene span={S60.quiet}><Quiet {...p} t0={S60.quiet[0]} /></Scene>
            <Scene span={S60.ending}><Ending {...p} t0={S60.ending[0]} /></Scene>
          </>
        ) : (
          <>
            <Scene span={S15.hook}><Hook {...p} t0={0} fast /></Scene>
            <Scene span={S15.tell}><Tell {...p} t0={S15.tell[0]} fast /></Scene>
            <Scene span={S15.sari}><Sari {...p} t0={S15.sari[0]} fast /></Scene>
            <Scene span={S15.ending}><Ending {...p} t0={S15.ending[0]} fast /></Scene>
          </>
        )}
      </Voice.Provider>
      <Captions cues={cues.filter((c) => !SHOWN_LARGE.includes(c.id))} level={voice.level} />
      <Grain />
    </AbsoluteFill>
  );
};
