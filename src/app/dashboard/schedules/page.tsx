"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { useHousehold } from "@/context/household-context";

export default function SchedulesPage() {
  const { pets, loading } = useHousehold();
  const [tab, setTab] = useState<string | undefined>(undefined);
  const activeTab = tab ?? pets[0]?.id;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Schedules</h1>
        <p className="pt-8 text-center text-sm text-muted-foreground">
          No pets yet. Add a pet in Pets to start building schedules.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Schedules</h1>
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          {pets.map((pet) => (
            <TabsTrigger key={pet.id} value={pet.id} className="min-h-[48px]">
              {pet.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {pets.map((pet) => (
          <TabsContent key={pet.id} value={pet.id}>
            <ScheduleEditor entity={pet} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
