import s from "./one-day.module.css";

/**
 * The drawn parts of the "One day" page: the kite, its string, and the garden
 * at dusk. Inline SVG, server-rendered: no image to load, nothing to wait for.
 * The drawing follows prototype 3; the concept notes that a later pass should
 * use the film's own art once it is locked (01-concept.md, Direction 3).
 *
 * Everything here is decoration (aria-hidden). Its motion is CSS, and stops
 * under prefers-reduced-motion.
 */

export function Kite() {
  return (
    <svg className={s.kite} viewBox="0 0 40 52" aria-hidden="true">
      <path d="M20 0 38 22 20 52 2 22Z" fill="#b65f55" />
      <path
        d="M20 0v52M2 22h36"
        stroke="#e7b2a8"
        strokeWidth="1"
        opacity=".6"
        fill="none"
      />
    </svg>
  );
}

/** One line from the first screen to the garden, ink by day, cream by night. */
export function KiteString() {
  return (
    <svg
      className={s.string}
      viewBox="0 0 100 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="one-day-string"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2="1000"
        >
          <stop offset="0" stopColor="#1f1a17" stopOpacity=".45" />
          <stop offset=".7" stopColor="#1f1a17" stopOpacity=".3" />
          <stop offset=".8" stopColor="#fff6e8" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff6e8" stopOpacity=".5" />
        </linearGradient>
      </defs>
      <path
        d="M72 0C52 110 96 220 74 360S40 600 66 740s22 180-14 260"
        stroke="url(#one-day-string)"
      />
    </svg>
  );
}

const FLIES: [number, number, number][] = [
  [560, 330, 2.6],
  [640, 376, 2.2],
  [760, 388, 2.6],
  [330, 344, 2.4],
  [1090, 392, 2.2],
  [880, 398, 2],
];

/** The garden at evening: the hills, the palm, the house with its window lit. */
export function Garden() {
  return (
    <svg
      className={s.garden}
      viewBox="0 0 1200 420"
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="one-day-spill" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#f6c66e" stopOpacity=".34" />
          <stop offset="1" stopColor="#f6c66e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="one-day-lawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3833" />
          <stop offset="1" stopColor="#1c2725" />
        </linearGradient>
      </defs>
      <path d="M-60 420 300 176q34-22 70 0l300 196 80 48Z" fill="#3f3769" />
      <path d="M180 420 520 262q26-12 52 2l258 156Z" fill="#352e5c" />
      <ellipse cx="610" cy="352" rx="120" ry="52" fill="#26303a" />
      <ellipse cx="300" cy="372" rx="170" ry="48" fill="#26303a" />
      {/* The palm; hidden on phones, where the edge cuts it to a stray curl */}
      <g className={s.palm}>
        <path
          d="M452 372c8-70 4-128 22-196"
          fill="none"
          stroke="#2a2437"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <g
          className={s.fronds}
          fill="none"
          stroke="#1f2636"
          strokeWidth="13"
          strokeLinecap="round"
        >
          <path d="M474 178c-40-34-92-34-128-6" />
          <path d="M474 178c-18-52-66-78-112-72" />
          <path d="M474 178c4-56 44-88 90-88" />
          <path d="M474 178c34-40 86-46 124-22" />
          <path d="M474 178c44-10 82 10 100 44" />
          <path d="M474 178c-46-6-84 18-98 54" />
        </g>
      </g>
      {/* The house */}
      <rect x="716" y="204" width="484" height="140" fill="#4b4263" />
      <path d="M648 204 784 122h416v82Z" fill="#7c3f39" />
      <rect x="648" y="200" width="552" height="13" fill="#5d2f2c" />
      <rect x="812" y="234" width="300" height="110" rx="3" fill="#27213c" />
      <g className={s.glow}>
        <rect x="822" y="244" width="136" height="100" fill="#f6c66e" />
        <rect x="966" y="244" width="136" height="100" fill="#f6c66e" />
      </g>
      <rect x="668" y="344" width="532" height="12" fill="#393150" />
      {/* Bougainvillea on its post */}
      <rect x="690" y="262" width="8" height="84" fill="#27213c" />
      <g fill="#a8456a">
        <circle cx="684" cy="262" r="15" />
        <circle cx="704" cy="250" r="17" />
        <circle cx="724" cy="262" r="13" />
        <circle cx="700" cy="276" r="12" />
        <circle cx="668" cy="276" r="10" />
        <circle cx="742" cy="250" r="10" />
      </g>
      <path d="M0 356q600-24 1200-4v68H0Z" fill="url(#one-day-lawn)" />
      <ellipse cx="962" cy="362" rx="250" ry="40" fill="url(#one-day-spill)" />
      <g fill="#f6d58a">
        {FLIES.map(([cx, cy, r], i) => (
          <circle
            key={i}
            className={s.fly}
            cx={cx}
            cy={cy}
            r={r}
            style={{ animationDelay: `${-i * 1.1}s` }}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * Kakak's mark D, the light seal (docs/private/landing/kakak-mark-d/, chosen
 * by the owners on 20 Nov 2026): the Miamus roof and a full heart in her
 * terracotta on a warm-white disc. Drawn from the master's numbers, not
 * redrawn. On her dark plate it takes no shadow (README, "The shadow").
 */
export function KakakMarkD({
  size = 36,
  label,
}: {
  size?: number;
  label: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={label}
    >
      <circle cx="256" cy="256" r="256" fill="#fffdf8" />
      <g transform="translate(0 8)">
        <polyline
          points="112,214 256,104 400,214"
          fill="none"
          stroke="#b65f55"
          strokeWidth="40"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          fill="#b65f55"
          d="M256 258C242.1 226 218.9 206 193.4 206C160.9 206 140 232 140 268C140 318 195.7 358 239.8 396Q256 410 272.2 396C316.3 358 372 318 372 268C372 232 351.1 206 318.6 206C293.1 206 269.9 226 256 258Z"
        />
      </g>
    </svg>
  );
}
