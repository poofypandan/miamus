"use client";

import { useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "framer-motion";

// Same left-to-right order as the swipe gesture in dashboard/layout.tsx —
// used purely to derive a slide direction (forward vs. back), not to drive
// navigation itself.
const TABS = ["/dashboard", "/dashboard/schedules", "/dashboard/health"];

const variants: Variants = {
  initial: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  animate: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 30 } },
  exit: (dir: number) => ({
    x: dir > 0 ? "-100%" : "100%",
    opacity: 0,
    transition: { type: "spring", stiffness: 300, damping: 30 },
  }),
};

export function TabTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const prevPathname = useRef(pathname);
  const direction = useRef(0);

  const prevIndex = TABS.indexOf(prevPathname.current);
  const currentIndex = TABS.indexOf(pathname);
  if (prevIndex !== -1 && currentIndex !== -1 && prevIndex !== currentIndex) {
    direction.current = currentIndex > prevIndex ? 1 : -1;
  }
  prevPathname.current = pathname;

  return (
    <AnimatePresence mode="popLayout" custom={direction.current} initial={false}>
      <motion.div
        key={pathname}
        custom={direction.current}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={1}
        onDragEnd={(e, { offset }) => {
          const swipeThreshold = 50;
          const currentIndex = TABS.indexOf(pathname);
          if (offset.x < -swipeThreshold && currentIndex < TABS.length - 1) {
            router.push(TABS[currentIndex + 1]);
          } else if (offset.x > swipeThreshold && currentIndex > 0) {
            router.push(TABS[currentIndex - 1]);
          }
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
