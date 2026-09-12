"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { useHousehold } from "@/context/household-context";

export default function SchedulesPage() {
  const { entities, loading } = useHousehold();
  const [tab, setTab] = useState<string | undefined>(undefined);
  const activeTab = tab ?? entities[0]?.id;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Schedules</h1>
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          {entities.map((entity) => (
            <TabsTrigger key={entity.id} value={entity.id}>
              {entity.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {entities.map((entity) => (
          <TabsContent key={entity.id} value={entity.id}>
            <ScheduleEditor entity={entity} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
