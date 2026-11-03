/**
 * Task statuses (task_status enum) — one list for every form, filter and server check.
 *
 * TODO is shown as "Assigned" once someone is on the task and "Not started" while nobody is.
 * BLOCKED and WAITING_MATERIALS are "held" states: BLOCKED needs a reason, WAITING_MATERIALS may
 * carry one (what's missing). CANCELLED can only be set by a planner (the database enforces it).
 */
export const TASK_STATUSES = ["TODO", "ACCEPTED", "IN_PROGRESS", "WAITING_MATERIALS", "REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_LABELS: Record<TaskStatus, string> = {
  TODO: "Assigned",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  WAITING_MATERIALS: "Waiting for materials",
  REVIEW: "Review required",
  BLOCKED: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Statuses that still need someone to act. */
export const OPEN_TASK_STATUSES: TaskStatus[] = ["TODO", "ACCEPTED", "IN_PROGRESS", "WAITING_MATERIALS", "REVIEW", "BLOCKED"];
/** Work that can't move until something outside the team changes. */
export const HELD_TASK_STATUSES: TaskStatus[] = ["BLOCKED", "WAITING_MATERIALS"];
/** What a team member may set on their own part (planners can also cancel). */
export const STAFF_TASK_STATUSES: TaskStatus[] = ["TODO", "ACCEPTED", "IN_PROGRESS", "WAITING_MATERIALS", "REVIEW", "BLOCKED", "COMPLETED"];

export const taskLabel = (status: string, assigned = true) => (status === "TODO" && !assigned ? "Not started" : (TASK_LABELS[status as TaskStatus] ?? status));
export const isHeld = (status: string) => (HELD_TASK_STATUSES as string[]).includes(status);
export const isClosedTask = (status: string) => status === "COMPLETED" || status === "CANCELLED";
export const taskOptions = (list: readonly TaskStatus[] = TASK_STATUSES) => list.map((value) => ({ value, label: TASK_LABELS[value] }));
