"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FoodPhotoField } from "@/components/kitchen/food-photo-field";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { useRepairs } from "@/hooks/use-repairs";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { dataProvider } from "@/lib/data";
import { photoSrc } from "@/lib/photos";
import { NOTE_LIMIT, canTakeBackNote, noteTime } from "@/lib/repairs";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * A short thread on a repair (Phase 159 PR B, migrations/131): "the repair
 * person needs a part, back Thursday", with an optional photo. Owners see it
 * in a repair's sheet; staff on the visit. Owners may delete any note; the
 * phone that wrote one may take it back for 5 minutes. Staff screens pass
 * locale "id" and `asStaff`.
 */
export function RepairNotes({
  repairId,
  locale,
  asStaff = false,
}: {
  repairId: string;
  locale: OwnerLocale;
  asStaff?: boolean;
}) {
  const ind = locale === "id";
  const tr = (en: string, id: string) => (ind ? id : en);
  const { notes, reload } = useRepairs();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, tr("Someone", "Seseorang"));
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setStaffId(readActiveStaffId());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const thread = notes.filter((n) => n.repair_id === repairId);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending || photoBusy) return;
    setSending(true);
    let uploaded: string | null = null;
    try {
      if (photo instanceof File) uploaded = await dataProvider.uploadPhoto(photo, "repairs/notes");
      await dataProvider.addRepairNote({
        repair_id: repairId,
        body: text.slice(0, NOTE_LIMIT),
        photo_url: uploaded,
        staff_id: asStaff ? staffId : null,
      });
      setBody("");
      setPhoto(null);
      await reload();
    } catch (err) {
      console.error(err);
      if (uploaded) void dataProvider.deletePhoto(uploaded).catch(() => undefined);
      toast.error(tr("Couldn't send. Try again.", "Gagal mengirim. Coba lagi."));
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string, photoUrl: string | null) {
    try {
      await dataProvider.deleteRepairNote(id);
      if (photoUrl) void dataProvider.deletePhoto(photoUrl).catch(() => undefined);
      await reload();
    } catch {
      toast.error(asStaff ? "Sudah lewat 5 menit, catatan tidak bisa dibatalkan." : tr("Couldn't delete.", "Gagal menghapus."));
    }
  }

  return (
    <section aria-label={tr("Notes", "Catatan")} className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{tr("Notes", "Catatan")}</h3>
      {thread.map((note) => {
        const author = note.staff_id ? staffName(note.staff_id) : tr("Owner", "Pemilik rumah");
        const mayDelete = asStaff ? canTakeBackNote(note, staffId, now) : true;
        return (
          <div key={note.id} className="flex flex-col gap-1.5 rounded-xl border bg-muted/30 px-3 py-2">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{author}</span>{" "}
                <span className="text-xs text-muted-foreground">{noteTime(note.created_at, locale)}</span>
                <span className="mt-0.5 block whitespace-pre-wrap text-gray-800">{note.body}</span>
              </p>
              {mayDelete && (
                <button
                  type="button"
                  onClick={() => void remove(note.id, note.photo_url)}
                  aria-label={asStaff ? "Batalkan catatan" : tr("Delete note", "Hapus catatan")}
                  className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            {note.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoSrc(note.photo_url, 320)} alt="" className="max-h-40 w-full rounded-lg bg-muted object-cover" />
            )}
          </div>
        );
      })}
      <form onSubmit={send} className="flex flex-col gap-2">
        <Textarea
          value={body}
          maxLength={NOTE_LIMIT}
          onChange={(e) => setBody(e.target.value)}
          placeholder={tr("e.g. Needs a part, back Thursday", "mis. Perlu beli suku cadang, datang lagi Kamis")}
          aria-label={tr("Add a note", "Tambah catatan")}
          className="min-h-[64px]"
        />
        {body.trim() && <FoodPhotoField value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} locale={locale} />}
        <Button
          type="submit"
          variant="outline"
          disabled={!body.trim() || sending || photoBusy}
          className="min-h-[44px] self-end rounded-xl"
        >
          {sending ? <Loader2 className="animate-spin" /> : <Send />} {tr("Send", "Kirim")}
        </Button>
      </form>
    </section>
  );
}
