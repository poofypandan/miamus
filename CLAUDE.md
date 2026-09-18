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

## Operational Discipline
- Run `tsc` and `next build` to verify type safety and build integrity after code changes.
- Never introduce breaking database migrations; keep historical foreign keys nullable.
- Never perform hard browser reloads for data updates; rely on silent soft syncs.
