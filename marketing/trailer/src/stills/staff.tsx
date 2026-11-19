/**
 * C1.5 staff figures: Sari, Yanti, Budi, Joko and Maya, drawn like Mama, from behind, no faces.
 * Ported from the creative director's concept-frame drafts (trailer-reset 15-concept-frames, build.tsx).
 */
import React from "react";
import { shade, type Light } from "../world/tod";

export type Tool = "mop" | "can" | "tray" | "none" | "phone";
export function Staff({ light, top, legs, hair = "#2a1c18", bun = false, hat, tool = "none", phone = false, flip = false, armUp = 0 }: { light: Light; top: string; legs: string; hair?: string; bun?: boolean; hat?: "brim" | "cap"; tool?: Tool; phone?: boolean; flip?: boolean; armUp?: number }) {
  const c = (base: string, own = 0.45) => shade(base, light, 0.03, own);
  const skin = c("#c98f6a", 0.25);
  const limb = { strokeWidth: 10, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const wood = c("#8a6a4c", 0.2);
  return (
    <g transform={flip ? "scale(-1 1)" : undefined}>
      {/* trousers */}
      <path d="M -13 -112 L -13 -9" stroke={c(legs, 0.3)} {...limb} strokeWidth={15} />
      <path d="M 13 -112 L 14 -9" stroke={c(legs, 0.3)} {...limb} strokeWidth={15} />
      <ellipse cx={-15} cy={-4} rx={12} ry={5} fill={c("#6b4a34", 0.2)} />
      <ellipse cx={16} cy={-4} rx={12} ry={5} fill={c("#6b4a34", 0.2)} />
      {/* the tool, behind the hands */}
      {tool === "mop" && (
        <g>
          <path d="M 44 -196 L 86 -8" stroke={wood} strokeWidth={5} strokeLinecap="round" />
          <path d="M 60 -10 L 112 -10 L 116 4 L 56 4 Z" fill={c("#e9e2d6", 0.4)} />
        </g>
      )}
      {/* shirt */}
      <path d="M -25 -212 C -10 -221 10 -221 25 -212 C 24 -180 23 -140 24 -106 Q 0 -99 -24 -106 C -23 -140 -24 -180 -25 -212 Z" fill={c(top, 0.55)} />
      {/* arms */}
      {tool === "mop" ? (
        <>
          <path d="M 23 -206 L 46 -176 L 50 -150" stroke={skin} {...limb} />
          {phone ? <path d="M -23 -206 L -44 -176 L -40 -196" stroke={skin} {...limb} /> : <path d="M -23 -206 L -6 -160 L 58 -118" stroke={skin} {...limb} />}
        </>
      ) : tool === "can" ? (
        <>
          <path d="M 23 -206 L 50 -176 L 78 -160" stroke={skin} {...limb} />
          <path d="M -23 -206 L -33 -170 L -30 -134" stroke={skin} {...limb} />
          <g>
            <path d="M 70 -168 L 106 -168 L 102 -128 L 74 -128 Z" fill={c("#7fa58f", 0.5)} />
            <path d="M 104 -156 L 138 -176" stroke={c("#7fa58f", 0.5)} strokeWidth={6} strokeLinecap="round" />
            <path d="M 72 -168 C 60 -190 96 -196 100 -168" stroke={c("#6b8f7c", 0.5)} strokeWidth={4} fill="none" />
            {[0, 1, 2, 3, 4].map((i) => (
              <circle key={i} cx={144 + i * 7} cy={-166 + i * 15 + (i % 2) * 4} r={2.6} fill="#ffffff" opacity={0.8} />
            ))}
          </g>
        </>
      ) : tool === "tray" ? (
        <>
          <path d="M 23 -206 L 44 -172 L 34 -150" stroke={skin} {...limb} />
          <path d="M -23 -206 L -44 -172 L -34 -150" stroke={skin} {...limb} />
          <ellipse cx={0} cy={-152} rx={50} ry={7} fill={c("#b98b5e", 0.3)} />
        </>
      ) : (
        <>
          <path d={`M 23 -206 L ${41 - armUp * 6} ${-172 - armUp * 40} L ${34 - armUp * 10} ${-134 - armUp * 110}`} stroke={skin} {...limb} />
          <path d="M -23 -206 L -33 -170 L -30 -134" stroke={skin} {...limb} />
        </>
      )}
      {phone && (
        <g transform={tool === "mop" ? "translate(-42 -200) rotate(-6)" : "translate(-30 -134) rotate(6)"}>
          <circle cx={0} cy={-8} r={40} fill="rgba(255,214,170,0.35)" />
          <rect x={-8} y={-22} width={16} height={27} rx={4} fill="#1d2129" />
          <rect x={-6} y={-20} width={12} height={23} rx={2.6} fill="#fff1dc" />
        </g>
      )}
      {/* neck, head */}
      <path d="M -6 -222 L 6 -222 L 6 -210 L -6 -210 Z" fill={skin} />
      <circle cx={0} cy={-241} r={21.5} fill={c(hair, 0)} />
      {bun && <circle cx={0} cy={-222} r={11} fill={c(hair, 0)} />}
      {hat === "brim" && (
        <g>
          <ellipse cx={0} cy={-252} rx={38} ry={8} fill={c("#d9c08a", 0.5)} />
          <path d="M -20 -254 C -18 -276 18 -276 20 -254 Z" fill={c("#d9c08a", 0.5)} />
        </g>
      )}
      {hat === "cap" && <path d="M -22 -246 C -22 -272 22 -272 22 -246 Z" fill={c("#3c4a63", 0.5)} />}
    </g>
  );
}

export function SmallChild({ light }: { light: Light }) {
  const c = (base: string, own = 0.45) => shade(base, light, 0.03, own);
  const skin = c("#d9a27c", 0.25);
  const limb = { strokeWidth: 8, strokeLinecap: "round" as const, fill: "none" };
  return (
    <g>
      <path d="M -10 -48 L -11 -6" stroke={skin} {...limb} strokeWidth={9} />
      <path d="M 10 -48 L 12 -6" stroke={skin} {...limb} strokeWidth={9} />
      <ellipse cx={-13} cy={-3} rx={9} ry={4.6} fill={c("#f6eedd", 0.3)} />
      <ellipse cx={14} cy={-3} rx={9} ry={4.6} fill={c("#f6eedd", 0.3)} />
      <path d="M -15 -106 C -8 -113 8 -113 15 -106 L 31 -44 Q 0 -35 -31 -44 Z" fill={c("#e2685e", 0.5)} />
      {/* a school bag */}
      <rect x={-13} y={-104} width={26} height={34} rx={7} fill={c("#5d7fa3", 0.5)} />
      <path d="M -13 -101 L -27 -83 L -29 -65" stroke={skin} {...limb} />
      <path d="M 13 -101 L 30 -112 L 40 -128" stroke={skin} {...limb} />
      <circle cx={0} cy={-128} r={19} fill={c("#2a1c18", 0)} />
      <path d="M -17 -126 C -31 -122 -33 -104 -25 -97 C -20 -104 -17 -115 -17 -126 Z" fill={c("#2a1c18", 0)} />
      <path d="M 17 -126 C 31 -122 33 -104 25 -97 C 20 -104 17 -115 17 -126 Z" fill={c("#2a1c18", 0)} />
    </g>
  );
}

