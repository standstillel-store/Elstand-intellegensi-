const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta — fixed UTC+7, no DST

/**
 * Start of the current weekly cycle: the most recent Monday 00:00 WIB,
 * returned as the real UTC instant it corresponds to.
 *
 * This is used ONLY to tag rows (`week_start`) for organizational querying.
 * Retention cleanup (see store.ts) is purely time-based — created_at older
 * than 7 days gets deleted regardless of which week it's tagged with. Never
 * use this to truncate/reset data at the week boundary.
 */
export function currentWeekStartUtc(nowMs: number = Date.now()): Date {
  const wib = new Date(nowMs + WIB_OFFSET_MS);
  const day = wib.getUTCDay(); // 0=Sun..6=Sat, evaluated on WIB wall-clock time
  const sinceMonday = (day + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const mondayWibMidnightUtcMs = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() - sinceMonday, 0, 0, 0, 0);
  return new Date(mondayWibMidnightUtcMs - WIB_OFFSET_MS);
}
