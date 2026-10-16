import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { fmtDate, npr } from "@/lib/format";
import { quoteTotals } from "@/lib/quote-math";
import { listQuoteTemplates } from "@/server/quote-templates";
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { DeleteTemplateButton, RenameTemplateButton } from "./TemplatesClient";

export const metadata: Metadata = { title: "Quotation templates" };

export default async function QuotationTemplatesPage() {
  const user = await requirePage("quotations.view");
  const canEdit = user.permissions.has("quotations.create");
  const templates = await listQuoteTemplates();

  return (
    <>
      <PageHeader
        title="Quotation templates"
        description="Saved line items and prices for the quotes you send most often. Start a quotation from one and adjust it for the client."
        back={{ href: "/admin/quotations", label: "Quotations" }}
      />
      <Card bodyClassName="p-0">
        {templates.length === 0 ? (
          <EmptyState icon={LayoutTemplate} title="No templates yet">
            Open any quotation and click <strong>Save as template</strong> — for example your standard wedding, reception or birthday package.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Template</Th>
                <Th>Lines</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Advance</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="align-top hover:bg-a-subtle/60">
                  <Td>
                    <span className="font-medium">{t.name}</span>
                    {t.description && <span className="block max-w-80 text-xs text-a-muted">{t.description}</span>}
                  </Td>
                  <Td className="text-xs">
                    {t.items.length} line{t.items.length === 1 ? "" : "s"}
                    <span className="block max-w-72 truncate text-a-muted">{t.items.map((l) => l.description).join(", ")}</span>
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{npr(quoteTotals(t).total)}</Td>
                  <Td className="text-right text-xs tabular-nums">{t.depositAmount ? npr(t.depositAmount) : "—"}</Td>
                  <Td className="text-xs text-a-muted">{fmtDate(t.updatedAt.slice(0, 10))}</Td>
                  <Td>
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <LinkButton href={`/admin/quotations/new?template=${t.id}`} size="sm" variant="primary" icon={LayoutTemplate}>
                          Use
                        </LinkButton>
                        <RenameTemplateButton id={t.id} name={t.name} description={t.description ?? ""} />
                        <DeleteTemplateButton id={t.id} name={t.name} />
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
