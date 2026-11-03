import "server-only";
import { redirect } from "next/navigation";
import { adminDb, cols, many, maybe, schema, tbl, type Row } from "@/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { assigneesFor } from "./assignments";
import { proofPhotos } from "./work";

/*
 * Data for the staff portal (/staff). Reads use the service-role client, so every function here
 * first narrows to the signed-in team member's own work: their active assignments, plus older
 * personal tasks given straight to their login. Nothing returned carries prices, payments,
 * customer contact details or colleagues' private details. Writes go through the shared server
 * actions, which run as the user (RLS and the task triggers apply).
 */

/**
 * Every portal page starts here: signed in, a team login (not a client-portal customer), and able
 * to work on tasks — a field-team login (tasks.update) or a back-office user linked to a team
 * member record.
 */
export async function requireStaffUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/staff/login");
  if (!user.isStaff) redirect("/client");
  if (!user.permissions.has("tasks.update") && !user.staffId) redirect("/admin");
  return user;
}

export type PortalEvent = {
  id: string;
  title: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  venueAddress: string | null;
};

type TaskCore = Pick<
  Row<typeof schema.eventTasks>,
  "id" | "title" | "status" | "priority" | "dueAt" | "startDate" | "reviewRequired" | "completedAt" | "assigneeUserId"
>;

export type PortalTask = TaskCore & {
  /** The viewer's own status on the task (their assignment), else the task's. */
  myStatus: string;
  myCompletedAt: Date | null;
  event: PortalEvent | null;
  workOrder: { title: string } | null;
};

const EVENT_COLS = "id,title,eventDate:event_date,startTime:start_time,endTime:end_time,venue,venueAddress:venue_address";
const TASK_COLS = `id,title,status,priority,dueAt:due_at,startDate:start_date,reviewRequired:review_required,completedAt:completed_at,assigneeUserId:assignee_user_id,e:events(${EVENT_COLS}),wo:work_orders(title)`;

type RawTask = Omit<TaskCore, "dueAt" | "completedAt"> & { dueAt: string | null; completedAt: string | null; e: PortalEvent | null; wo: { title: string } | null };
const toTask = (t: RawTask, mine: { status: string; completedAt: string | null } | null): PortalTask => ({
  ...t,
  dueAt: t.dueAt ? new Date(t.dueAt) : null,
  completedAt: t.completedAt ? new Date(t.completedAt) : null,
  myStatus: mine?.status ?? t.status,
  myCompletedAt: mine?.completedAt ? new Date(mine.completedAt) : t.completedAt ? new Date(t.completedAt) : null,
  event: t.e,
  workOrder: t.wo,
});

/** Everything open for the viewer, plus what they finished since `doneSince`. */
export async function myPortalTasks(user: SessionUser, doneSince: Date) {
  const since = doneSince.toISOString();
  const [assigned, personal] = await Promise.all([
    user.staffId
      ? many<{ status: string; completedAt: string | null; t: RawTask }>(
          adminDb
            .from(tbl(schema.eventTaskAssignees))
            .select(`status,completedAt:completed_at,t:event_tasks!inner(${TASK_COLS})`)
            .eq("staff_id", user.staffId)
            .is("removed_at", null)
            .or(`status.neq.COMPLETED,completed_at.gte.${since}`)
            .limit(500),
        )
      : [],
    many<RawTask>(
      adminDb
        .from(tbl(schema.eventTasks))
        .select(TASK_COLS)
        .eq("assignee_user_id", user.id)
        .or(`status.neq.COMPLETED,completed_at.gte.${since}`)
        .limit(500),
    ),
  ]);
  const out = new Map<string, PortalTask>();
  for (const a of assigned) out.set(a.t.id, toTask(a.t, a));
  for (const t of personal) if (!out.has(t.id)) out.set(t.id, toTask(t, null));
  // Cancelled work isn't the team's to do
  return [...out.values()].filter((t) => t.myStatus !== "CANCELLED" && t.status !== "CANCELLED");
}

type Photo = { src: string; alt: string };

/**
 * One task as its assignee sees it — or null when the viewer isn't on it (the page then 404s,
 * whatever id was typed).
 */
export async function portalTaskDetail(taskId: string, user: SessionUser) {
  const task = await maybe<
    Row<typeof schema.eventTasks> & {
      e: (PortalEvent & { guestCount: number | null; requirements: string | null; colorTheme: string | null; theme: string | null; specialInstructions: string | null; m: { fullName: string; phone: string | null } | null }) | null;
    }
  >(
    adminDb
      .from(tbl(schema.eventTasks))
      .select(
        `${cols(schema.eventTasks)},e:events(${EVENT_COLS},guestCount:guest_count,requirements,colorTheme:color_theme,theme,specialInstructions:special_instructions,m:profiles!manager_id(fullName:full_name,phone))`,
      )
      .eq("id", taskId),
  );
  if (!task) return null;
  const team = (await assigneesFor([taskId])).get(taskId) ?? [];
  const mine = user.staffId ? (team.find((a) => a.staffId === user.staffId) ?? null) : null;
  if (!mine && task.assigneeUserId !== user.id) return null;

  const [workOrder, checklist, comments, history] = await Promise.all([
    task.workOrderId
      ? maybe<{ id: string; title: string; description: string | null; instructions: string | null; requiredMaterials: string | null; designId: string | null; referenceMediaIds: string[] }>(
          adminDb
            .from(tbl(schema.workOrders))
            .select("id,title,description,instructions,requiredMaterials:required_materials,designId:design_id,referenceMediaIds:reference_media_ids")
            .eq("id", task.workOrderId),
        )
      : null,
    many<{ id: string; label: string; doneAt: string | null; doneBy: string | null }>(
      adminDb.from(tbl(schema.eventTaskChecklistItems)).select("id,label,doneAt:done_at,doneBy:done_by").eq("task_id", taskId).order("position").order("created_at"),
    ),
    many<{ id: string; body: string; mediaIds: string[]; createdAt: string; authorId: string | null; a: { fullName: string } | null }>(
      adminDb
        .from(tbl(schema.eventTaskComments))
        .select("id,body,mediaIds:media_ids,createdAt:created_at,authorId:author_id,a:profiles(fullName:full_name)")
        .eq("task_id", taskId)
        .is("deleted_at", null)
        .order("created_at"),
    ),
    many<{ id: string; kind: string; toStatus: string | null; note: string | null; createdAt: string; s: { name: string } | null; a: { fullName: string } | null }>(
      adminDb
        .from(tbl(schema.eventTaskUpdates))
        .select("id,kind,toStatus:to_status,note,createdAt:created_at,s:staff(name),a:profiles(fullName:full_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50),
    ),
  ]);

  // Only an APPROVED design is shown — a draft or proposal must never be mistaken for the final one
  const design = workOrder?.designId
    ? await maybe<{ id: string; title: string; description: string | null; status: string; version: number; mediaIds: string[]; referenceMediaIds: string[]; colorPalette: string | null; flowers: string | null; stageLayout: string | null; venueLayout: string | null; notes: string | null }>(
        adminDb
          .from(tbl(schema.designApprovals))
          .select("id,title,description,status,version,mediaIds:media_ids,referenceMediaIds:reference_media_ids,colorPalette:color_palette,flowers,stageLayout:stage_layout,venueLayout:venue_layout,notes")
          .eq("id", workOrder.designId)
          .eq("status", "APPROVED"),
      )
    : null;

  const myProof = mine ? mine.proofMediaIds : task.proofMediaIds;
  const photos = await proofPhotos([...task.referenceMediaIds, ...(workOrder?.referenceMediaIds ?? []), ...(design ? [...design.mediaIds, ...design.referenceMediaIds] : []), ...myProof, ...comments.flatMap((c) => c.mediaIds)]);
  const pics = (ids: string[]) => ids.map((id) => photos.get(id)).filter((p): p is Photo => !!p);

  return {
    task,
    event: task.e,
    manager: task.e?.m ?? null,
    mine,
    myStatus: mine?.status ?? task.status,
    myHoldReason: mine?.holdReason ?? task.blockedReason,
    myNote: mine?.completionNote ?? (mine ? null : task.completionNote),
    // Colleagues: name, role and progress only — no phone numbers or other private details
    team: team.map((a) => ({ id: a.id, name: a.s.name, role: a.s.role, status: a.status, me: a.staffId === user.staffId })),
    workOrder,
    design: design ? { ...design, images: pics(design.mediaIds), references: pics(design.referenceMediaIds) } : null,
    references: pics([...task.referenceMediaIds, ...(workOrder?.referenceMediaIds ?? [])]),
    proof: pics(myProof),
    checklist,
    comments: comments.map((c) => ({ id: c.id, body: c.body, author: c.a?.fullName ?? "Team", mine: c.authorId === user.id, createdAt: c.createdAt, photos: pics(c.mediaIds) })),
    history,
  };
}
export type PortalTaskDetail = NonNullable<Awaited<ReturnType<typeof portalTaskDetail>>>;

/** Notification links point at admin screens; send staff to the matching portal page instead. */
export function portalHref(href: string | null, user: SessionUser) {
  if (!href) return null;
  const task = href.match(/^\/admin\/my-work\/([0-9a-f-]{36})/i);
  if (task) return `/staff/tasks/${task[1]}`;
  if (href.startsWith("/admin/my-work")) return "/staff";
  if (href.startsWith("/staff")) return href;
  // Office screens only for people who can open them
  return [...user.permissions].some((p) => p !== "tasks.update" && p !== "dashboard.view") ? href : null;
}
