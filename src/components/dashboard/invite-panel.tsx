"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Smartphone, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHousehold } from "@/context/household-context";
import { createInviteLink, INVITE_TTL_DAYS, type InviteKind } from "@/lib/invites";

/**
 * Where the owner hands out access (Phase 89).
 *
 * Two kinds, and the difference matters more than the buttons suggest:
 *   Co-owner     — a person, who arrives with their own Google account and
 *                  sees this dashboard.
 *   Staff device — a phone, which gets an anonymous identity of its own and
 *                  sees only the staff view.
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary.
 */
export function InvitePanel() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Invites</h2>
      <InviteCard
        kind="owner"
        icon={UserPlus}
        title="Invite Co-Owner"
        description="They sign in with Google and get full access to this dashboard."
      />
      <InviteCard
        kind="staff"
        icon={Smartphone}
        title="Invite Staff Device"
        description="Opens the staff view on their phone. No account needed — the link is what binds the phone to this household."
      />
    </div>
  );
}

function InviteCard({
  kind,
  icon: Icon,
  title,
  description,
}: {
  kind: InviteKind;
  icon: typeof UserPlus;
  title: string;
  description: string;
}) {
  const { activeHouseholdId } = useHousehold();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const url = await createInviteLink(kind, activeHouseholdId);
      setLink(url);
      // Copied on creation as well as on demand: the link is useless until it
      // is somewhere it can be pasted, and this is a phone.
      await copy(url);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create the invite link");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Clipboard access needs a secure context and sometimes a permission;
      // the link stays on screen to be copied by hand.
      console.error(err);
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  }

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {link && (
          // break-all, not truncate: a link you cannot read is a link you
          // cannot check before sending it to someone.
          <p className="rounded-lg bg-muted px-3 py-2 text-[11px] break-all text-muted-foreground select-all">
            {link}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={generate} disabled={busy} className="min-h-[44px] flex-1">
            {busy ? <Loader2 className="animate-spin" /> : <Icon />}
            {link ? "New link" : title}
          </Button>
          {link && (
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => copy(link)}
              aria-label="Copy invite link"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          )}
        </div>

        {link && (
          <p className="text-[11px] text-muted-foreground">
            Single use, expires in {INVITE_TTL_DAYS} days. Anyone with this link can join until
            it is used.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
