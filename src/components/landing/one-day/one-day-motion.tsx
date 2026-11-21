"use client";

import { useEffect } from "react";

/**
 * The page's one bit of motion script: things below the fold arrive as you
 * reach them. Renders nothing.
 *
 * The server hides nothing. On mount, each [data-reveal] element that is
 * still below the fold is marked data-armed (the CSS then holds it back), and
 * gets data-in when it scrolls into view. So a visitor without script, a
 * search engine, or anyone with reduced motion sees the whole page at once,
 * and nothing already on screen flickers.
 */
export function OneDayMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92
    );
    if (targets.length === 0) return;
    for (const el of targets) el.setAttribute("data-armed", "");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-in", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return null;
}
