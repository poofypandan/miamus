/** The frame, and the camera that moves through the world's layers (parallax). */
export const W = 1080;
export const H = 1920;

export interface Cam {
  /** How far the camera has moved, in px of the nearest layer (x right, y down). */
  x: number;
  y: number;
  /** Zoom: 1 is the untouched frame. */
  z: number;
}

export const STILL: Cam = { x: 0, y: 0, z: 1 };

/** A layer's size under this camera: far layers (small `p`) grow less when it pushes in. */
export const layerScale = (cam: Cam, p: number) => 1 + (cam.z - 1) * (0.25 + 0.75 * Math.min(1, p));

/** The SVG transform for a layer at depth `p` (0 the sky, 1 the garden, above 1 the grass at our feet). */
export const layer = (cam: Cam, p: number) => {
  const s = layerScale(cam, p);
  const tx = W / 2 - (W / 2 + cam.x * p) * s;
  const ty = H / 2 - (H / 2 + cam.y * p) * s;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`;
};

/** Where a point of a layer lands on the frame. */
export const project = (cam: Cam, p: number, x: number, y: number) => {
  const s = layerScale(cam, p);
  return { x: W / 2 + (x - W / 2 - cam.x * p) * s, y: H / 2 + (y - H / 2 - cam.y * p) * s, s };
};

/** Blend two cameras. */
export const camMix = (a: Cam, b: Cam, t: number): Cam => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
