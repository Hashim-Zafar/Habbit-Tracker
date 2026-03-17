import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Flame,
  Lock,
  RotateCcw,
  Trophy,
  Target,
  Calendar,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

type HabitKey = "noSugar" | "noProcessedFood" | "noJunkFood" | "noGonning";

type Habit = {
  key: HabitKey;
  label: string;
  short: string;
};

type DayProgress = Record<HabitKey, boolean>;

type ProgressMap = Record<string, DayProgress>;

type DayItem = {
  key: string;
  label: string;
  weekday: string;
  monthLabel: string;
  fullDate: string;
};

type VisibleDayItem = DayItem & {
  entry: DayProgress;
};

type CheatInfo = {
  daysAgo: number | null;
  label: string;
  dateKey: string | null;
};

type StatCardProps = {
  label: string;
  value: string;
  subtext: string;
  icon?: LucideIcon;
};

type MiniCardProps = {
  title: string;
  value: string;
  note: string;
};

const HABITS: Habit[] = [
  { key: "noSugar", label: "No Sugar", short: "Sugar" },
  { key: "noProcessedFood", label: "No Processed Food", short: "Processed" },
  { key: "noJunkFood", label: "No Junk Food", short: "Junk" },
  { key: "noGonning", label: "No Gonning", short: "Gonning" },
];

const STORAGE_KEY = "lock-in-habit-tracker-v2";
const DEFAULT_VISIBLE_DAYS = 30;
const HEATMAP_DAYS = 140;

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayKey(): string {
  return getDateKey(new Date());
}

function getDateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getLastNDays(n: number): DayItem[] {
  const days: DayItem[] = [];
  const today = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    days.push({
      key: getDateKey(d),
      label: d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      monthLabel: d.toLocaleDateString(undefined, { month: "short" }),
      fullDate: d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    });
  }

  return days;
}

function createEmptyDay(): DayProgress {
  return {
    noSugar: false,
    noProcessedFood: false,
    noJunkFood: false,
    noGonning: false,
  };
}

function getCompletedCount(entry?: DayProgress): number {
  return HABITS.filter((habit) => entry?.[habit.key]).length;
}

function isPerfectDay(entry?: DayProgress): boolean {
  return HABITS.every((habit) => entry?.[habit.key]);
}

function isAnyHabitChecked(entry?: DayProgress): boolean {
  return HABITS.some((habit) => entry?.[habit.key]);
}

function normalizeProgress(rawProgress: unknown): ProgressMap {
  if (!rawProgress || typeof rawProgress !== "object") return {};

  const normalized: ProgressMap = {};

  for (const [dateKey, value] of Object.entries(
    rawProgress as Record<string, unknown>,
  )) {
    normalized[dateKey] = {
      ...createEmptyDay(),
      ...((value && typeof value === "object"
        ? value
        : {}) as Partial<DayProgress>),
    };
  }

  return normalized;
}

function getLongestPerfectStreak(progress: ProgressMap): number {
  const keys = Object.keys(progress).sort();
  let longest = 0;
  let current = 0;
  let previousDate: Date | null = null;

  for (const key of keys) {
    const entry = progress[key];

    if (!isPerfectDay(entry)) {
      current = 0;
      previousDate = getDateFromKey(key);
      continue;
    }

    const currentDate = getDateFromKey(key);

    if (!previousDate) {
      current = 1;
    } else {
      const diffInDays = Math.round(
        (currentDate.getTime() - previousDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      current = diffInDays === 1 ? current + 1 : 1;
    }

    longest = Math.max(longest, current);
    previousDate = currentDate;
  }

  return longest;
}

function getCurrentPerfectStreak(progress: ProgressMap): number {
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 3650; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = getDateKey(d);
    const entry = progress[key];

    if (entry && isPerfectDay(entry)) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function formatRelativeDays(daysAgo: number): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "1 day ago";
  return `${daysAgo} days ago`;
}

function getLastCheatInfo(
  progress: ProgressMap,
  habitKey: HabitKey,
): CheatInfo {
  const today = new Date();

  for (let i = 0; i < 3650; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = getDateKey(d);
    const entry = progress[dateKey];

    if (entry && entry[habitKey] === false) {
      return {
        daysAgo: i,
        label: formatRelativeDays(i),
        dateKey,
      };
    }
  }

  return {
    daysAgo: null,
    label: "No cheat logged yet",
    dateKey: null,
  };
}

export default function HabitTrackerApp(): React.JSX.Element {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [mounted, setMounted] = useState<boolean>(false);
  const [daysVisible, setDaysVisible] = useState<number>(DEFAULT_VISIBLE_DAYS);
  const [zeroCheatMode, setZeroCheatMode] = useState<boolean>(true);

  const todayKey = getTodayKey();
  const visibleDays = useMemo<DayItem[]>(
    () => getLastNDays(daysVisible),
    [daysVisible],
  );
  const heatmapDays = useMemo<DayItem[]>(() => getLastNDays(HEATMAP_DAYS), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setProgress(normalizeProgress(JSON.parse(saved)));
      }
    } catch (error) {
      console.error("Failed to load tracker data", error);
    } finally {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress, mounted]);

  function isLockedDay(dateKey: string): boolean {
    if (!zeroCheatMode) return false;
    return dateKey < todayKey;
  }

  function toggleHabit(dateKey: string, habitKey: HabitKey): void {
    if (isLockedDay(dateKey)) return;

    setProgress((prev) => {
      const currentDay = prev[dateKey] || createEmptyDay();

      return {
        ...prev,
        [dateKey]: {
          ...currentDay,
          [habitKey]: !currentDay[habitKey],
        },
      };
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA";
      if (isTyping) return;

      const index = Number(event.key) - 1;
      if (index >= 0 && index < HABITS.length) {
        toggleHabit(todayKey, HABITS[index].key);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [todayKey, zeroCheatMode, progress]);

  const todayProgress = progress[todayKey] || createEmptyDay();
  const completedToday = getCompletedCount(todayProgress);

  const trackedEntries = Object.entries(progress).filter(([, entry]) =>
    isAnyHabitChecked(entry),
  );
  const totalDaysTracked = trackedEntries.length;

  const perfectDaysLifetime = trackedEntries.filter(([, entry]) =>
    isPerfectDay(entry),
  ).length;
  const totalChecksLifetime = trackedEntries.reduce(
    (sum, [, entry]) => sum + getCompletedCount(entry),
    0,
  );
  const disciplineScore = totalDaysTracked
    ? Math.round(
        (totalChecksLifetime / (totalDaysTracked * HABITS.length)) * 100,
      )
    : 0;

  const visibleEntries = visibleDays.map<VisibleDayItem>((day) => ({
    ...day,
    entry: progress[day.key] || createEmptyDay(),
  }));

  const visiblePerfectDays = visibleEntries.filter(({ entry }) =>
    isPerfectDay(entry),
  ).length;
  const currentPerfectStreak = useMemo<number>(
    () => getCurrentPerfectStreak(progress),
    [progress],
  );
  const longestPerfectStreak = useMemo<number>(
    () => getLongestPerfectStreak(progress),
    [progress],
  );

  const monthPerformance = useMemo<number>(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const currentMonthEntries = Object.entries(progress).filter(
      ([key, entry]) => {
        if (!isAnyHabitChecked(entry)) return false;
        const date = getDateFromKey(key);
        return (
          date.getMonth() === currentMonth && date.getFullYear() === currentYear
        );
      },
    );

    if (!currentMonthEntries.length) return 0;

    const checks = currentMonthEntries.reduce(
      (sum, [, entry]) => sum + getCompletedCount(entry),
      0,
    );

    return Math.round(
      (checks / (currentMonthEntries.length * HABITS.length)) * 100,
    );
  }, [progress]);

  const heatmapWeeks = useMemo<DayItem[][]>(
    () => chunkArray(heatmapDays, 7),
    [heatmapDays],
  );

  const lastCheatStats = useMemo(
    () =>
      HABITS.map((habit) => ({
        ...habit,
        cheat: getLastCheatInfo(progress, habit.key),
      })),
    [progress],
  );

  function resetToday(): void {
    setProgress((prev) => ({
      ...prev,
      [todayKey]: createEmptyDay(),
    }));
  }

  function loadOlder(): void {
    setDaysVisible((prev) => prev + 30);
  }

  function getHeatmapTone(entry: DayProgress): string {
    const completed = getCompletedCount(entry);

    if (completed === 0) return "bg-white/5 border-white/10";
    if (completed === 1) return "bg-emerald-950/80 border-emerald-900";
    if (completed === 2) return "bg-emerald-900/80 border-emerald-800";
    if (completed === 3) return "bg-emerald-700/80 border-emerald-600";
    return "bg-emerald-400 border-emerald-300";
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
        <p className="text-sm text-neutral-400">Loading tracker...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.25em] text-neutral-400">
                Lock Back In
              </p>
              <h1 className="text-3xl font-bold sm:text-4xl">
                Daily Discipline Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-neutral-400 sm:text-base">
                Track your clean days, protect your streak, and see your
                discipline pattern at a glance.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setZeroCheatMode((prev) => !prev)}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                  zeroCheatMode
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                <Lock size={16} />
                {zeroCheatMode ? "Zero-Cheat Mode On" : "Zero-Cheat Mode Off"}
              </button>

              <button
                onClick={resetToday}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/15"
              >
                <RotateCcw size={16} />
                Reset Today
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Completed Today"
            value={`${completedToday}/4`}
            subtext="Daily target"
            icon={Target}
          />
          <StatCard
            label="Days Tracked"
            value={`${totalDaysTracked}`}
            subtext="Lifetime"
            icon={Calendar}
          />
          <StatCard
            label="Discipline Score"
            value={`${disciplineScore}%`}
            subtext="All tracked days"
            icon={Flame}
          />
          <StatCard
            label="Current Streak"
            value={`${currentPerfectStreak}`}
            subtext="Perfect days in a row"
            icon={Check}
          />
          <StatCard
            label="Longest Streak"
            value={`${longestPerfectStreak}`}
            subtext="Best run so far"
            icon={Trophy}
          />
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.05fr_1.45fr]">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Today</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300">
                {completedToday === 4
                  ? "Perfect day"
                  : `${4 - completedToday} left`}
              </div>
            </div>

            <div className="space-y-3">
              {HABITS.map((habit, index) => {
                const checked = todayProgress[habit.key];

                return (
                  <button
                    key={habit.key}
                    onClick={() => toggleHabit(todayKey, habit.key)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition ${
                      checked
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-white/10 bg-black/20 hover:bg-white/5"
                    }`}
                  >
                    <div>
                      <p className="font-medium">{habit.label}</p>
                      <p className="mt-1 text-sm text-neutral-400">
                        {checked
                          ? "Done for today"
                          : `Press ${index + 1} or tap to mark it`}
                      </p>
                    </div>

                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                        checked
                          ? "border-emerald-400 bg-emerald-400 text-black"
                          : "border-white/15 bg-white/5 text-neutral-500"
                      }`}
                    >
                      <Check size={18} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <MiniCard
                title="This Month"
                value={`${monthPerformance}%`}
                note="Monthly discipline"
              />
              <MiniCard
                title="Perfect Days"
                value={`${perfectDaysLifetime}`}
                note="All-time total"
              />
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-300" />
                <h3 className="text-sm font-semibold text-white">
                  Last Cheat Check
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {lastCheatStats.map((habit) => (
                  <div
                    key={habit.key}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <p className="text-sm text-neutral-400">{habit.label}</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {habit.cheat.label}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {habit.cheat.dateKey
                        ? `Last fail recorded on ${habit.cheat.dateKey}`
                        : "This will update once you log a failed day for this habit."}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-neutral-400">
              {zeroCheatMode ? (
                <div className="flex items-start gap-3">
                  <Lock
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-300"
                  />
                  <p>
                    Past days are locked. You can only edit today, so the
                    tracker stays honest.
                  </p>
                </div>
              ) : (
                <p>
                  Zero-cheat mode is off. You can still edit past days from
                  history.
                </p>
              )}
            </div>
          </section>

          <div className="space-y-8">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Discipline Heatmap</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Last {HEATMAP_DAYS} days. Darker green means more habits
                    completed.
                  </p>
                </div>
                <div className="hidden items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-xs text-neutral-400 sm:flex">
                  <span>Less</span>
                  <span className="h-3 w-3 rounded-sm border border-white/10 bg-white/5" />
                  <span className="h-3 w-3 rounded-sm border border-emerald-900 bg-emerald-950/80" />
                  <span className="h-3 w-3 rounded-sm border border-emerald-800 bg-emerald-900/80" />
                  <span className="h-3 w-3 rounded-sm border border-emerald-600 bg-emerald-700/80" />
                  <span className="h-3 w-3 rounded-sm border border-emerald-300 bg-emerald-400" />
                  <span>More</span>
                </div>
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="inline-flex gap-2">
                  {heatmapWeeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-2">
                      {week.map((day, dayIndex) => {
                        const entry = progress[day.key] || createEmptyDay();
                        const completed = getCompletedCount(entry);
                        const isToday = day.key === todayKey;

                        return (
                          <button
                            key={day.key}
                            onClick={() =>
                              toggleHabit(
                                day.key,
                                HABITS[dayIndex % HABITS.length].key,
                              )
                            }
                            title={`${day.fullDate} · ${completed}/4 habits completed`}
                            className={`h-5 w-5 rounded-md border transition ${getHeatmapTone(entry)} ${
                              isToday ? "ring-1 ring-white/60" : ""
                            } ${isLockedDay(day.key) ? "cursor-default" : "hover:scale-105"}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">History</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Green means a perfect day. Load more only when you need
                    older records.
                  </p>
                </div>
                <div className="hidden rounded-2xl bg-orange-500/10 px-3 py-2 text-sm text-orange-300 sm:flex sm:items-center sm:gap-2">
                  <Flame size={16} />
                  {visiblePerfectDays} perfect in view
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleEntries.map(({ key, weekday, label, entry }) => {
                  const dayCompleted = getCompletedCount(entry);
                  const isPerfect = dayCompleted === HABITS.length;
                  const isToday = key === todayKey;
                  const locked = isLockedDay(key);
                  const hasAnyChecked = isAnyHabitChecked(entry);
                  const isMissed = !hasAnyChecked && key < todayKey;

                  return (
                    <div
                      key={key}
                      className={`rounded-2xl border p-4 ${
                        isPerfect
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : isMissed
                            ? "border-red-500/20 bg-red-500/5"
                            : "border-white/10 bg-black/20"
                      } ${isToday ? "ring-1 ring-white/20" : ""}`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-neutral-400">{weekday}</p>
                          <h3 className="font-semibold">{label}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {locked && (
                            <Lock size={14} className="text-neutral-500" />
                          )}
                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-neutral-300">
                            {dayCompleted}/4
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {HABITS.map((habit) => {
                          const checked = entry[habit.key];
                          return (
                            <button
                              key={habit.key}
                              onClick={() => toggleHabit(key, habit.key)}
                              disabled={locked}
                              className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
                                checked
                                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                                  : locked
                                    ? "cursor-not-allowed border-white/10 bg-white/5 text-neutral-600"
                                    : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"
                              }`}
                            >
                              {habit.short}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={loadOlder}
                  className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm transition hover:bg-white/15"
                >
                  Load Older
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
}: StatCardProps): React.JSX.Element {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">{label}</p>
          <h3 className="mt-2 text-3xl font-bold">{value}</h3>
          <p className="mt-2 text-sm text-neutral-500">{subtext}</p>
        </div>
        {Icon ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-neutral-300">
            <Icon size={18} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniCard({ title, value, note }: MiniCardProps): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm text-neutral-400">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{note}</p>
    </div>
  );
}
