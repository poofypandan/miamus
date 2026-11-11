"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, FileText, Loader2, Share2, Siren, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SyncedImg } from "@/components/shared/synced-img";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdName } from "@/hooks/use-household-name";
import {
  developerListText,
  developerStatus,
  itemMeta,
  itemTitle,
  listDate,
  photoFileName,
  photoLabel,
  reportedDay,
  whatsAppUrl,
  type DeveloperItem,
} from "@/lib/developer-list";
import type { OwnerLocale } from "@/lib/owner-locale";
import { photoSrc } from "@/lib/photos";
import { readQueuedPhoto } from "@/lib/photo-queue";
import { cn } from "@/lib/utils";
import type { RepairWalkIn } from "@/types/database";

/** The message's language, remembered on this phone: an owner who writes to their developer in English keeps it. */
const LANG_KEY = "miamus.developer-list.lang";
/** Photos still loading after this long are left out of the share; the text goes anyway. */
const PREPARE_TIMEOUT_MS = 10_000;

function readLang(): OwnerLocale {
  try {
    return window.localStorage.getItem(LANG_KEY) === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    return navigator.canShare({ files: [new File([new Uint8Array(1)], "x.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

/** A photo's bytes: the copy still on this phone, else the stored one at a size WhatsApp keeps sharp. */
async function photoBlob(url: string): Promise<Blob | null> {
  const local = await readQueuedPhoto(url).catch(() => null);
  if (local) return local;
  const src = photoSrc(url, 1280);
  if (!src) return null;
  const res = await fetch(src);
  if (!res.ok) return null;
  const blob = await res.blob();
  return blob.type.startsWith("image/") ? blob : null;
}

/**
 * Send to the developer (Phase 174 PR C, D7 A; plan mockup 7). The open
 * repairs, all ticked; untick what isn't the developer's. Share on WhatsApp
 * (the phone's share sheet, with the photos as files where the phone
 * allows; otherwise the text) or Save as PDF (a page made for paper). Owners
 * only; Miamus sends nothing and makes no link.
 *
 * Mount it fresh for each opening (a key), so every list starts all ticked.
 */
export function DeveloperListSheet({
  open,
  onClose,
  items,
  walkIns,
}: {
  open: boolean;
  onClose: () => void;
  items: DeveloperItem[];
  walkIns: readonly RepairWalkIn[];
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const houseName = useHouseholdName();
  const [lang, setLangState] = useState<OwnerLocale>(readLang);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [filesOk] = useState(canShareFiles);
  // Photos are fetched when the sheet opens, not on the tap: the share sheet
  // must open straight from the tap, or the phone refuses it.
  const [blobs, setBlobs] = useState<ReadonlyMap<string, Blob>>(new Map());
  const [preparing, setPreparing] = useState(filesOk);
  const now = useMemo(() => new Date(), []);

  useBackToClose(open && !printing, onClose);

  const photoUrls = useMemo(() => [...new Set(items.flatMap((i) => i.photos.map((p) => p.url)))], [items]);
  const photoKey = photoUrls.join("|");
  useEffect(() => {
    if (!filesOk) return;
    let cancelled = false;
    const loaded = new Map<string, Blob>();
    const work = Promise.allSettled(
      photoUrls.map(async (url) => {
        const blob = await photoBlob(url);
        if (blob) loaded.set(url, blob);
      })
    );
    const timeout = new Promise((resolve) => window.setTimeout(resolve, PREPARE_TIMEOUT_MS));
    void Promise.race([work, timeout]).then(() => {
      if (cancelled) return;
      setBlobs(new Map(loaded));
      setPreparing(false);
    });
    return () => {
      cancelled = true;
    };
    // photoKey stands for photoUrls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesOk, photoKey]);

  const chosen = items.filter((i) => !unticked.has(i.repair.id));
  const files = useMemo(() => {
    const out: File[] = [];
    chosen.forEach((item, index) =>
      item.photos.forEach((photo, photoIndex) => {
        const blob = blobs.get(photo.url);
        if (!blob) return;
        const type = blob.type || "image/jpeg";
        out.push(new File([blob], photoFileName(index, photoIndex, type, lang), { type }));
      })
    );
    return out;
    // chosen is derived from items and unticked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, unticked, blobs, lang]);
  const withPhotos = filesOk && files.length > 0;
  const text = developerListText({ houseName, now, items: chosen, walkIns, lang, withPhotos });

  function setLang(next: OwnerLocale) {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // Blocked storage: the choice holds until the sheet closes.
    }
  }

  function toggle(id: string) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copy(value: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  async function share() {
    if (chosen.length === 0) return;
    // No share sheet (a computer, an old browser): WhatsApp with the text.
    if (typeof navigator.share !== "function") {
      window.open(whatsAppUrl(text), "_blank", "noopener,noreferrer");
      return;
    }
    setSharing(true);
    try {
      await navigator.share(withPhotos ? { text, files } : { text });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Refused with the photos: the text alone, which every phone takes.
      if (withPhotos) {
        const plain = developerListText({ houseName, now, items: chosen, walkIns, lang, withPhotos: false });
        try {
          await navigator.share({ text: plain });
          return;
        } catch (again) {
          if (again instanceof DOMException && again.name === "AbortError") return;
        }
      }
      if (await copy(text)) {
        toast.success(t("Couldn't open sharing. The text is copied: paste it in WhatsApp.", "Gagal membuka bagikan. Teksnya sudah disalin: tempel di WhatsApp."));
      } else {
        toast.error(t("Couldn't open sharing. Try Save as PDF.", "Gagal membuka bagikan. Coba Simpan sebagai PDF."));
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Sheet open={open && !printing} onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl">
          <SheetHeader className="gap-1 border-b pb-3">
            <SheetTitle className="pr-8 text-lg">{t("Send to the developer", "Kirim ke developer")}</SheetTitle>
            <SheetDescription>
              {t(
                "Open problems with photos. Untick what isn't the developer's.",
                "Masalah yang masih terbuka beserta fotonya. Hapus centang yang bukan urusan developer."
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <section aria-label={t("Repairs to send", "Perbaikan yang dikirim")} className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {items.map((item, index) => (
                <ItemRow
                  key={item.repair.id}
                  item={item}
                  first={index === 0}
                  checked={!unticked.has(item.repair.id)}
                  onToggle={() => toggle(item.repair.id)}
                  locale={locale}
                  walkIns={walkIns}
                />
              ))}
            </section>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("Message language", "Bahasa pesan")}
              </span>
              <SegmentedControl
                ariaLabel={t("Message language", "Bahasa pesan")}
                value={lang}
                onChange={setLang}
                segments={[
                  { value: "id", label: "Bahasa Indonesia" },
                  { value: "en", label: "English" },
                ]}
              />
            </div>

            <section aria-label={t("Message", "Pesan")} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("Message", "Pesan")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[36px] rounded-lg"
                  disabled={chosen.length === 0}
                  onClick={async () => {
                    if (await copy(text)) toast.success(t("Copied", "Disalin"));
                    else toast.error(t("Couldn't copy", "Gagal menyalin"));
                  }}
                >
                  <Copy /> {t("Copy text", "Salin teks")}
                </Button>
              </div>
              <pre
                data-testid="developer-text"
                className="max-h-56 overflow-y-auto rounded-xl border bg-muted/50 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-gray-800"
              >
                {chosen.length > 0 ? text : t("Tick at least one repair.", "Centang minimal satu perbaikan.")}
              </pre>
            </section>

            <div className="flex flex-col gap-2">
              <Button
                className="min-h-[48px] rounded-xl"
                disabled={chosen.length === 0 || sharing || preparing}
                onClick={() => void share()}
              >
                {preparing || sharing ? <Loader2 className="animate-spin" /> : <Share2 />}
                {preparing ? t("Getting the photos ready…", "Menyiapkan foto…") : t("Share on WhatsApp", "Bagikan lewat WhatsApp")}
              </Button>
              <Button
                variant="outline"
                className="min-h-[48px] rounded-xl"
                disabled={chosen.length === 0}
                onClick={() => setPrinting(true)}
              >
                <FileText /> {t("Save as PDF", "Simpan sebagai PDF")}
              </Button>
              <p className="text-center text-[11px] leading-snug text-muted-foreground">
                {filesOk
                  ? t(
                      "Miamus doesn't send it: you choose who gets it.",
                      "Miamus tidak mengirimkannya: Anda yang memilih penerimanya."
                    )
                  : t(
                      "This browser can't attach photos to a message. Save as PDF to send them as a file. Miamus doesn't send anything itself.",
                      "Browser ini tidak bisa melampirkan foto ke pesan. Simpan sebagai PDF untuk mengirimnya sebagai berkas. Miamus tidak mengirim apa pun sendiri."
                    )}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {printing && (
        <DeveloperPrintPage
          houseName={houseName}
          now={now}
          items={chosen}
          walkIns={walkIns}
          lang={lang}
          onClose={() => setPrinting(false)}
        />
      )}
    </>
  );
}

function ItemRow({
  item,
  first,
  checked,
  onToggle,
  locale,
  walkIns,
}: {
  item: DeveloperItem;
  first: boolean;
  checked: boolean;
  onToggle: () => void;
  locale: OwnerLocale;
  walkIns: readonly RepairWalkIn[];
}) {
  const t = useT();
  const { repair } = item;
  const reported = t(`Reported ${reportedDay(repair, "en")}`, `Dilaporkan ${reportedDay(repair, "id")}`);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={repair.title}
      onClick={onToggle}
      className={cn("flex min-h-[72px] w-full items-center gap-3 px-3 py-2.5 text-left active:bg-muted", !first && "border-t")}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border",
          checked ? "border-gray-900 bg-gray-900 text-white" : "bg-white"
        )}
      >
        {checked && <Check className="size-3.5" aria-hidden />}
      </span>
      {item.photos[0] ? (
        <SyncedImg url={item.photos[0].url} size={160} className="size-12 shrink-0 rounded-lg bg-muted object-cover" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Wrench className="size-4" aria-hidden />
        </span>
      )}
      <span className={cn("flex min-w-0 flex-1 flex-col", !checked && "opacity-60")}>
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
          {repair.urgent && <Siren className="size-3.5 shrink-0 text-red-700" aria-label={t("Urgent", "Darurat")} />}
          <span className="truncate">{repair.title}</span>
        </span>
        {item.place && <span className="truncate text-xs text-muted-foreground">{item.place}</span>}
        <span className="line-clamp-2 text-xs text-gray-600">
          {reported} · {developerStatus(repair, item.stage, walkIns, locale)}
          {item.photos.length > 1 && ` · ${t(`${item.photos.length} photos`, `${item.photos.length} foto`)}`}
        </span>
      </span>
    </button>
  );
}

/**
 * The page to print or save as PDF: one repair per block, photos sized for
 * paper, in the message's language. Drawn over the app in a portal; the
 * print styles (globals.css, `html.print-developer-list`) leave only this
 * page on paper. The print dialog opens by itself once the photos are in;
 * the button is there for a second go.
 */
function DeveloperPrintPage({
  houseName,
  now,
  items,
  walkIns,
  lang,
  onClose,
}: {
  houseName: string;
  now: Date;
  items: DeveloperItem[];
  walkIns: readonly RepairWalkIn[];
  lang: OwnerLocale;
  onClose: () => void;
}) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  useBackToClose(true, onClose);

  // Only drawn after a tap (never on the server), so document is there.
  useEffect(() => {
    document.documentElement.classList.add("print-developer-list");
    let cancelled = false;
    const images = Array.from(root.current?.querySelectorAll("img") ?? []);
    const loaded = Promise.allSettled(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            })
      )
    );
    const timeout = new Promise((resolve) => window.setTimeout(resolve, 6_000));
    void Promise.race([loaded, timeout]).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
      document.documentElement.classList.remove("print-developer-list");
    };
  }, []);

  const id = lang === "id";
  return createPortal(
    <div
      ref={root}
      data-print-root
      role="dialog"
      aria-modal="true"
      aria-label={id ? "Daftar perbaikan" : "Repair list"}
      className="fixed inset-0 z-[60] overflow-y-auto bg-white text-gray-900"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white/95 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 backdrop-blur print:hidden">
        <Button variant="ghost" className="min-h-[44px] rounded-xl" onClick={onClose}>
          <ArrowLeft /> {t("Back", "Kembali")}
        </Button>
        <Button className="ml-auto min-h-[44px] rounded-xl" onClick={() => window.print()}>
          <FileText /> {t("Print or save as PDF", "Cetak atau simpan PDF")}
        </Button>
      </div>
      <p className="mx-auto max-w-2xl px-6 pt-3 text-xs text-muted-foreground print:hidden">
        {t(
          "In the print screen, choose Save as PDF, then send the file on WhatsApp or by email.",
          "Di layar cetak, pilih Simpan sebagai PDF, lalu kirim berkasnya lewat WhatsApp atau email."
        )}
      </p>

      <article className="mx-auto max-w-2xl px-6 pt-6 pb-16 print:max-w-none print:p-0">
        <header className="border-b-2 border-gray-900 pb-3">
          <h1 className="text-2xl font-semibold">{id ? "Daftar perbaikan" : "Repair list"}</h1>
          <p className="mt-1 text-sm text-gray-700">
            {houseName} · {listDate(now, lang)} · {items.length} {id ? "item" : items.length === 1 ? "item" : "items"}
          </p>
        </header>

        {items.map((item, index) => (
          <section key={item.repair.id} className="break-inside-avoid border-b py-5" aria-label={itemTitle(index, item.repair, lang)}>
            <h2 className="text-lg font-semibold">{itemTitle(index, item.repair, lang)}</h2>
            {item.place && <p className="mt-0.5 text-sm text-gray-700">{item.place}</p>}
            {item.repair.details?.trim() && <p className="mt-1 text-sm whitespace-pre-wrap text-gray-800">{item.repair.details.trim()}</p>}
            <p className="mt-1 text-sm text-gray-600">{itemMeta(item, walkIns, lang)}</p>
            {item.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {item.photos.map((photo, photoIndex) => (
                  <figure key={photo.url} className="flex flex-col gap-1">
                    <SyncedImg
                      url={photo.url}
                      size={1280}
                      className="h-56 w-full rounded-lg border bg-gray-50 object-contain print:h-[7.5cm]"
                    />
                    <figcaption className="text-xs text-gray-600">{photoLabel(photo, index, photoIndex, lang)}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        ))}

        <p className="pt-5 text-sm text-gray-700">
          {id ? "Terima kasih banyak atas bantuannya." : "Thank you very much for your help."}
        </p>
      </article>
    </div>,
    document.body
  );
}
