/**
 * The first-day line on a new staff member's Tugas Hari Ini (staff
 * onboarding step 8, owner decision 4): one quiet line, on the day they
 * joined only, gone once they tap it or finish a task. Kept on this phone
 * only (a convenience, never needed): who joined here and on which day,
 * removed once read or once the day is over (privacy policy, "Only on your
 * phone").
 */
const KEY = "miamus:first-day";

type FirstDay = { staffId: string; day: string };

function read(): FirstDay | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as FirstDay;
    return typeof value?.staffId === "string" && typeof value?.day === "string" ? value : null;
  } catch {
    return null;
  }
}

function write(value: FirstDay | null) {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private window or storage blocked: the line simply doesn't show.
  }
}

/** Today on this phone, YYYY-MM-DD. */
function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Called when a name is claimed from the welcome link: their first day starts. */
export function markFirstDay(staffId: string, now = new Date()) {
  write({ staffId, day: todayKey(now) });
}

/**
 * Whether this person, on this phone, should see the line today. A record
 * from another day is removed on the way (privacy policy: kept no longer
 * than the day).
 */
export function showsFirstDayLine(staffId: string | null, now = new Date()): boolean {
  const value = read();
  if (value && value.day !== todayKey(now)) {
    write(null);
    return false;
  }
  return !!staffId && !!value && value.staffId === staffId;
}

/** Tapped, or a task was finished: the record is removed. */
export function dismissFirstDayLine() {
  write(null);
}
