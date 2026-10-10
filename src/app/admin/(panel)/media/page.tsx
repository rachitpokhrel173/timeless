import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { adminDb, all, cols, paged, pgrstValue, schema, tbl, type Row } from "@/db";
import { requirePage } from "@/lib/auth/session";
import { bytes } from "@/lib/format";
import { likeTerm, listParams } from "@/lib/list";
import UploadButton from "@/components/admin/Upload";
import { FilterSelect, SearchBox } from "@/components/admin/interactive";
import { Badge, Card, EmptyState, PageHeader, Pagination, Toolbar } from "@/components/admin/ui";
import { uploadMedia } from "../upload-actions";
import { MediaDeleteButton, MediaEditButton } from "./MediaClient";

export const metadata: Metadata = { title: "Media library" };

export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  const user = await requirePage();
  if (!user.permissions.has("cms.view") && !user.permissions.has("cms.manage")) await requirePage("cms.view");
  const manage = user.permissions.has("cms.manage");
  const sp = await searchParams;
  const { page, pageSize, offset, q, str } = listParams(sp, 48);

  let query = adminDb.from(tbl(schema.media)).select(cols(schema.media), { count: "exact" }).in("bucket", ["public-media", "static"]).is("deleted_at", null).like("mime", "image/%");
  if (str("folder")) query = query.eq("folder", str("folder")!);
  if (str("alt") === "missing") query = query.eq("alt", "");
  if (q) {
    const term = pgrstValue(likeTerm(q));
    query = query.or(`title.ilike.${term},alt.ilike.${term},filename.ilike.${term}`);
  }
  const [{ rows, total }, folders] = await Promise.all([
    paged<Row<typeof schema.media>>(query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1)),
    all<{ folder: string }>(() => adminDb.from(tbl(schema.media)).select("folder").is("deleted_at", null).in("bucket", ["public-media", "static"]).order("folder").order("id")),
  ]);
  const folderOptions = [...new Set(folders.map((f) => f.folder))].map((f) => ({ value: f, label: f }));

  return (
    <>
      <PageHeader
        title="Media library"
        description="Website photos. Uploads are resized, stripped of location data and converted to WebP automatically."
        back={{ href: "/admin/website", label: "Website CMS" }}
        actions={
          manage && (
            <UploadButton action={uploadMedia} fields={{}} label="Upload" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" success="Uploaded">
              <select name="folder" aria-label="Folder" defaultValue="Website" className="h-9 rounded-md border border-a-border bg-a-surface px-2 text-[13px]">
                {[...new Set(["Website", "Gallery", "Services", "Packages", "Testimonials", ...folderOptions.map((f) => f.value)])].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </UploadButton>
          )
        }
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchBox placeholder="Title, alt text or file name" />
          <FilterSelect param="folder" label="Folder" options={folderOptions} />
          <FilterSelect param="alt" label="Alt text" allLabel="Any" options={[{ value: "missing", label: "Missing" }]} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No images found" />
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
            {rows.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-lg border border-a-border">
                <div className="aspect-square bg-a-subtle">
                  {m.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                    <img src={m.url} alt={m.alt} loading="lazy" className="size-full object-cover" />
                  )}
                </div>
                <div className="flex items-start gap-1 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{m.title || m.filename}</p>
                    <p className="text-[11px] text-a-muted">
                      {m.folder}
                      {m.size ? ` · ${bytes(m.size)}` : ""}
                    </p>
                    {!m.alt && (
                      <Badge tone="warning" className="mt-1">
                        No alt text
                      </Badge>
                    )}
                  </div>
                  {manage && (
                    <span className="flex shrink-0">
                      <MediaEditButton values={m} />
                      {m.bucket !== "static" && <MediaDeleteButton id={m.id} />}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/admin/media" params={sp} page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
