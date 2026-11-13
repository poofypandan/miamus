import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { World } from "./world/World";
import { lightAt } from "./world/tod";

/** A look at the world at any hour: `npm run stills` (scripts/stills.mjs). Not part of the film. */
export type WorldTestProps = { tod: number; child?: number; mama?: number; dogs?: number; kite?: number; kiteLift?: number; birds?: number; cx?: number; cy?: number; cz?: number; blur?: number; house?: number; laundry?: number; sprinkler?: number };

export const WorldTest: React.FC<WorldTestProps> = ({ tod, child = 1, mama = 0, dogs = 1, kite = 1, kiteLift = 0, birds = 1, cx = 0, cy = 0, cz = 1, blur = 0, house = 1, laundry = 0, sprinkler = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <World light={lightAt(tod)} frame={frame} cam={{ x: cx, y: cy, z: cz }} child={child} mama={mama} dogs={dogs} kite={kite} kiteLift={kiteLift} birds={birds} blur={blur} house={house} laundry={laundry} sprinkler={sprinkler} />
    </AbsoluteFill>
  );
};
