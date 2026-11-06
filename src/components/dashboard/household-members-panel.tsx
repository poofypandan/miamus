"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Mail, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createResource } from "@/lib/resource";
import { supabase } from "@/lib/supabase/client";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { DATE_LOCALE } from "@/lib/owner-locale";

interface Member {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
  is_founder: boolean;
  is_self: boolean;
}

/**
 * Who has co-owner access to this household, and the way to take it back
 * (Phase 96).
 *
 * Both reads and writes go through security-definer functions
 * (migrations/094): the table only ever shows you your own row, and emails
 * live in auth.users, which no client can read. The functions re-check the
 * caller's membership themselves, so this component is a view of a decision
 * the database makes, not the decision itself.
 *
 * Owner-facing, in the language the owner chose (Phase 149).
 */
// A Suspense resource (Phase 125, lib/resource): the Access tab switches in
// with its member list already drawn, rather than a skeleton that becomes a
// list a moment later.
const useMembers = createResource(async () => {
  if (!supabase) return [] as Member[];
  const { data, error } = await supabase.rpc("list_household_members");
  if (error) throw error;
  return (data ?? []) as Member[];
});

export function HouseholdMembersPanel() {
  const { data: members, failed, reload: load } = useMembers();
  const [pending, setPending] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const locale = useOwnerLocale();
  const t = useT();

  async function confirmRemove() {
    if (!pending || !supabase) return;
    setRemoving(true);
    try {
      const { error } = await supabase.rpc("remove_household_member", {
        p_user_id: pending.user_id,
      });
      if (error) throw error;
      toast.success(t(`${pending.email} no longer has access`, `${pending.email} tidak lagi punya akses`));
      setPending(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't remove this person", "Orang ini gagal dihapus"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">{t("Admins", "Admin")}</h2>
      <p className="-mt-1 text-xs text-muted-foreground">
        {t(
          "People who sign in with Google and can use Manage. Everyone who signs in with a PIN appears under People & PINs.",
          "Orang yang masuk dengan Google dan bisa mengelola. Semua yang masuk dengan PIN ada di bagian Orang & PIN."
        )}
      </p>

      {failed ? (
        <p className="text-sm text-destructive">
          {t(
            "Couldn't load the member list. Check your connection and reload.",
            "Daftar anggota gagal dimuat. Periksa koneksi lalu muat ulang."
          )}
        </p>
      ) : members === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <Card className="py-2">
          <CardContent className="flex flex-col divide-y px-0">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {member.is_founder ? <Crown className="size-4" /> : <Mail className="size-4" />}
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{member.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("Joined", "Bergabung")}{" "}
                    {new Date(member.joined_at).toLocaleDateString(DATE_LOCALE[locale], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </span>

                {member.is_self && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t("You", "Anda")}
                  </Badge>
                )}
                {member.is_founder && !member.is_self && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t("Founder", "Pemilik")}
                  </Badge>
                )}

                {/* Neither the founder nor yourself can be removed — the
                    database refuses both, and hiding the button keeps the UI
                    from offering something that would only fail. */}
                {!member.is_self && !member.is_founder && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-[36px] shrink-0 text-destructive"
                    onClick={() => setPending(member)}
                    aria-label={t(`Remove ${member.email}`, `Hapus ${member.email}`)}
                  >
                    <UserMinus /> {t("Remove", "Hapus")}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Remove access?", "Hapus akses?")}</DialogTitle>
            <DialogDescription>
              {t(
                `${pending?.email ?? ""} will lose access to this household immediately. Their phone keeps working as a PIN device if it has its own invite.`,
                `${pending?.email ?? ""} langsung kehilangan akses ke rumah ini. HP-nya tetap bisa dipakai sebagai perangkat PIN jika punya undangan sendiri.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setPending(null)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button
              variant="destructive"
              className="min-h-[44px]"
              disabled={removing}
              onClick={confirmRemove}
            >
              {removing ? <Loader2 className="animate-spin" /> : <UserMinus />} {t("Remove", "Hapus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
