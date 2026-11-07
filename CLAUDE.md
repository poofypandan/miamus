@AGENTS.md

# Project Architecture & Master Rules

## Core Stack
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend & Database:** Supabase (PostgreSQL, Storage, RLS)
- **State Management:** React Context (`HouseholdProvider`) with silent background fetching
- **Platform:** Mobile-first Progressive Web App (PWA)

## Language & Role Partitioning
- **Owner Views:** English or Bahasa Indonesia, each owner's choice (Phase 149). Asked once at sign-up, changeable in Access, saved on the account (`user_preferences`, migrations/114) and defaulting to English. Every owner-facing string needs both languages: use `useT()` / `useOwnerLocale()` from `src/context/owner-locale-context.tsx`. Indonesian wording follows `docs/indonesian-glossary.md`. Focuses on configuration, delegation, and high-level audits.
- **Staff Views:** 100% Indonesian. Focuses on low-friction execution, checklist completion, and photo capture.
- **Staff Identity:** Locked to personal device `localStorage` via 4-digit PIN setup. Attribution via `staff_id` across all logged actions.

## UI/UX Standards
- Clean, minimalist mobile aesthetic matching established design tokens (rounded corners, subtle borders, neutral palettes).
- High visual hierarchy: subtle background tints for special/urgent items, neutral for base items.
- Support safe-area insets (`env(safe-area-inset-bottom)`) and pull-to-refresh gestures.
- **Component Reusability:** Never invent new UI patterns for navigation. All sub-navigation toggles must use a single, shared `<SegmentedControl />` component.
- **Aesthetic Continuity:** Navigation Tabs/Segmented Controls must use the `rounded-full` pill aesthetic, matching the primary top navigation. Do not use boxy `rounded-lg` or `rounded-xl` tabs.
- **Button Hierarchy:** Standard Action Buttons (Submit, Save, Add, Copy) must use `rounded-lg` or `rounded-xl` to maintain visual hierarchy and differentiate them from navigation pills.
- **State Persistence:** UI toggle states (active tabs) must always derive their truth from the same state manager as the rendered content (e.g., URL search params or Context) to prevent UI de-syncs on unmount/remount.

## Operational Discipline
- Run `tsc` and `next build` to verify type safety and build integrity after code changes.
- Never introduce breaking database migrations; keep historical foreign keys nullable.
- Never perform hard browser reloads for data updates; rely on silent soft syncs.

## Owner & Public Identity
- Miamus is operated by **Poofy Labs**. The only public contact is **support@poofylabs.dev**.
- Never put a personal email or phone number in user-facing text, config or emails. Public contact details live in `src/config/legal.ts` only.
- Before changing what data Miamus stores, where it is stored, or which services touch it, update the privacy policy (`src/components/legal/privacy-policy.tsx`, both languages).
- Current state, open items and the working agreement (Claude writes, Codex reviews, staging first): `docs/handoff-2026-11-07.md`.
