"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PhotoPicker } from "@/components/photo-picker";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { getPetMeta } from "@/lib/pets";
import type { TaskEntity } from "@/types/database";

// Shared by the "Add / Manage Pets" entry point on the Overview (pet: null)
// and the "Edit Pet" button on each pet's detail header (pet: that pet).
export function PetFormDialog({
  open,
  onOpenChange,
  pet,
  createEntity,
  updateEntity,
  deleteEntity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pet: TaskEntity | null;
  createEntity: ReturnType<typeof useHousehold>["createEntity"];
  updateEntity: ReturnType<typeof useHousehold>["updateEntity"];
  deleteEntity: ReturnType<typeof useHousehold>["deleteEntity"];
}) {
  // Covers both entry points (Manage Pets and Edit Pet) in one place, since
  // `open` is owned by whichever parent rendered this dialog.
  useBackToClose(open, () => onOpenChange(false));

  const meta = pet ? getPetMeta(pet) : {};
  const [name, setName] = useState(pet?.name ?? "");
  const [breed, setBreed] = useState(meta.breed ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(meta.avatar_url ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reset local form state on every open — including two consecutive "Add
  // pet" openings, which share the same "new" identity — since this
  // component doesn't unmount between uses.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(pet?.name ?? "");
      setBreed(meta.breed ?? "");
      setAvatarUrl(meta.avatar_url ?? null);
      setConfirmingDelete(false);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Give the pet a name");
      return;
    }
    setSubmitting(true);
    try {
      const metadata = {
        ...(pet?.metadata ?? {}),
        breed: breed.trim() || undefined,
        avatar_url: avatarUrl,
      };
      if (pet) {
        await updateEntity(pet.id, { name: name.trim(), metadata });
        toast.success("Pet updated");
      } else {
        await createEntity({ entity_type: "pet", name: name.trim(), icon: "dog", metadata });
        toast.success("Pet added");
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save pet");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!pet) return;
    setSubmitting(true);
    try {
      await updateEntity(pet.id, { metadata: { ...pet.metadata, archived: true } });
      toast.success(`${pet.name} archived`);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to archive pet");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!pet) return;
    setSubmitting(true);
    try {
      await deleteEntity(pet.id);
      toast.success(`${pet.name} deleted`);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete pet");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pet ? "Edit Pet" : "Add Pet"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Buddy"
              className="min-h-[48px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Breed (optional)</Label>
            <Input
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="e.g. Golden Retriever"
              className="min-h-[48px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Avatar photo (optional)</Label>
            <PhotoPicker
              pathPrefix={`pet-avatars/${pet?.id ?? "new"}`}
              value={avatarUrl}
              onChange={setAvatarUrl}
              label="Add photo"
            />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px] w-full">
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Save pet
          </Button>
          {pet && (
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[48px] flex-1"
                onClick={handleArchive}
                disabled={submitting}
              >
                <Archive /> Archive
              </Button>
              {confirmingDelete ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="min-h-[48px] flex-1"
                    onClick={handleDelete}
                    disabled={submitting}
                  >
                    Confirm delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-[48px]"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[48px] flex-1 text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={submitting}
                >
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
