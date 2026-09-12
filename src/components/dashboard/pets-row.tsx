"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, Loader2, Plus, Trash2 } from "lucide-react";
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
import { getPetMeta } from "@/lib/pets";
import { cn } from "@/lib/utils";
import type { TaskEntity } from "@/types/database";

const LONG_PRESS_MS = 500;

export function PetsRow() {
  const { pets, activePetId, setActivePetId, createEntity, updateEntity, deleteEntity } =
    useHousehold();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskEntity | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(pet: TaskEntity) {
    setEditing(pet);
    setFormOpen(true);
  }

  return (
    <div className="border-b py-3">
      <h2 className="mb-1 px-4 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Your pets
      </h2>
      <div className="no-scrollbar flex flex-row gap-2 overflow-x-auto px-2 py-2">
        {pets.map((pet) => (
          <div key={pet.id} className="shrink-0 p-2">
            <PetAvatar
              pet={pet}
              active={pet.id === activePetId}
              onTap={() => setActivePetId(pet.id)}
              onLongPress={() => openEdit(pet)}
            />
          </div>
        ))}
        <div className="shrink-0 p-2">
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-[48px] flex-col items-center gap-1"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-primary/50 bg-primary/5 text-primary shadow-sm">
              <Plus className="size-6" />
            </span>
            <span className="max-w-16 truncate text-center text-xs text-muted-foreground">
              Add pet
            </span>
          </button>
        </div>
      </div>

      <PetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        pet={editing}
        createEntity={createEntity}
        updateEntity={updateEntity}
        deleteEntity={deleteEntity}
      />
    </div>
  );
}

function PetAvatar({
  pet,
  active,
  onTap,
  onLongPress,
}: {
  pet: TaskEntity;
  active: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const meta = getPetMeta(pet);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  function startPress() {
    longPressed.current = false;
    timerRef.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function endPress() {
    cancelPress();
    if (!longPressed.current) {
      onTap();
    }
  }

  return (
    <button
      type="button"
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={cancelPress}
      className="flex min-h-[48px] touch-none flex-col items-center gap-1 select-none [-webkit-touch-callout:none]"
    >
      {meta.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.avatar_url}
          alt=""
          className={cn(
            "h-16 w-16 rounded-full border border-gray-200 object-cover shadow-sm transition-all duration-200 ease-out",
            active ? "scale-105 ring-2 ring-emerald-500 ring-offset-2" : "opacity-60 grayscale"
          )}
        />
      ) : (
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-muted text-2xl shadow-sm transition-all duration-200 ease-out",
            active ? "scale-105 ring-2 ring-emerald-500 ring-offset-2" : "opacity-60 grayscale"
          )}
        >
          🐶
        </div>
      )}
      <span
        className={cn(
          "max-w-16 truncate text-center text-xs font-medium transition-colors duration-200 ease-out",
          !active && "text-muted-foreground"
        )}
      >
        {pet.name}
      </span>
    </button>
  );
}

function PetFormDialog({
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
