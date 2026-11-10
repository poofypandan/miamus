"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, MessageSquareText } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { LEGAL } from "@/config/legal";
import { FeedbackSheet } from "@/components/shared/feedback-sheet";
import { useOwnerLocale } from "@/context/owner-locale-context";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * "About Miamus" — the last page of the Household tab (owner request,
 * 2026-11-08): where Miamus came from and what it is for. Owners only, in the
 * owner's language. Short on purpose: a mark, the promise, three paragraphs,
 * and (in Bahasa Indonesia) the proverb the app is built around.
 *
 * Copy lives here as whole paragraphs per language rather than through t(),
 * because the two versions are written, not translated line by line.
 */
const COPY = {
  en: {
    title: "About Miamus",
    promise: "A little less on your mind.",
    story: [
      "Miamus started at home, with our dogs. My wife and I kept asking each other the same small questions: have the dogs been out yet? Has anyone fed them? So we began writing it down in one place.",
      "Soon it wasn't only the dogs. The chores, the kitchen, and everyone who helps us run the house found their way in too. Miamus grew into the way our household looks after itself — together.",
      "We made it for homes like ours: everyone can see what's done and what's next, so no one has to carry it all in their head.",
    ],
    proverb: null,
    madeBy: `Made with care by ${LEGAL.operatorName}.`,
    privacy: "Privacy Policy",
    privacyHref: "/privacy",
    feedback: "Send feedback",
    feedbackDetail: "Ideas, problems, anything: straight to us.",
  },
  id: {
    title: "Tentang Miamus",
    promise: "Biar pikiran sedikit lebih ringan.",
    story: [
      "Miamus berawal dari rumah kami sendiri, dari anjing-anjing kami. Saya dan istri sering saling bertanya hal kecil yang sama: anjing sudah diajak pipis belum? Sudah ada yang kasih makan? Jadi kami mulai mencatatnya di satu tempat.",
      "Lama-lama bukan cuma soal anjing. Tugas rumah, dapur, dan semua yang ikut membantu di rumah ikut masuk. Miamus tumbuh menjadi cara rumah kami saling menjaga — bersama-sama.",
      "Kami membuatnya untuk rumah seperti rumah kami: semua bisa melihat apa yang sudah dan apa yang berikutnya, jadi tidak ada yang harus mengingat semuanya sendirian.",
    ],
    proverb: {
      text: "Berat sama dipikul, ringan sama dijinjing.",
      note: "Begitulah urusan rumah di Miamus: dibagi bersama.",
    },
    madeBy: `Dibuat dengan sepenuh hati oleh ${LEGAL.operatorName}.`,
    privacy: "Kebijakan Privasi",
    privacyHref: "/privasi",
    feedback: "Kirim masukan",
    feedbackDetail: "Ide, masalah, apa saja: langsung ke kami.",
  },
} satisfies Record<OwnerLocale, unknown>;

export function AboutMiamus() {
  const locale = useOwnerLocale();
  const copy = COPY[locale];
  // Feedback (roadmap item 9, migrations/135): here, low-key, where an
  // owner who wants to tell the makers something would look.
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <article className="flex flex-col gap-6 pb-4">
      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <BrandMark size={64} rounded />
        <h2 className="text-xl font-semibold tracking-tight text-gray-900">{copy.title}</h2>
        <p className="text-[15px] text-muted-foreground">{copy.promise}</p>
      </header>

      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-gray-800">
        {copy.story.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      {copy.proverb && (
        <figure className="rounded-xl border bg-muted/40 px-4 py-4 text-center">
          <blockquote className="text-[15px] font-medium italic text-gray-900">
            “{copy.proverb.text}”
          </blockquote>
          <figcaption className="mt-1.5 text-sm text-muted-foreground">{copy.proverb.note}</figcaption>
        </figure>
      )}

      <button
        type="button"
        onClick={() => setFeedbackOpen(true)}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left active:bg-muted"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <MessageSquareText className="size-5" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold text-gray-900">{copy.feedback}</span>
          <span className="text-xs text-muted-foreground">{copy.feedbackDetail}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>
      <FeedbackSheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} locale={locale} />

      <footer className="flex flex-col items-center gap-1 pt-2 text-center text-xs text-muted-foreground">
        <span>{copy.madeBy}</span>
        <span>
          <a href={`mailto:${LEGAL.contactEmail}`} className="underline underline-offset-4">
            {LEGAL.contactEmail}
          </a>
          {" · "}
          <Link href={copy.privacyHref} className="underline underline-offset-4">
            {copy.privacy}
          </Link>
        </span>
      </footer>
    </article>
  );
}
