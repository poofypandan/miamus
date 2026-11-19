/**
 * The readability check (trailer-reset 11 and 16): no text on screen under 38 px at 1080 width.
 *
 * Wrap a frame in <Readable>. After the fonts load, it measures every visible piece of text in it:
 * - HTML text: computed font size times every CSS scale above it;
 * - SVG <text>: font size times its transform to the frame;
 * - app captures (bitmaps): the smallest text the crop declares (data-raster-text, already scaled).
 * Anything under the floor cancels the render, so `npm run c15` (and any render) fails. The result is logged
 * as one "READABILITY {json}" line for the build script to collect.
 *
 * C1.6 (trailer-reset 20, fix 2): it also fails a frame in which a bubble ([data-bubble]) overlaps a person
 * ([data-person], the boxes the shots mark around the figures' heads and bodies).
 */
import React, { useEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

export const MIN_TEXT_PX = 38;

type Hit = { text: string; px: number };

function cssScale(el: Element | null, stop: Element): number {
  let s = 1;
  for (let e = el; e && e !== stop; e = e.parentElement) {
    const t = getComputedStyle(e).transform;
    if (t && t !== "none") {
      const m = new DOMMatrixReadOnly(t);
      s *= Math.hypot(m.a, m.b);
    }
  }
  return s;
}

function visible(el: Element, stop: Element): boolean {
  let o = 1;
  for (let e: Element | null = el; e && e !== stop; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    o *= Number(cs.opacity);
  }
  if (o < 0.08) return false;
  const r = el.getBoundingClientRect();
  const box = stop.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
}

export function measure(root: HTMLElement): Hit[] {
  const hits: Hit[] = [];
  const zoom = root.getBoundingClientRect().width / root.offsetWidth || 1; // Studio preview scales the frame
  root.querySelectorAll("*").forEach((el) => {
    if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
      if (el instanceof SVGTSpanElement) return;
      const text = (el.textContent ?? "").trim();
      if (!text || !visible(el, root)) return;
      const m = el.getScreenCTM();
      const s = m ? Math.hypot(m.a, m.b) / zoom : 1;
      hits.push({ text, px: parseFloat(getComputedStyle(el).fontSize) * s });
      return;
    }
    const raster = el.getAttribute("data-raster-text");
    if (raster && visible(el, root)) {
      hits.push({ text: `[capture] ${el.getAttribute("data-raster-what")}`, px: Number(raster) * cssScale(el.parentElement, root) });
      return;
    }
    if (!(el instanceof HTMLElement)) return;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
    if (!own || !visible(el, root)) return;
    hits.push({ text: (el.textContent ?? "").trim().slice(0, 60), px: parseFloat(getComputedStyle(el).fontSize) * cssScale(el, root) });
  });
  return hits;
}

type Clash = { bubble: string; person: string; px: number };

/** Every bubble that overlaps a person's box, with the overlap's area in px at 1080 width. */
export function overlaps(root: HTMLElement): Clash[] {
  const zoom = root.getBoundingClientRect().width / root.offsetWidth || 1;
  const box = root.getBoundingClientRect();
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { l: (r.left - box.left) / zoom, t: (r.top - box.top) / zoom, r: (r.right - box.left) / zoom, b: (r.bottom - box.top) / zoom };
  };
  const people = Array.from(root.querySelectorAll("[data-person]")).filter((el) => visible(el, root));
  const out: Clash[] = [];
  root.querySelectorAll("[data-bubble]").forEach((b) => {
    if (!visible(b, root)) return;
    const a = rect(b);
    people.forEach((p) => {
      const q = rect(p);
      const w = Math.min(a.r, q.r) - Math.max(a.l, q.l);
      const h = Math.min(a.b, q.b) - Math.max(a.t, q.t);
      if (w > 0 && h > 0) out.push({ bubble: b.getAttribute("data-bubble") || "bubble", person: p.getAttribute("data-person") || "person", px: Math.round(w * h) });
    });
  });
  return out;
}

export function Readable({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender(`readability ${label}`));
  useEffect(() => {
    let done = false;
    document.fonts.ready.then(() =>
      requestAnimationFrame(() => {
        if (done || !ref.current) return;
        done = true;
        const hits = measure(ref.current);
        const small = hits.filter((h) => h.px < MIN_TEXT_PX - 0.05);
        const smallest = hits.reduce<Hit | null>((a, h) => (!a || h.px < a.px ? h : a), null);
        const clashes = overlaps(ref.current);
        const people = ref.current.querySelectorAll("[data-person]").length;
        console.log("READABILITY " + JSON.stringify({ label, pieces: hits.length, smallest, small, people, clashes }));
        if (small.length) {
          cancelRender(new Error(`Readability check failed in ${label}: ${small.map((h) => `"${h.text}" ${h.px.toFixed(1)} px`).join("; ")} (floor ${MIN_TEXT_PX} px at 1080 width)`));
        } else if (clashes.length) {
          cancelRender(new Error(`Frame check failed in ${label}: ${clashes.map((c) => `${c.bubble} covers ${c.person} (${c.px} px²)`).join("; ")}`));
        } else continueRender(handle);
      })
    );
    return () => {
      done = true;
    };
  }, [handle, label]);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {children}
    </div>
  );
}
