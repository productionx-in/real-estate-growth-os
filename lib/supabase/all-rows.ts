// lib/supabase/all-rows.ts — reads every row of a query in pages. The Supabase API returns at most 1,000 rows per request
// (max_rows), so a plain select silently stops there; totals built from it are wrong once a workspace grows past that.
// `page(from, to)` must build the same ordered query each time and apply .range(from, to).

export const PAGE_ROWS = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export async function allRows<T>(page: (from: number, to: number) => PageResult<T>, cap = 50_000): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < cap; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) throw new Error(error.message)
    const got = data ?? []
    rows.push(...got)
    if (got.length < PAGE_ROWS) break
  }
  return rows
}
