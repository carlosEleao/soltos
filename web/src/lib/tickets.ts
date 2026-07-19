/**
 * Normalize optional ticket year for the unique key
 * (userId, providerKey, externalId, year).
 *
 * Postgres treats NULLs as distinct in unique indexes, so we store 0
 * when year is omitted — matching the upsert `where` clause.
 */
export function ticketYearKey(year?: number | null): number {
  return year ?? 0;
}
