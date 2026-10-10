import { PhoneCall, X } from "lucide-react";
import { adminDb, cols, many, schema, tbl, type Row } from "@/db";
import { fmtDateTime, todayISO } from "@/lib/format";
import { userOptions } from "@/server/lookups";
import { cancelFollowup } from "@/app/admin/(panel)/leads/actions";
import { AddFollowupButton, CompleteFollowupButton, EditFollowupButton } from "@/app/admin/(panel)/leads/LeadClient";
import { ConfirmButton } from "./interactive";
import { FOLLOWUP_STATUS, PRIORITY, StatusBadge } from "./status";
import { Card, EmptyState } from "./ui";

type Owner = { leadId?: string; inquiryId?: string; customerId?: string };

/** Follow-ups for a lead, inquiry or customer, with scheduling, rescheduling and completion. */
export default async function FollowUps({ owner, canEdit }: { owner: Owner; canEdit: boolean }) {
  const conds: string[] = [];
  if (owner.leadId) conds.push(`lead_id.eq.${owner.leadId}`);
  if (owner.inquiryId) conds.push(`inquiry_id.eq.${owner.inquiryId}`);
  if (owner.customerId) conds.push(`customer_id.eq.${owner.customerId}`);
  const mine = () => adminDb.from(tbl(schema.followups)).select(cols(schema.followups)).or(conds.join(","));
  const [open, closed, users] = await Promise.all([
    many<Row<typeof schema.followups>>(mine().in("status", ["PENDING", "OVERDUE"]).order("due_at")),
    many<Row<typeof schema.followups>>(mine().not("status", "in", "(PENDING,OVERDUE)").order("updated_at", { ascending: false }).limit(10)),
    userOptions(),
  ]);
  const name = (id: string | null) => users.find((u) => u.value === id)?.label;
  const now = new Date();
  const typeName = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

  return (
    <Card title="Follow-ups" actions={canEdit && <AddFollowupButton owner={owner} users={users} defaultDate={todayISO(1)} />}>
      {open.length === 0 && closed.length === 0 ? (
        <EmptyState compact icon={PhoneCall} title="No follow-ups scheduled" />
      ) : (
        <ul className="divide-y divide-a-border">
          {open.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                  {typeName(x.type)} · {fmtDateTime(x.dueAt)}
                  <StatusBadge map={FOLLOWUP_STATUS} value={x.status === "PENDING" && x.dueAt < now ? "OVERDUE" : x.status} />
                  {(x.priority === "HIGH" || x.priority === "URGENT") && <StatusBadge map={PRIORITY} value={x.priority} />}
                </p>
                {x.note && <p className="text-xs text-a-muted">{x.note}</p>}
                {name(x.assignedTo) && <p className="text-xs text-a-muted">Assigned to {name(x.assignedTo)}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <CompleteFollowupButton id={x.id} />
                  <EditFollowupButton
                    owner={owner}
                    users={users}
                    values={{
                      id: x.id,
                      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(x.dueAt),
                      time: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit", hour12: false }).format(x.dueAt),
                      type: x.type,
                      priority: x.priority,
                      note: x.note,
                      assignedTo: x.assignedTo,
                    }}
                  />
                  <ConfirmButton action={cancelFollowup.bind(null, { id: x.id })} title="Cancel this follow-up?" confirmLabel="Cancel follow-up" success="Follow-up cancelled" size="icon-sm" icon={<X />}>
                    <span className="sr-only">Cancel follow-up</span>
                  </ConfirmButton>
                </div>
              )}
            </li>
          ))}
          {closed.map((x) => (
            <li key={x.id} className="py-2.5 text-[13px] text-a-muted">
              <span className="flex flex-wrap items-center gap-2">
                <span className={x.status === "COMPLETED" ? "line-through" : undefined}>
                  {typeName(x.type)} · {fmtDateTime(x.dueAt)}
                </span>
                <StatusBadge map={FOLLOWUP_STATUS} value={x.status} />
              </span>
              {x.outcome && <span className="block text-xs">Outcome: {x.outcome}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
