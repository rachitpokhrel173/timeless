import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, History, ListChecks, MapPin, MessageSquare, Package, Palette, Phone, Sparkles, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";
import { fmtDate, fmtDateTime, num, serverNow } from "@/lib/format";
import { isUuid } from "@/lib/list";
import { cn } from "@/lib/utils";
import { portalTaskDetail, requireStaffUser } from "@/server/staff-portal";
import { PRIORITY, StatusBadge, TASK_STATUS } from "@/components/admin/status";
import { Avatar, Notice } from "@/components/admin/ui";
import StaffTaskActions from "@/components/staff/StaffTaskActions";
import { TaskChecklist, TaskComments } from "@/app/admin/(panel)/events/WorkspaceClient";

export const metadata: Metadata = { title: "Task" };

const mapLink = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
type Photo = { src: string; alt: string };

/**
 * One assigned task, with everything needed to do it on site. Only the people on the task can
 * open it — anyone else gets a 404 whatever id they type (checked here, and by RLS in the database).
 */
export default async function StaffTaskPage({ params }: PageProps<"/staff/tasks/[taskId]">) {
  const user = await requireStaffUser();
  const { taskId } = await params;
  if (!isUuid(taskId)) notFound();
  const d = await portalTaskDetail(taskId, user);
  if (!d) notFound();
  const { task, event: e, workOrder: wo, design } = d;
  const now = serverNow();
  const late = !["COMPLETED", "REVIEW", "CANCELLED"].includes(d.myStatus) && task.dueAt && task.dueAt.getTime() < now;
  const place = e ? [e.venue, e.venueAddress].filter(Boolean).join(", ") : "";
  const working = !["COMPLETED", "CANCELLED"].includes(d.myStatus);

  return (
    <>
      <Link href="/staff" className="inline-flex items-center gap-1.5 text-[13px] text-a-muted hover:text-a-text">
        <ArrowLeft className="size-4" aria-hidden /> My work
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <h1 className="font-serif text-2xl leading-tight font-medium sm:text-3xl">{task.title}</h1>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge map={TASK_STATUS} value={d.myStatus} />
          <StatusBadge map={PRIORITY} value={task.priority} />
        </span>
      </div>
      {wo && <p className="mt-1 text-[13px] text-a-muted">Work order: {wo.title}</p>}

      <div className="mt-4 space-y-4">
        {late && (
          <Notice tone="danger" title="Past its deadline">
            This was due {fmtDateTime(task.dueAt)}. Finish it as soon as you can, or tell the office what&rsquo;s stopping you.
          </Notice>
        )}
        {(d.myStatus === "BLOCKED" || d.myStatus === "WAITING_MATERIALS") && d.myHoldReason && (
          <Notice tone="warning" title={d.myStatus === "BLOCKED" ? "On hold" : "Waiting for materials"}>
            {d.myHoldReason}
          </Notice>
        )}

        <section className="rounded-xl border border-a-border bg-a-surface p-4" aria-label="Update your progress">
          <StaffTaskActions id={task.id} title={task.title} status={d.myStatus} reviewRequired={task.reviewRequired} />
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Section title="Schedule" icon={Clock}>
              <dl className="grid grid-cols-2 gap-3 text-[14px]">
                <Item label="Start">{task.startDate ? fmtDate(task.startDate) : "—"}</Item>
                <Item label="Deadline">
                  <span className={cn(late && "font-medium text-a-danger")}>{task.dueAt ? fmtDateTime(task.dueAt) : "—"}</span>
                </Item>
              </dl>
            </Section>

            {(task.description || task.staffInstructions || wo?.instructions || wo?.description) && (
              <Section title="What needs doing" icon={Sparkles}>
                {task.description && <p className="text-[14px] leading-relaxed whitespace-pre-line">{task.description}</p>}
                {[task.staffInstructions, wo?.instructions].filter(Boolean).map((text, i) => (
                  <div key={i} className="mt-3 rounded-lg bg-a-gold-soft/50 px-4 py-3 first:mt-0">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-a-gold uppercase">{i === 0 && task.staffInstructions ? "Instructions" : "Work order instructions"}</p>
                    <p className="text-[14px] leading-relaxed whitespace-pre-line">{text}</p>
                  </div>
                ))}
                {wo?.description && !task.description && <p className="text-[14px] leading-relaxed whitespace-pre-line">{wo.description}</p>}
              </Section>
            )}

            {wo?.requiredMaterials && (
              <Section title="Materials needed" icon={Package}>
                <p className="text-[14px] leading-relaxed whitespace-pre-line">{wo.requiredMaterials}</p>
              </Section>
            )}

            {d.checklist.length > 0 && (
              <Section title="Checklist" icon={ListChecks}>
                <TaskChecklist taskId={task.id} items={d.checklist} canEdit={false} canTick={working} />
              </Section>
            )}

            {design && (
              <Section title={`Approved design: ${design.title}`} icon={Palette} hint={`Version ${design.version} — this is the final, client-approved design. Follow it.`}>
                {design.description && <p className="mb-3 text-[14px] whitespace-pre-line">{design.description}</p>}
                <dl className="mb-3 grid gap-2 text-[14px] sm:grid-cols-2">
                  {design.colorPalette && <Item label="Colours">{design.colorPalette}</Item>}
                  {design.flowers && <Item label="Flowers">{design.flowers}</Item>}
                  {design.stageLayout && <Item label="Stage layout">{design.stageLayout}</Item>}
                  {design.venueLayout && <Item label="Venue layout">{design.venueLayout}</Item>}
                  {design.notes && <Item label="Notes">{design.notes}</Item>}
                </dl>
                <Photos list={[...design.images, ...design.references]} />
              </Section>
            )}

            {d.references.length > 0 && (
              <Section title="Reference photos" icon={Palette} hint="Tap to open full size.">
                <Photos list={d.references} />
              </Section>
            )}

            {(d.proof.length > 0 || d.myNote) && (
              <Section title="Your completion evidence" icon={Sparkles}>
                {d.myNote && <p className="mb-3 text-[14px] whitespace-pre-line">&ldquo;{d.myNote}&rdquo;</p>}
                <Photos list={d.proof} />
              </Section>
            )}

            <Section title="Comments" icon={MessageSquare} hint="Talk to the planners about this task.">
              <TaskComments taskId={task.id} comments={d.comments.map((c) => ({ ...c, createdAt: fmtDateTime(c.createdAt) }))} canComment={d.myStatus !== "CANCELLED"} />
            </Section>
          </div>

          <div className="space-y-4">
            {e && (
              <Section title="Event" icon={CalendarDays}>
                <p className="mb-2 font-serif text-lg font-medium">{e.title}</p>
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
                      <Users className="mt-0.5 size-4 shrink-0 text-a-muted" aria-hidden /> {num(e.guestCount)} guests
                    </li>
                  ) : null}
                  {(e.theme || e.colorTheme) && (
                    <li className="flex items-start gap-2">
                      <Palette className="mt-0.5 size-4 shrink-0 text-a-muted" aria-hidden /> {[e.theme, e.colorTheme].filter(Boolean).join(" · ")}
                    </li>
                  )}
                </ul>
                {e.specialInstructions && <p className="mt-3 rounded-lg bg-a-subtle px-3 py-2 text-[13px] whitespace-pre-line">{e.specialInstructions}</p>}
              </Section>
            )}

            {d.manager && (
              <Section title="Event manager" icon={UserRound}>
                <p className="text-[14px] font-medium">{d.manager.fullName}</p>
                {d.manager.phone && (
                  <a href={`tel:${d.manager.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-[14px] text-a-accent hover:underline">
                    <Phone className="size-4" aria-hidden /> {d.manager.phone}
                  </a>
                )}
              </Section>
            )}

            <Section title="Team on this task" icon={Users}>
              <ul className="space-y-2.5">
                {d.team.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5 text-[14px]">
                    <Avatar name={m.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {m.name}
                        {m.me && <span className="font-normal text-a-muted"> (you)</span>}
                      </span>
                      {m.role && <span className="block text-xs text-a-muted">{m.role}</span>}
                    </span>
                    <StatusBadge map={TASK_STATUS} value={m.status} />
                  </li>
                ))}
                {d.team.length === 0 && <li className="text-[13px] text-a-muted">Assigned to you directly.</li>}
              </ul>
            </Section>

            {d.history.length > 0 && (
              <Section title="History" icon={History}>
                <ol className="space-y-2 border-l border-a-border pl-3 text-[13px]">
                  {d.history.map((h) => (
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
              </Section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, icon: Icon, hint, children }: { title: string; icon: typeof Clock; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-a-border bg-a-surface p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <Icon className="size-4 text-a-muted" aria-hidden /> {title}
      </h2>
      {hint && <p className="mt-0.5 text-[13px] text-a-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-a-muted">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}

function Photos({ list }: { list: Photo[] }) {
  if (!list.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {list.map((p) => (
        <a key={p.src} href={p.src} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed links from private storage */}
          <img src={p.src} alt={p.alt} className="aspect-square w-full rounded-lg border border-a-border object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}
