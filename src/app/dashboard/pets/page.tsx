"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PhotoPicker } from "@/components/photo-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { getPetMeta, isPet } from "@/lib/pets";
import type { TaskEntity } from "@/types/database";

export default function PetsPage() {
  const { entities, loading, createEntity, updateEntity, deleteEntity } = useHousehold();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskEntity | null>(null);

  const pets = entities.filter(isPet);
  const active = pets.filter((p) => !getPetMeta(p).archived);
  const archived = pets.filter((p) => getPetMeta(p).archived);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(pet: TaskEntity) {
    setEditing(pet);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Pets</h1>
        <Button size="sm" className="min-h-[48px]" onClick={openCreate}>
          <Plus /> Add pet
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">
          No pets yet. Add your first pet to start scheduling tasks.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {active.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              onEdit={() => openEdit(pet)}
              onArchive={() =>
                updateEntity(pet.id, { metadata: { ...pet.metadata, archived: true } })
              }
              onDelete={() => deleteEntity(pet.id)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Archived
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {archived.map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                archived
                onRestore={() =>
                  updateEntity(pet.id, { metadata: { ...pet.metadata, archived: false } })
                }
                onDelete={() => deleteEntity(pet.id)}
              />
            ))}
          </div>
        </div>
      )}

      <PetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        pet={editing}
        createEntity={createEntity}
        updateEntity={updateEntity}
      />
    </div>
  );
}

function PetCard({
  pet,
  archived = false,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  pet: TaskEntity;
  archived?: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete: () => void;
}) {
  const meta = getPetMeta(pet);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-center gap-3">
          {meta.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meta.avatar_url}
              alt=""
              className="size-12 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-xl">
              🐶
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{pet.name}</p>
            {meta.breed && <p className="truncate text-sm text-muted-foreground">{meta.breed}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!archived && onEdit && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-[48px]"
              onClick={onEdit}
            >
              <Pencil /> Edit
            </Button>
          )}
          {!archived && onArchive && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-[48px]"
              onClick={onArchive}
            >
              <Archive /> Archive
            </Button>
          )}
          {archived && onRestore && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-[48px]"
              onClick={onRestore}
            >
              <RotateCcw /> Restore
            </Button>
          )}
          {confirmingDelete ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="min-h-[48px]"
                onClick={() => {
                  onDelete();
                  toast.success(`${pet.name} deleted`);
                }}
              >
                Confirm delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[48px]"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[48px] text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PetFormDialog({
  open,
  onOpenChange,
  pet,
  createEntity,
  updateEntity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pet: TaskEntity | null;
  createEntity: ReturnType<typeof useHousehold>["createEntity"];
  updateEntity: ReturnType<typeof useHousehold>["updateEntity"];
}) {
  const meta = pet ? getPetMeta(pet) : {};
  const [name, setName] = useState(pet?.name ?? "");
  const [breed, setBreed] = useState(meta.breed ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(meta.avatar_url ?? null);
  const [submitting, setSubmitting] = useState(false);

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
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px]">
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Save pet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
