"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Clock, Droplets, Plus, Utensils, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { useHousehold } from "@/context/household-context";
import { POTTY_TITLE } from "@/lib/schedule-categories";
import { buildAgenda, formatDateLocal, type AgendaItem } from "@/lib/scheduleEngine";
import type { MasterSchedule, TaskEntity, TaskLog } from "@/types/database";

export function UnifiedSummaryCard() {
  const {
    pets,
    schedules,
    logs,
    selectedDate,
    userRole,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useHousehold();
  const canManagePets = userRole === "owner";
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col px-4">
        <div className="flex flex-col divide-y">
          {pets.map((pet) => (
            <PetOverviewRow key={pet.id} pet={pet} schedules={schedules} logs={logs} date={selectedDate} />
          ))}
        </div>

        {/* Deliberately the quiet one: adding or editing pets is a rare setup
            task, so it sits back in grey and leaves the solid dark fill to
            Manage Routines, which is the frequent action. */}
        {canManagePets && (
          <Button
            onClick={() => setAddOpen(true)}
            variant="outline"
            size="lg"
            className="mt-4 min-h-[52px] w-full border-gray-200 bg-gray-50 text-base text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <Plus /> Manage Pets
          </Button>
        )}
      </CardContent>

      {canManagePets && (
        <PetFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          pet={null}
          createEntity={createEntity}
          updateEntity={updateEntity}
          deleteEntity={deleteEntity}
        />
      )}
    </Card>
  );
}

function MiniStatusIcon({ status }: { status: AgendaItem["status"] | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === "overdue") return <XCircle className="size-4 text-red-500" />;
  return <Clock className="size-4 text-amber-500" />;
}

function PetOverviewRow({
  pet,
  schedules,
  logs,
  date,
}: {
  pet: TaskEntity;
  schedules: MasterSchedule[];
  logs: TaskLog[];
  date: Date;
}) {
  const { setActivePetId } = useHousehold();
  const dateStr = formatDateLocal(date);
  const items = useMemo(() => {
    const groups = buildAgenda({ date: dateStr, entities: [pet], schedules, logs });
    return groups.flatMap((g) => g.items);
  }, [dateStr, pet, schedules, logs]);

  const potty = items.filter((i) => i.title === POTTY_TITLE);
  const pottyDone = potty.filter((i) => i.status === "completed").length;
  const lunch = items.find((i) => i.title === "Makan Siang");
  const dinner = items.find((i) => i.title === "Makan Malam");

  return (
    <button
      type="button"
      onClick={() => setActivePetId(pet.id)}
      className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left text-sm first:pt-0 last:pb-0 active:bg-gray-50"
    >
      <MiniPetAvatar pet={pet} className="size-12" />
      <span className="flex-1 truncate text-lg font-medium">{pet.name}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Droplets className="size-3.5" />
        {pottyDone}/{potty.length}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Utensils className="size-3.5" />
        <MiniStatusIcon status={lunch?.status} />
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Utensils className="size-3.5" />
        <MiniStatusIcon status={dinner?.status} />
      </span>
      <ChevronRight className="ml-auto size-5 shrink-0 text-gray-400" />
    </button>
  );
}
