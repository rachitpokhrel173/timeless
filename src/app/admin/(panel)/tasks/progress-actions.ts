"use server";

import { z } from "zod";
import { db, exec, maybe, schema, tbl } from "@/db";
import { adminAction, UserError, zs } from "@/lib/actions";
import { audit } from "@/lib/audit";

/**
 * Phase 2: mark a task optional (left out of event / work-order progress) or required again.
 * Planners only; runs as the planner so RLS applies (staff can't change it — tested in test-phase2).
 */
export const setTaskRequired = adminAction("events.update", z.object({ id: zs.uuid(), required: z.boolean() }), async ({ id, required }, user) => {
  const t = await maybe<{ title: string }>(db.from(tbl(schema.eventTasks)).select("title").eq("id", id));
  if (!t) throw new UserError("Task not found.");
  await exec(db.from(tbl(schema.eventTasks)).update({ counts_toward_progress: required }).eq("id", id));
  await audit(user, "update", "task", id, `“${t.title}” is now ${required ? "required" : "optional (not counted in progress)"}`);
});
