import { BASE_PATH } from "@/lib/base-path";
import { attachmentKind, formatBytes } from "@/lib/attachments";

export type AttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
};

/** Attachments on an issue or comment (#215): images inline, other files as links. */
export function AttachmentList({ attachments }: { attachments: AttachmentView[] }) {
  if (attachments.length === 0) return null;
  const href = (id: string) => `${BASE_PATH}/api/attachments/${id}`;
  const images = attachments.filter((a) => attachmentKind(a.contentType) === "image");
  const files = attachments.filter((a) => attachmentKind(a.contentType) !== "image");

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((a) => (
            <li key={a.id}>
              <figure className="overflow-hidden rounded-xl border border-zk-border bg-zk-surface">
                <a
                  href={href(a.id)}
                  target="_blank"
                  rel="noopener"
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
                  title={`${a.filename} (${formatBytes(a.size)})`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by our own auth-checked route */}
                  <img
                    src={href(a.id)}
                    alt={a.filename}
                    loading="lazy"
                    className="h-32 w-48 object-cover object-top"
                  />
                </a>
                <figcaption className="flex w-48 items-center justify-between gap-2 border-t border-zk-divider px-3 py-2 text-xs">
                  <span className="truncate font-medium text-zk-text">{a.filename}</span>
                  <span className="shrink-0 text-zk-muted">{formatBytes(a.size)}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((a) => (
            <li key={a.id}>
              <a
                href={href(a.id)}
                target="_blank"
                rel="noopener"
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-zk-border bg-zk-surface px-3 py-1.5 text-sm text-zk-text hover:bg-zk-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
              >
                <span aria-hidden="true" className="rounded bg-zk-chip px-1.5 py-0.5 text-[10px] font-semibold text-zk-text2">
                  {attachmentKind(a.contentType) === "pdf" ? "PDF" : "TXT"}
                </span>
                <span className="truncate">{a.filename}</span>
                <span className="shrink-0 text-xs text-zk-muted">{formatBytes(a.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
