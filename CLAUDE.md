@AGENTS.md

# Project Architecture & Master Rules

## Core Stack
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend & Database:** Supabase (PostgreSQL, Storage, RLS)
- **State Management:** React Context (`HouseholdProvider`) with silent background fetching
- **Platform:** Mobile-first Progressive Web App (PWA)

## Language & Role Partitioning
- **Owner Views:** 100% English. Focuses on configuration, delegation, and high-level audits.
- **Staff Views:** 100% Indonesian. Focuses on low-friction execution, checklist completion, and photo capture.
- **Staff Identity:** Locked to personal device `localStorage` via 4-digit PIN setup. Attribution via `staff_id` across all logged actions.

## UI/UX Standards
- Clean, minimalist mobile aesthetic matching established design tokens (rounded corners, subtle borders, neutral palettes).
- High visual hierarchy: subtle background tints for special/urgent items, neutral for base items.
- Support safe-area insets (`env(safe-area-inset-bottom)`) and pull-to-refresh gestures.
- **Component Reusability:** Never invent new UI patterns for navigation. All sub-navigation toggles must use a single, shared `<SegmentedControl />` component.
- **Aesthetic Continuity:** All buttons and navigation pills must follow the `rounded-full` circular pill aesthetic to match the primary top navigation. Do not use boxy `rounded-lg` or `rounded-xl` tabs.
- **State Persistence:** UI toggle states (active tabs) must always derive their truth from the same state manager as the rendered content (e.g., URL search params or Context) to prevent UI de-syncs on unmount/remount.

## Operational Discipline
- Run `tsc` and `next build` to verify type safety and build integrity after code changes.
- Never introduce breaking database migrations; keep historical foreign keys nullable.
- Never perform hard browser reloads for data updates; rely on silent soft syncs.
