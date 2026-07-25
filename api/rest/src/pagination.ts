export interface CursorPayload {
  index: number;
}

export function encodeCursor(index: number): string {
  return Buffer.from(JSON.stringify({ index })).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (typeof decoded.index !== "number") return null;
    return decoded;
  } catch {
    return null;
  }
}

export function setPaginationHeaders(
  res: { setHeader: (name: string, value: string | number) => void },
  basePath: string,
  total: number,
  pageSize: number,
  currentOffset: number,
  nextCursor: string | null,
  prevCursor: string | null,
): void {
  res.setHeader("X-Total-Count", total);
  res.setHeader("X-Page-Size", pageSize);

  const links: string[] = [];

  if (nextCursor) {
    links.push(`<${basePath}?cursor=${nextCursor}&limit=${pageSize}>; rel="next"`);
  }
  if (prevCursor) {
    links.push(`<${basePath}?cursor=${prevCursor}&limit=${pageSize}>; rel="prev"`);
  }
  if (currentOffset > 0) {
    const firstCursor = encodeCursor(0);
    links.push(`<${basePath}?cursor=${firstCursor}&limit=${pageSize}>; rel="first"`);
  }
  const lastOffset = Math.max(0, total - pageSize);
  if (lastOffset > 0 && currentOffset < lastOffset) {
    const lastCursor = encodeCursor(lastOffset);
    links.push(`<${basePath}?cursor=${lastCursor}&limit=${pageSize}>; rel="last"`);
  }

  if (links.length > 0) {
    res.setHeader("Link", links.join(", "));
  }
}

export const MAX_PAGE_SIZE = 1000;
export const DEFAULT_PAGE_SIZE = 50;
