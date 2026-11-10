import Image from "next/image";
import Link from "next/link";
import {
  CalendarOff,
  ChevronDown,
  ClipboardList,
  CookingPot,
  Download,
  KeyRound,
  Languages,
  MapPinOff,
  PawPrint,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { LEGAL } from "@/config/legal";
import type { OwnerLocale } from "@/lib/owner-locale";
import { LandingGoogleButton, LandingLanguageSwitch, LocaleLink } from "./landing-actions";
import {
  LANDING_COPY,
  LANDING_HREF,
  type LandingDataPoint,
  type LandingFeature,
  type LandingShot,
  type LandingStaffPoint,
} from "./landing-copy";

/**
 * The public landing page (docs/landing-page-proposal.md, approved
 * 2026-11-09), served at /welcome and /selamat-datang. A server component:
 * the words are in the HTML, so a link shared on WhatsApp previews properly
 * and search can read it. "/" stays the sign-in screen and every staff
 * phone's door; this page only links to it.
 *
 * Icons are the app's own Lucide set, the same as the tab bar; never emoji
 * (AGENTS.md, Design).
 */

const FEATURE_ICONS: Record<LandingFeature, LucideIcon> = {
  pets: PawPrint,
  chores: ClipboardList,
  kitchen: CookingPot,
  repairs: Wrench,
};

const STAFF_ICONS: Record<LandingStaffPoint, LucideIcon> = {
  language: Languages,
  pin: KeyRound,
  leave: CalendarOff,
  location: MapPinOff,
};

const DATA_ICONS: Record<LandingDataPoint, LucideIcon> = {
  ads: ShieldCheck,
  download: Download,
};

/**
 * Real app screens with made-up data (Sari, Budi, Mochi, Bruno), captured
 * from mock mode by scripts/capture-landing-shots.ts. Staff screens are
 * Indonesian on both pages, so they're one file.
 */
function shotSrc(shot: LandingShot, locale: OwnerLocale): string {
  return shot === "staff-today" ? "/landing/staff-today.webp" : `/landing/${locale}-${shot}.webp`;
}

// The captures are 390 × 700 CSS px at 2×.
const SHOT_WIDTH = 780;
const SHOT_HEIGHT = 1400;

/**
 * Phones get the single column this page was designed as; every wider rule
 * below is behind md: (a tablet, a wider centred column) or lg: (a laptop,
 * two columns and rows). The content is capped at WIDE, with the gutters
 * growing around it.
 */
const WIDE = "mx-auto w-full md:max-w-2xl lg:max-w-[1160px]";

export function LandingPage({ locale }: { locale: OwnerLocale }) {
  const t = LANDING_COPY[locale];

  return (
    <main lang={locale} data-wide-page className="flex flex-col bg-white pb-[env(safe-area-inset-bottom)] text-gray-900">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 px-5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 backdrop-blur md:px-10 lg:px-12">
        <div className={`flex items-center gap-3 ${WIDE}`}>
          <Link href={LANDING_HREF[locale]} className="flex flex-1 items-center gap-2">
            <BrandMark size={26} rounded />
            <span className="text-[17px] font-semibold tracking-tight">Miamus</span>
          </Link>
          <LandingLanguageSwitch locale={locale} />
          <LocaleLink
            locale={locale}
            href="/"
            className="flex min-h-[44px] items-center px-1 text-sm font-semibold text-gray-900"
          >
            {t.signIn}
          </LocaleLink>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-10 pb-12 md:px-10 md:pt-16 md:pb-20 lg:px-12 lg:pt-20 lg:pb-28">
        <div
          data-landing-hero
          className={`flex flex-col items-center text-center lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:text-left ${WIDE}`}
        >
          <div className="flex w-full flex-col items-center md:max-w-lg lg:max-w-none lg:items-start">
            <div className="rounded-[14px] shadow-[0_12px_28px_-10px_rgba(17,24,39,0.5)]">
              <BrandMark size={60} rounded />
            </div>
            <h1 className="mt-7 text-[28px] leading-[1.15] font-semibold tracking-tight text-balance md:text-[40px] md:leading-[1.1] lg:mt-8 lg:text-[52px] lg:leading-[1.05]">
              {t.hero.headline}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-gray-700 text-pretty md:text-lg lg:mt-6 lg:max-w-xl">{t.hero.subline}</p>
            <p className="mt-2 text-sm text-muted-foreground md:text-[15px]">{t.hero.brandLine}</p>

            <div className="mt-8 flex w-full flex-col gap-3 md:max-w-sm lg:mt-10">
              <LandingGoogleButton locale={locale} label={t.hero.requestAccess} failedText={t.request.failed} />
              <LocaleLink
                locale={locale}
                href="/"
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-gray-200 text-base font-medium text-gray-900 active:bg-gray-50"
              >
                {t.hero.haveAccount}
              </LocaleLink>
            </div>
            <Link
              href="/join/code"
              className="mt-4 flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground"
            >
              <UserRound className="size-4" strokeWidth={1.75} aria-hidden />
              {t.hero.staffPrompt} <span lang="id" className="font-semibold text-gray-900">Saya staf</span>
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">{t.hero.betaNote}</p>
          </div>

          {/* The screens. A laptop also gets the staff phone, tucked behind:
              it is display:none below lg and lazy, so phones never fetch it. */}
          <div className="relative mt-10 flex w-[78%] justify-center md:w-[320px] lg:mt-0 lg:w-full lg:justify-end lg:pr-6">
            <PhoneShot
              src={shotSrc("staff-today", locale)}
              alt={t.how.steps.find((step) => step.shot === "staff-today")?.shotAlt ?? ""}
              className="absolute top-12 right-[46%] hidden w-[240px] -rotate-6 opacity-95 lg:block xl:w-[260px]"
            />
            <PhoneShot
              src={shotSrc("owner-today", locale)}
              alt={t.hero.shotAlt}
              className="relative w-full lg:w-[300px] xl:w-[320px]"
              priority
            />
          </div>
        </div>
      </section>

      {/* How it works: owner asks, staff do it, owner sees it */}
      <Section heading={t.how.heading}>
        <ol className="flex flex-col gap-10 lg:grid lg:grid-cols-3 lg:gap-12">
          {t.how.steps.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-4 lg:flex lg:flex-col lg:gap-4">
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-full border border-gray-300 text-sm font-semibold tabular-nums"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-[17px] font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-gray-700">{step.body}</p>
              </div>
              <PhoneShot
                src={shotSrc(step.shot, locale)}
                alt={step.shotAlt}
                className="col-start-2 w-[85%] md:max-w-[300px] lg:mt-auto lg:w-full lg:max-w-[280px]"
              />
            </li>
          ))}
        </ol>
      </Section>

      {/* What it looks after */}
      <Section heading={t.features.heading}>
        <ul className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {t.features.items.map((item) => (
            <li key={item.id} className="flex gap-4 rounded-2xl border border-gray-200 p-4 lg:flex-col lg:p-6">
              <IconTile icon={FEATURE_ICONS[item.id]} />
              <div>
                <h3 className="text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-gray-700">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Made for the people who do the work */}
      <Section heading={t.staff.heading} tinted>
        <IconList
          points={t.staff.points.map((point) => ({ icon: STAFF_ICONS[point.id], text: point.text }))}
          className="md:grid md:grid-cols-2 md:gap-x-10 md:gap-y-6 lg:grid-cols-4"
        />
      </Section>

      {/* Your household's data */}
      <Section heading={t.data.heading}>
        <IconList
          points={t.data.points.map((point) => ({ icon: DATA_ICONS[point.id], text: point.text }))}
          className="md:grid md:grid-cols-2 md:gap-x-10 lg:max-w-4xl lg:gap-x-16"
        />
        <Link href={t.privacyHref} className="mt-5 inline-flex min-h-[44px] items-center text-[15px] font-semibold underline underline-offset-4">
          {t.data.policy}
        </Link>
      </Section>

      {/* Questions */}
      <Section heading={t.faq.heading}>
        <div className="divide-y divide-gray-200 border-y border-gray-200 lg:max-w-3xl">
          {t.faq.items.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </summary>
              <p className="pb-4 text-[15px] leading-relaxed text-gray-700">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Request access */}
      <section className="flex flex-col items-center border-t border-gray-100 px-6 py-12 text-center md:px-10 md:py-16 lg:py-24">
        <div className="flex w-full flex-col items-center md:max-w-md">
          <h2 className="text-[22px] font-semibold tracking-tight lg:text-[32px]">{t.request.heading}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-700">{t.request.body}</p>
          <div className="mt-7 w-full">
            <LandingGoogleButton locale={locale} label={t.request.google} failedText={t.request.failed} google />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {t.request.consent}
            <Link href={t.privacyHref} className="font-medium text-gray-900 underline underline-offset-4">
              {t.request.privacy}
            </Link>
            .
          </p>
          <p className="mt-3 text-xs text-muted-foreground">{t.request.noGoogle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.request.joining}</p>
        </div>
      </section>

      <footer className="flex flex-col items-center gap-1.5 border-t border-gray-100 px-6 pt-6 pb-10 text-xs text-muted-foreground">
        <span>{t.footer.madeBy}</span>
        <span>
          <Link href={t.privacyHref} className="underline underline-offset-4">
            {t.footer.privacy}
          </Link>
          {" · "}
          <a href={`mailto:${LEGAL.contactEmail}`} className="underline underline-offset-4">
            {LEGAL.contactEmail}
          </a>
        </span>
      </footer>
    </main>
  );
}

function Section({ heading, tinted = false, children }: { heading: string; tinted?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`px-6 py-12 md:px-10 md:py-16 lg:px-12 lg:py-24 ${tinted ? "bg-slate-50" : "border-t border-gray-100"}`}
    >
      <div className={WIDE}>
        <h2 className="mb-6 text-[22px] leading-tight font-semibold tracking-tight text-balance md:text-[26px] lg:mb-12 lg:max-w-2xl lg:text-[34px]">
          {heading}
        </h2>
        {children}
      </div>
    </section>
  );
}

/** An icon in a soft white tile with a hairline border. */
function IconTile({ icon: Icon, small = false }: { icon: LucideIcon; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        small
          ? "flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(17,24,39,0.05)]"
          : "flex size-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 text-zinc-900 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(17,24,39,0.06)]"
      }
    >
      <Icon className={small ? "size-[18px]" : "size-5"} strokeWidth={1.6} />
    </span>
  );
}

function IconList({ points, className }: { points: { icon: LucideIcon; text: string }[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-4 ${className ?? ""}`}>
      {points.map((point) => (
        <li key={point.text} className="flex items-start gap-3.5">
          <IconTile icon={point.icon} small />
          <span className="pt-1.5 text-[15px] leading-relaxed text-gray-700">{point.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PhoneShot({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[28px] border border-gray-200 bg-slate-50 shadow-[0_20px_40px_-20px_rgba(17,24,39,0.35)] ${className ?? ""}`}
    >
      <Image
        src={src}
        alt={alt}
        width={SHOT_WIDTH}
        height={SHOT_HEIGHT}
        // Already sized and compressed WebP: no optimisation pass needed.
        unoptimized
        priority={priority}
        className="block h-auto w-full"
      />
    </div>
  );
}
