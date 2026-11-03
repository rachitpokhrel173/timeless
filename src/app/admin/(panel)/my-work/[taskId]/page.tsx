import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, History, MapPin, Palette, PartyPopper, Users } from "lucide-react";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, fmtTime, num, qty, serverNow } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { cn } from "@/lib/utils";
import { assigneesFor } from "@/server/assignments";
import { eventTypeName, eventTypeOptions } from "@/server/lookups";
import { proofPhotos } from "@/server/work";
import { PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Avatar, Card, DetailList, LinkButton, Notice, PageHeader } from "@/components/admin/ui";
import { WorkTaskActions } from "../WorkClient";
import { TaskChecklist, TaskComments } from "../../events/WorkspaceClient";
import { isClosedTask, isHeld, taskLabel } from "@/lib/task-status";

export const metadata: Metadata = { title: "Task" };

type TaskDetail = Row<typeof schema.eventTasks> & {
  e: {
    id: string;
    title: string;
    eventType: string | null;
    eventDate: string;
    startTime: string | null;
    endTime: string | null;
    startAt: Date;
    venue: string | null;
    venueAddress: string | null;
    guestCount: number | null;
    requirements: string | null;
    colorTheme: string | null;
    b: { id: string; number: string } | null;
    c: { name: string } | null;
  } | null;
};
type Update = { id: string; kind: string; toStatus: string | null; note: string | null; createdAt: Date; s: { name: string } | null; a: { fullName: string } | null };
const mapLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/**
 * One task, as the team sees it. Open to planners and to the people on it — anyone else gets a
 * 404, whatever id they type (the check is here on the server, and RLS backs it in the database).
 */
export default async function TaskDetailPage({ params }: PageProps<"/admin/my-work/[taskId]">) {
  const user = await requirePage();
  const { taskId } = await params;
  if (!isUuid(taskId)) notFound();
  const planner = user.permissions.has("events.view");
  if (!planner && !user.permissions.has("tasks.update")) notFound();

  const task = await maybe<TaskDetail>(
    adminDb
      .from(tbl(schema.eventTasks))
      .select(
        `${cols(schema.eventTasks)},e:events(id,title,eventType:event_type,eventDate:event_date,startTime:start_time,endTime:end_time,startAt:start_at,venue,venueAddress:venue_address,guestCount:guest_count,requirements,colorTheme:color_theme,b:bookings(id,number),c:customers(name))`,
      )
      .eq("id", taskId),
  );
  if (!task) notFound();
  const team = (await assigneesFor([taskId])).get(taskId) ?? [];
  const mine = user.staffId ? (team.find((a) => a.staffId === user.staffId) ?? null) : null;
  if (!planner && !mine && task.assigneeUserId !== user.id) notFound();

  const [items, history, internal, types] = await Promise.all([
    // Quantities only — the team never sees prices
    task.e?.b ? many<{ id: string; description: string; quantity: number; unit: string | null }>(adminDb.from(tbl(schema.bookingItems)).select("id,description,quantity,unit").eq("booking_id", task.e.b.id).order("position")) : [],
    many<Update>(
      adminDb
        .from(tbl(schema.eventTaskUpdates))
        .select("id,kind,toStatus:to_status,note,createdAt:created_at,s:staff(name),a:profiles(fullName:full_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
    planner ? maybe<{ notes: string }>(adminDb.from(tbl(schema.eventTaskInternal)).select("notes").eq("task_id", taskId)) : null,
    eventTypeOptions(),
  ]);
  const [checklist, comments, workOrder] = await Promise.all([
    many<{ id: string; label: string; doneAt: Date | null; doneBy: string | null }>(
      adminDb.from(tbl(schema.eventTaskChecklistItems)).select("id,label,doneAt:done_at,doneBy:done_by").eq("task_id", taskId).order("position"),
    ),
    many<{ id: string; body: string; mediaIds: string[]; authorId: string | null; createdAt: Date; p: { fullName: string } | null }>(
      adminDb.from(tbl(schema.eventTaskComments)).select("id,body,mediaIds:media_ids,authorId:author_id,createdAt:created_at,p:profiles(fullName:full_name)").eq("task_id", taskId).is("deleted_at", null).order("created_at"),
    ),
    task.workOrderId
      ? maybe<{ title: string; instructions: string | null; requiredMaterials: string | null; status: string }>(
          adminDb.from(tbl(schema.workOrders)).select("title,instructions,requiredMaterials:required_materials,status").eq("id", task.workOrderId),
        )
      : null,
  ]);
  const commentPhotos = await proofPhotos(comments.flatMap((c) => c.mediaIds));
  const myProof = mine?.proofMediaIds ?? (mine ? [] : task.proofMediaIds);
  const photos = await proofPhotos([...task.referenceMediaIds, ...myProof, ...(planner ? team.flatMap((a) => a.proofMediaIds) : [])]);
  const refs = task.referenceMediaIds.map((id) => photos.get(id)).filter((p): p is { src: string; alt: string } => !!p);
  const proof = [...myProof, ...(planner && !mine ? team.flatMap((a) => a.proofMediaIds) : [])].map((id) => photos.get(id)).filter((p): p is { src: string; alt: string } => !!p);

  const status = mine?.status ?? task.status;
  const late = !isClosedTask(status) && task.dueAt && task.dueAt.getTime() < serverNow();
  const canAct = !!mine || task.assigneeUserId === user.id || user.permissions.has("events.update");
  const e = task.e;
  const place = e ? [e.venue, e.venueAddress].filter(Boolean).join(", ") : "";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/my-work", label: "My work" }}
        eyebrow={[e?.b?.number, e && eventTypeName(types, e.eventType)].filter(Boolean).join(" · ") || "Task"}
        title={task.title}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge map={TASK_STATUS} value={status} />
            <StatusBadge map={PRIORITY} value={task.priority} />
            {planner && e?.b && <LinkButton href={`/admin/work/${e.b.id}`} size="sm">Work plan</LinkButton>}
          </span>
        }
      />

      <div className="space-y-4">
        {late && (
          <Notice tone="danger" title="Past its deadline">
            This was due {fmtDateTime(task.dueAt)}.
          </Notice>
        )}
        {isHeld(status) && (mine?.holdReason ?? task.blockedReason) && (
          <Notice tone="warning" title={taskLabel(status)}>
            {mine?.holdReason ?? task.blockedReason}
          </Notice>
        )}
        {mine === null && planner && !task.assigneeUserId && team.length > 0 && <Notice title="You're viewing as a planner">Status changes here apply to everyone on the task.</Notice>}

        {canAct && (
          <div className="rounded-xl border border-a-border bg-a-surface p-4">
            <p className="mb-3 text-[13px] text-a-muted">
              {status === "TODO"
                ? "Accept the task so the planner knows it's in hand."
                : status === "COMPLETED"
                  ? "Finished — you can still add photos."
                  : status === "CANCELLED"
                    ? "This task was cancelled by a planner."
                    : status === "REVIEW"
                      ? "Waiting for a planner to review your work."
                      : "Update your progress as you go."}
            </p>
            <WorkTaskActions id={task.id} title={task.title} status={status} large />
          </div>
        )}

        {workOrder && (
          <Card title={`Work order: ${workOrder.title}`}>
            <DetailList
              columns={1}
              items={[
                ["Instructions", workOrder.instructions ? <span key="i" className="whitespace-pre-line">{workOrder.instructions}</span> : null],
                ["Materials", workOrder.requiredMaterials ? <span key="m" className="whitespace-pre-line">{workOrder.requiredMaterials}</span> : null],
              ]}
            />
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {(checklist.length > 0 || user.permissions.has("events.update")) && (
            <Card title="Checklist">
              <TaskChecklist taskId={task.id} items={checklist} canEdit={user.permissions.has("events.update")} canTick={canAct && status !== "CANCELLED"} />
            </Card>
          )}
          <Card title="Comments" description="Questions and updates for the team and planners.">
            <TaskComments
              taskId={task.id}
              canComment={canAct}
              comments={comments.map((c) => ({
                id: c.id,
                body: c.body,
                author: c.p?.fullName ?? "Team",
                mine: c.authorId === user.id,
                createdAt: fmtDateTime(c.createdAt),
                photos: c.mediaIds.map((m) => commentPhotos.get(m)).filter((x): x is { src: string; alt: string } => !!x),
              }))}
            />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Card title="Schedule">
              <DetailList
                items={[
                  ["Start", task.startDate ? fmtDate(task.startDate) : null],
                  ["Deadline", task.dueAt ? <span key="d" className={cn(late && "font-medium text-a-danger")}>{fmtDateTime(task.dueAt)}</span> : null],
                  ["Event date", e ? fmtDate(e.eventDate) : null],
                  ["Setup from", e ? fmtTime(e.startAt) : null],
                ]}
              />
            </Card>

            {(task.description || task.staffInstructions) && (
              <Card title="What needs doing">
                {task.description && <p className="text-[14px] leading-relaxed whitespace-pre-line">{task.description}</p>}
                {task.staffInstructions && (
                  <div className={cn("rounded-lg bg-a-gold-soft/50 px-4 py-3", task.description && "mt-4")}>
                    <p className="mb-1 text-xs font-semibold tracking-wide text-a-gold uppercase">Instructions</p>
                    <p className="text-[14px] leading-relaxed whitespace-pre-line">{task.staffInstructions}</p>
                  </div>
                )}
              </Card>
            )}

            {refs.length > 0 && (
              <Card title="Reference images" description="Tap to open full size.">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {refs.map((p) => (
                    <a key={p.src} href={p.src} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links */}
                      <img src={p.src} alt={p.alt} className="aspect-square w-full rounded-lg border border-a-border object-cover" />
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {(e?.requirements || items.length > 0) && (
              <Card title="Decoration requirements" bodyClassName={items.length ? "p-0" : undefined}>
                {e?.requirements && <p className={cn("text-[14px] whitespace-pre-line", items.length > 0 && "border-b border-a-border px-4 py-3")}>{e.requirements}</p>}
                {items.length > 0 && (
                  <ul className="divide-y divide-a-border text-[14px]">
                    {items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3 px-4 py-2.5">
                        <span>{i.description}</span>
                        <span className="shrink-0 text-a-muted tabular-nums">
                          {qty(i.quantity)} {i.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {(proof.length > 0 || (mine?.completionNote ?? (!mine ? task.completionNote : null))) && (
              <Card title={mine ? "Your completion" : "Completion"}>
                {(mine?.completionNote ?? (!mine ? task.completionNote : null)) && <p className="mb-3 text-[14px] whitespace-pre-line">“{mine?.completionNote ?? task.completionNote}”</p>}
                {proof.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {proof.map((p) => (
                      <a key={p.src} href={p.src} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links */}
                        <img src={p.src} alt={p.alt} className="aspect-square w-full rounded-lg border border-a-border object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {planner && internal?.notes && (
              <Card title="Internal notes" description="Planners only — the team doesn't see this.">
                <p className="text-[14px] whitespace-pre-line">{internal.notes}</p>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {e && (
              <Card title="Event" actions={<PartyPopper className="size-4 text-a-gold" aria-hidden />}>
                <p className="mb-3 font-serif text-lg font-medium">{e.title}</p>
                <ul className="space-y-2 text-[14px]">
                  <li className="flex items-start gap-2">
                    <CalendarDays className="mt-0.5 size-4 shrink-0 text-a-muted" aria-hidden />
                    <span>
                      {fmtDate(e.eventDate)}
                      {e.startTime && ` · ${e.startTime.slice(0, 5)}${e.endTime ? `–${e.endTime.slice(0, 5)}` : ""}`}
                    </span>
                  </li>
                  {place && (
                    <li className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-a-muted" aria-hidden />
                      <a href={mapLink(place)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {place}
                      </a>
                    </li>
                  )}
                  {e.guestCount ? (
                    <li className="flex items-start gap-2">
                      <Users className="mt-0.5 size-4 shrink-0 text-a-muted" aria-hidden />
                      {num(e.guestCount)} guests
                    </li>
                  ) : null}
                  {e.colorTheme && (
                    <li className="flex items-start gap-2">
                      <Palette className="mt-0.5 size-4 shrink-0 text-a-muted" aria-hidden />
                      {e.colorTheme}
                    </li>
                  )}
                  {e.c && (
                    <li className="flex items-start gap-2">
                      <Clock className="mt-0.5 size-4 shrink-0 text-a-muted" aria-hidden />
                      Client: {e.c.name}
                    </li>
                  )}
                </ul>
              </Card>
            )}

            <Card title="Team on this task">
              {team.length === 0 ? (
                <p className="text-[13px] text-a-muted">{task.assigneeUserId ? "Assigned to one person." : "Nobody assigned yet."}</p>
              ) : (
                <ul className="space-y-2.5">
                  {team.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5 text-[14px]">
                      {a.s.photo?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small public avatar
                        <img src={a.s.photo.url} alt="" className="size-8 rounded-full object-cover" />
                      ) : (
                        <Avatar name={a.s.name} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {a.s.name}
                          {a.staffId === user.staffId && <span className="font-normal text-a-muted"> (you)</span>}
                        </span>
                        {a.s.role && <span className="block text-xs text-a-muted">{a.s.role}</span>}
                      </span>
                      <StatusBadge map={TASK_STATUS} value={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {history.length > 0 && (
              <Card title="History" actions={<History className="size-4 text-a-muted" aria-hidden />}>
                <ol className="space-y-2 border-l border-a-border pl-3 text-[13px]">
                  {history.map((h) => (
                    <li key={h.id}>
                      <p className="text-xs text-a-muted">{fmtDateTime(h.createdAt)}</p>
                      <p>
                        {h.kind === "STATUS" ? (
                          <>
                            {h.s?.name ?? h.a?.fullName ?? "Planner"} → <span className="font-medium">{TASK_STATUS[h.toStatus ?? ""]?.label ?? h.toStatus}</span>
                          </>
                        ) : (
                          <>
                            {h.s?.name} {h.kind === "ASSIGNED" ? "was assigned" : "was taken off the task"}
                          </>
                        )}
                      </p>
                      {h.note && <p className="text-a-muted">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
