import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaItemRow } from "./agenda-item-row";
import { getTaskIcon } from "@/lib/task-icons";
import type { AgendaGroup } from "@/lib/scheduleEngine";

export function AgendaGroupCard({ group }: { group: AgendaGroup }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-lg">{getTaskIcon(group.title)}</span>
          <span>{group.time}</span>
          <span className="font-normal text-muted-foreground">· {group.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        {group.items.map((item) => (
          <AgendaItemRow key={item.key} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}
