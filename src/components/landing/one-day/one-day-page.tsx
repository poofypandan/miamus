import { Fragment } from "react";
import Link from "next/link";
import {
  CalendarOff,
  ChevronDown,
  ClipboardList,
  CookingPot,
  Film,
  Image as ImageIcon,
  KeyRound,
  Languages,
  MapPinOff,
  PawPrint,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { BRAND_INK, M_POINTS, ROOF_POINTS, TILE_RADIUS } from "@/components/brand/brand-mark";
import { LEGAL } from "@/config/legal";
import type { OwnerLocale } from "@/lib/owner-locale";
import { LandingLanguageSwitch, LocaleLink } from "../landing-links";
import type { LandingFeature, LandingStaffPoint } from "../landing-copy";
import { Garden, KakakMarkD, Kite, KiteString } from "./one-day-art";
import { ONE_DAY_COPY, type Accented, type OneDayCopy } from "./one-day-copy";
import { fontSerif } from "./one-day-fonts";
import { OneDayMotion } from "./one-day-motion";
import { ONE_DAY_FILM, type ONE_DAY_PICTURES, SHOW_FILM_PLATE, pictureSrc } from "./one-day-readiness";
import { RequestAccessButton } from "./request-access-button";
import s from "./one-day.module.css";

/**
 * The "One day" landing page (docs/private/landing, Direction 3, chosen by
 * the owners on 20 Nov 2026): one sky from morning to night, the film's own
 * lines as the beats, the app speaking in bubbles, and the garden at the end.
 *
 * A server component: every word is in the HTML, for link previews, search
 * and a visitor without script. The client parts are small: the EN | ID
 * switch, the reveals, and Request access (whose dialog loads on tap).
 * No images: the art is inline SVG, and the app pictures are placeholders
 * until they are re-captured from the live app after the app look PRs
 * (04-app-visual-direction.md, section 6). No tracking, no third-party script.
 *
 * Shown at /welcome and /selamat-datang when LANDING_ONE_DAY=on, and at the
 * preview routes when it is "preview" (src/lib/landing-flag.ts). "/" stays
 * the sign-in screen and every staff phone's door; this page only links to it.
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

const ICON = { strokeWidth: 1.6, "aria-hidden": true } as const;

/** A line with its one word in Fraunces italic. */
function Line({ text }: { text: Accented }) {
  const [before, word, after] = text;
  return (
    <>
      {before}
      <em className={s.accent}>{word}</em>
      {after}
    </>
  );
}

/** The Miamus mark, inline: the app's own roof-and-M tile (brand-mark.tsx). */
function Mark({ size }: { size: number }) {
  const r = 512 * TILE_RADIUS;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx={r} fill={BRAND_INK} />
      <g fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={ROOF_POINTS} />
        <polyline points={M_POINTS} />
      </g>
    </svg>
  );
}

/**
 * An app picture: the capture once it exists (ONE_DAY_PICTURES), otherwise a
 * placeholder sized like the real crop, so nothing moves when the capture
 * replaces it, and plainly marked. next.config.ts refuses to switch the page
 * on while any of these is still a placeholder.
 */
function Picture({
  name,
  width,
  height,
  text,
  t,
  locale,
}: {
  name: keyof typeof ONE_DAY_PICTURES;
  width: number;
  height: number;
  text: string;
  t: OneDayCopy;
  locale: OwnerLocale;
}) {
  const src = pictureSrc(name, locale);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a fixed-size capture below the fold; next/image would add a loader for nothing
      <img src={src} alt={text} width={width} height={height} loading="lazy" decoding="async" className={s.capture} />
    );
  }
  const ratio = `${width} / ${height}`;
  return (
    <div className={s.picture} style={{ aspectRatio: ratio }} data-placeholder="app-picture">
      <span className={s.pictureLabel}>
        <ImageIcon {...ICON} className="size-3.5" />
        {t.pictures.label}
      </span>
      <span className={s.pictureText}>{text}</span>
      <span className={s.pictureNote}>{t.pictures.note}</span>
    </div>
  );
}

function Who({ label }: { label: string }) {
  return (
    <span className={s.who}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function OneDayPage({
  locale,
  hrefs,
}: {
  locale: OwnerLocale;
  /** The two language versions of this page (the live routes, or the previews). */
  hrefs: Record<OwnerLocale, string>;
}) {
  const t = ONE_DAY_COPY[locale];
  const words = t.sayOnce.sentence.split(" ");

  return (
    // data-wide-page: the root layout's phone frame lets go of its width here,
    // as for today's landing page, so a laptop gets the whole sky.
    <div className={`${s.page} ${fontSerif.variable}`} lang={locale} data-wide-page>
      <header className={s.top}>
        <div className={s.wrap}>
          <Link href={hrefs[locale]} className={s.brand}>
            <Mark size={28} />
            Miamus
          </Link>
          <LandingLanguageSwitch locale={locale} hrefs={hrefs} className="bg-[rgb(31_26_23/0.1)]" />
          <LocaleLink locale={locale} href="/" className={s.topLink}>
            {t.signIn}
          </LocaleLink>
        </div>
      </header>

      <main className="relative">
        <Kite />
        <KiteString />

        {/* Morning */}
        <section className={`${s.sky} ${s.s1}`}>
          <div className={s.wrap}>
            <p className={s.eyebrow}>{t.eyebrow}</p>
            <h1 className={s.h1}>
              <Line text={t.hero.headline} />
            </h1>
            <p className={s.lede}>{t.hero.subline}</p>
            <div className={s.acts}>
              <RequestAccessButton
                locale={locale}
                label={t.requestAccess}
                className={`${s.btn} ${s.btnInk}`}
                dialog={t.dialog}
                privacyHref={t.privacyHref}
              />
              <LocaleLink locale={locale} href="/" className={s.link}>
                {t.haveAccount}
              </LocaleLink>
            </div>
            <p className={s.free}>{t.free}</p>
          </div>
        </section>

        {/* Say it once */}
        <section className={`${s.sky} ${s.s2}`}>
          <div className={`${s.wrap} ${s.beat}`}>
            <div data-reveal>
              <h2 className={s.skyH}>
                <Line text={t.sayOnce.heading} />
              </h2>
              <p className={s.body}>{t.sayOnce.body}</p>
              <p className={s.note}>{t.sayOnce.kakakNote}</p>
            </div>
            <div className={s.talk} data-reveal>
              <div className={s.say}>
                <p className={s.sentence}>
                  {/* The space sits between the words, not inside them: an
                      inline-block drops its own trailing space. */}
                  {words.map((word, i) => (
                    <Fragment key={i}>
                      <span className={s.word} style={{ ["--wd" as string]: `${i * 0.17}s` }}>
                        {word}
                      </span>
                      {i < words.length - 1 ? " " : null}
                    </Fragment>
                  ))}
                </p>
              </div>
              <Who label={t.sayOnce.tag} />
              <div className={s.app} style={{ ["--d" as string]: `${0.6 + words.length * 0.17}s` }}>
                <Picture name="card" width={720} height={452} text={t.pictures.card} t={t} locale={locale} />
              </div>
            </div>
          </div>
        </section>

        {/* It reaches the right person */}
        <section className={`${s.sky} ${s.s3}`}>
          <div className={`${s.wrap} ${s.beat}`}>
            <div data-reveal>
              <h2 className={s.skyH}>
                <Line text={t.reaches.heading} />
              </h2>
              <p className={s.body}>{t.reaches.body}</p>
            </div>
            <div className={s.talk} data-reveal>
              <div className={s.app}>
                <Picture name="staff" width={720} height={540} text={t.pictures.staff} t={t} locale={locale} />
              </div>
              <Who label={t.reaches.tag} />
            </div>
          </div>
        </section>

        {/* You see it's done, and Kakak's line */}
        <section className={`${s.sky} ${s.s4}`}>
          <div className={`${s.wrap} ${s.beat} ${s.b3}`}>
            <div className={s.areaT} data-reveal>
              <h2 className={s.skyH}>
                <Line text={t.keeps.heading} />
              </h2>
              <p className={s.body}>{t.keeps.body}</p>
            </div>
            <div className={`${s.talk} ${s.areaV}`} data-reveal>
              <div className={s.app}>
                <Picture name="status" width={716} height={148} text={t.pictures.status} t={t} locale={locale} />
              </div>
              <Who label={t.keeps.tag} />
            </div>
            <figure className={s.areaQ} data-reveal>
              <blockquote className={s.plate}>
                <KakakMarkD size={36} label={t.kakakMarkLabel} />
                <span>{t.keeps.quote}</span>
              </blockquote>
              <figcaption className={s.by}>{t.keeps.quoteBy}</figcaption>
            </figure>
          </div>
        </section>

        {/* The facts, on paper */}
        <section className={`${s.sky} ${s.s5}`}>
          <div className={s.wrap}>
            <div className={s.paper} data-reveal>
              <div className={s.paperGrid}>
                <div>
                  <h2 className={s.paperH}>{t.features.heading}</h2>
                  <ul className={s.rows}>
                    {t.features.items.map((item) => {
                      const Icon = FEATURE_ICONS[item.id];
                      return (
                        <li key={item.id}>
                          <Icon {...ICON} className={s.ico} />
                          <div>
                            <h3>{item.title}</h3>
                            <p>{item.body}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <h2 className={s.paperH}>{t.staff.heading}</h2>
                  <ul className={s.points}>
                    {t.staff.points.map((point) => {
                      const Icon = STAFF_ICONS[point.id];
                      return (
                        <li key={point.id}>
                          <Icon {...ICON} className={s.ico} />
                          <span>{point.text}</span>
                        </li>
                      );
                    })}
                    <li>
                      <ShieldCheck {...ICON} className={s.ico} />
                      <span>{t.dataPoint}</span>
                    </li>
                  </ul>
                  <Link href={t.privacyHref} className={`${s.link} mt-3`}>
                    {t.dataLink}
                  </Link>
                </div>
              </div>
              <h2 className={`${s.paperH} ${s.faqH}`}>{t.faq.heading}</h2>
              <div className={s.faq}>
                {t.faq.items.map((item) => (
                  <details key={item.q}>
                    <summary>
                      {item.q}
                      <ChevronDown {...ICON} className={`${s.chev} size-5`} />
                    </summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Dusk: the film */}
        <section className={`${s.sky} ${s.s6}`}>
          <div className={s.wrap}>
            <h2 className={s.skyH} data-reveal>
              <Line text={t.film.heading} />
            </h2>
            {/* Until the film exists, the dusk line stands alone: an empty
                frame is the one thing that would look unfinished. The plate is
                the owners' call (SHOW_FILM_PLATE). */}
            {ONE_DAY_FILM ? (
              <video
                className={s.film}
                src={ONE_DAY_FILM.src}
                poster={ONE_DAY_FILM.poster}
                controls
                playsInline
                preload="none"
                data-reveal
              />
            ) : SHOW_FILM_PLATE ? (
              <>
                <div className={s.frame} role="img" aria-label={t.film.soon} data-reveal data-placeholder="film">
                  <span className={s.soon}>
                    <Film {...ICON} className="size-5" />
                    <span>{t.film.soon}</span>
                  </span>
                </div>
                <p className={s.body} data-reveal>
                  {t.film.body}
                </p>
              </>
            ) : null}
          </div>
        </section>

        {/* Night: the request, and the garden */}
        <section className={`${s.sky} ${s.s7}`} id="request">
          <div className={s.wrap}>
            <p className={s.eyebrow} data-reveal>
              {t.eyebrow}
            </p>
            <h2 className={s.reqH} data-reveal>
              {t.request.heading}
            </h2>
            <p className={s.body} data-reveal>
              {t.request.body}
            </p>
            <div className={s.acts} data-reveal>
              <RequestAccessButton
                locale={locale}
                label={t.requestAccess}
                className={`${s.btn} ${s.btnCream}`}
                dialog={t.dialog}
                privacyHref={t.privacyHref}
              />
              <LocaleLink locale={locale} href="/" className={s.link}>
                {t.haveAccount}
              </LocaleLink>
              <Link href="/join/code" className={`${s.link} font-medium`}>
                <UserRound {...ICON} className="size-5" />
                <span>
                  {t.staffPrompt} <strong lang="id">Saya staf</strong>
                </span>
              </Link>
            </div>
            <p className={s.free} data-reveal>
              {t.free}
            </p>
          </div>
          <Garden />
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.wrap}>
          {/* "Miamus, by Poofy Labs" as words: no Poofy Labs mark, and never a
              link to poofylabs.dev (02-brand-architecture.md, section 3). */}
          <span className={s.footerBy}>
            <Mark size={22} />
            <span>{t.footer.by}</span>
          </span>
          <span>{t.footer.line}</span>
          <span className={s.footerLinks}>
            <Link href={t.privacyHref}>{t.footer.privacy}</Link>
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          </span>
        </div>
      </footer>

      <OneDayMotion />
    </div>
  );
}
