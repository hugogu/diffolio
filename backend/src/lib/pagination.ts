export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url')
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8')
}

export interface PageResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
  total?: number
}

export function paginate<T extends { id: string }>(
  items: T[],
  limit: number
): PageResult<T> {
  const hasMore = items.length > limit
  const page = hasMore ? items.slice(0, limit) : items
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1].id) : null
  return { items: page, nextCursor, hasMore }
}
