"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Copy, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHousehold } from "@/context/household-context";
import type { CreateScheduleInput } from "@/lib/data";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { getTaskIcon } from "@/lib/task-icons";
import { formatTime12h } from "@/lib/time";
import type { TaskEntity, MasterSchedule } from "@/types/database";

const QUICK_TIMES = ["07:00", "12:00", "18:00", "20:00"];

function mealLabelForTime(time: string): string {
  const hour = Number(time.slice(0, 2));
  if (hour < 10) return "Sarapan";
  if (hour < 15) return "Makan Siang";
  if (hour < 19) return "Makan Malam";
  return "Snack Malam";
}

type CreateScheduleFn = (input: CreateScheduleInput) => Promise<MasterSchedule>;
type UpdateScheduleFn = (id: string, patch: Partial<MasterSchedule>) => Promise<MasterSchedule>;
type DeleteScheduleFn = (id: string) => Promise<void>;

export function ScheduleEditor({ entity }: { entity: TaskEntity }) {
  const { pets, schedules, createSchedule, updateSchedule, deleteSchedule } = useHousehold();
  const dogSchedules = schedules.filter((s) => s.entity_id === entity.id);
  const pottySchedule = dogSchedules.find((s) => s.frequency_type === "interval");
  const mealSchedules = dogSchedules.filter(
    (s) => s.frequency_type === "fixed_time" && !s.expires_at
  );
  const tempSchedules = dogSchedules.filter((s) => !!s.expires_at);

  return (
    <div className="flex flex-col gap-4">
      <PottyIntervalCard schedule={pottySchedule} onUpdate={updateSchedule} />
      <MealTimesCard
        entity={entity}
        meals={mealSchedules}
        createSchedule={createSchedule}
        deleteSchedule={deleteSchedule}
      />
      <TemporaryTasksCard
        entity={entity}
        tasks={tempSchedules}
        createSchedule={createSchedule}
        deleteSchedule={deleteSchedule}
      />
      <CopyScheduleCard
        entity={entity}
        entities={pets}
        sourceSchedules={dogSchedules}
        allSchedules={schedules}
        createSchedule={createSchedule}
        deleteSchedule={deleteSchedule}
      />
      <LivePreviewCard entity={entity} schedules={dogSchedules} />
    </div>
  );
}

function PottyIntervalCard({
  schedule,
  onUpdate,
}: {
  schedule?: MasterSchedule;
  onUpdate: UpdateScheduleFn;
}) {
  const [value, setValue] = useState(schedule?.interval_hours ?? 2);
  const [saving, setSaving] = useState(false);

  if (!schedule) return null;

  async function commit(next: number) {
    if (next === schedule!.interval_hours) return;
    setSaving(true);
    try {
      await onUpdate(schedule!.id, { interval_hours: next });
    } catch (err) {
      console.error(err);
      toast.error("Failed to update potty interval");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">💧 Potty Interval</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Every {value}h</span>
          <span>
            {schedule.start_time ? formatTime12h(schedule.start_time) : "—"} –{" "}
            {schedule.end_time ? formatTime12h(schedule.end_time) : "—"}
          </span>
        </div>
        <Slider
          min={1}
          max={4}
          step={1}
          value={[value]}
          disabled={saving}
          onValueChange={([v]) => setValue(v)}
          onValueCommit={([v]) => commit(v)}
        />
      </CardContent>
    </Card>
  );
}

function MealTimesCard({
  entity,
  meals,
  createSchedule,
  deleteSchedule,
}: {
  entity: TaskEntity;
  meals: MasterSchedule[];
  createSchedule: CreateScheduleFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const existingTimes = new Set(meals.map((m) => m.fixed_times?.[0]?.slice(0, 5)));
  const [busyTime, setBusyTime] = useState<string | null>(null);

  async function addTime(time: string) {
    if (existingTimes.has(time)) return;
    setBusyTime(time);
    try {
      await createSchedule({
        entity_id: entity.id,
        title: mealLabelForTime(time),
        module: "pet",
        frequency_type: "fixed_time",
        fixed_times: [time],
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to add meal time");
    } finally {
      setBusyTime(null);
    }
  }

  async function removeMeal(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove meal time");
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">🍖 Meal Times</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          {meals.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
              {m.fixed_times?.[0] ? formatTime12h(m.fixed_times[0]) : "—"} · {m.title}
              <button
                type="button"
                onClick={() => removeMeal(m.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {meals.length === 0 && (
            <p className="text-sm text-muted-foreground">No meal times yet.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TIMES.map((time) => {
            const exists = existingTimes.has(time);
            return (
              <Button
                key={time}
                type="button"
                size="sm"
                className="min-h-[48px]"
                variant={exists ? "ghost" : "outline"}
                disabled={exists || busyTime === time}
                onClick={() => addTime(time)}
              >
                {busyTime === time ? <Loader2 className="animate-spin" /> : <Plus />}
                {formatTime12h(time)}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TemporaryTasksCard({
  entity,
  tasks,
  createSchedule,
  deleteSchedule,
}: {
  entity: TaskEntity;
  tasks: MasterSchedule[];
  createSchedule: CreateScheduleFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("08:00");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!title || !expiresAt) {
      toast.error("Fill in a title and expiry date");
      return;
    }
    setSubmitting(true);
    try {
      await createSchedule({
        entity_id: entity.id,
        title,
        module: "pet",
        frequency_type: "fixed_time",
        fixed_times: [time],
        expires_at: expiresAt,
      });
      setTitle("");
      setExpiresAt("");
      toast.success("Temporary task added");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add temporary task");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove task");
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">🩺 Temporary Tasks</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {t.fixed_times?.[0] ? formatTime12h(t.fixed_times[0]) : "—"} · {t.title}
                </p>
                <p className="text-xs text-muted-foreground">Expires {t.expires_at}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => remove(t.id)}>
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">No temporary tasks.</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Task title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Give medication"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Expires on</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={submitting} className="min-h-[48px] w-fit">
          {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
          Add temporary task
        </Button>
      </CardContent>
    </Card>
  );
}

function CopyScheduleCard({
  entity,
  entities,
  sourceSchedules,
  allSchedules,
  createSchedule,
  deleteSchedule,
}: {
  entity: TaskEntity;
  entities: TaskEntity[];
  sourceSchedules: MasterSchedule[];
  allSchedules: MasterSchedule[];
  createSchedule: CreateScheduleFn;
  deleteSchedule: DeleteScheduleFn;
}) {
  const targets = entities.filter((e) => e.id !== entity.id);
  const [target, setTarget] = useState("");
  const [copying, setCopying] = useState(false);

  async function handleCopy() {
    if (!target) {
      toast.error("Choose a dog to copy to");
      return;
    }
    setCopying(true);
    try {
      const targetSchedules = allSchedules.filter((s) => s.entity_id === target);
      await Promise.all(targetSchedules.map((s) => deleteSchedule(s.id)));
      await Promise.all(
        sourceSchedules.map((s) =>
          createSchedule({
            entity_id: target,
            title: s.title,
            module: s.module,
            frequency_type: s.frequency_type,
            interval_hours: s.interval_hours,
            fixed_times: s.fixed_times,
            start_time: s.start_time,
            end_time: s.end_time,
            expires_at: s.expires_at,
          })
        )
      );
      toast.success(`Schedule copied to ${entities.find((e) => e.id === target)?.name}`);
      setTarget("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy schedule");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Copy Schedule</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 px-4">
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Copy to..." />
          </SelectTrigger>
          <SelectContent>
            {targets.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleCopy} disabled={copying || !target} variant="outline">
          {copying ? <Loader2 className="animate-spin" /> : <Copy />}
          Copy schedule to this dog
        </Button>
      </CardContent>
    </Card>
  );
}

function LivePreviewCard({
  entity,
  schedules,
}: {
  entity: TaskEntity;
  schedules: MasterSchedule[];
}) {
  const today = formatDateLocal(new Date());
  const groups = useMemo(
    () => buildAgenda({ date: today, entities: [entity], schedules, logs: [] }),
    [today, entity, schedules]
  );

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Today&apos;s Timeline</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks scheduled.</p>
        ) : (
          groups.map((g) => (
            <div key={`${g.time}-${g.title}`} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {formatTime12h(g.time)}
              </span>
              <span>{getTaskIcon(g.title)}</span>
              <span className="font-medium">{g.title}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
