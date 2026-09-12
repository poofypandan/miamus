import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgendaItem } from "@/lib/scheduleEngine";

function statusIcon(status: AgendaItem["status"]) {
  if (status === "completed") return "✅";
  if (status === "overdue") return "❌";
  return "⏳";
}

export function SummaryCard({ dogName, items }: { dogName: string; items: AgendaItem[] }) {
  const potty = items.filter((i) => i.title === "Pipis & Pup");
  const pottyDone = potty.filter((i) => i.status === "completed").length;
  const lunch = items.find((i) => i.title === "Makan Siang");
  const dinner = items.find((i) => i.title === "Makan Malam");

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{dogName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 px-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">💧 Potty</span>
          <span className="font-medium">
            {pottyDone}/{potty.length}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">🍖 Lunch</span>
          <span className="font-medium">{lunch ? statusIcon(lunch.status) : "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">🍖 Dinner</span>
          <span className="font-medium">{dinner ? statusIcon(dinner.status) : "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
