"use server";

import { z } from "zod";
import { adminAction } from "@/lib/actions";
import { markRead } from "@/server/notifications";

/** Read receipts are per user (notification_reads); the list itself is filtered by permission. */
export const markNotificationsRead = adminAction(null, z.union([z.literal("all"), z.array(z.string().uuid()).min(1).max(500)]), async (ids, user) => {
  await markRead(user, ids);
});
