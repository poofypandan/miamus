import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MedicalRecord } from "@/types/database";

const TYPE_LABEL: Record<MedicalRecord["record_type"], string> = {
  vaccine: "Vaccine",
  vet: "Vet Visit",
  medication: "Medication",
};

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function HealthRecordCard({
  record,
  dogName,
}: {
  record: MedicalRecord;
  dogName: string;
}) {
  const due = record.next_due_date ? daysUntil(record.next_due_date) : null;

  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{record.title}</CardTitle>
          <Badge variant="secondary">{TYPE_LABEL[record.record_type]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{dogName}</span>
          {record.administered_at && <span>Given {record.administered_at}</span>}
        </div>
        {due !== null && (
          <Badge
            variant={due < 0 ? "destructive" : due <= 7 ? "default" : "outline"}
            className="w-fit"
          >
            {due < 0 ? `Overdue by ${Math.abs(due)}d` : due === 0 ? "Due today" : `Due in ${due}d`}
          </Badge>
        )}
        {record.notes && <p className="text-muted-foreground">{record.notes}</p>}
        {record.document_photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={record.document_photo_url}
            alt=""
            className="h-20 w-20 rounded-lg object-cover ring-1 ring-border"
          />
        )}
      </CardContent>
    </Card>
  );
}
