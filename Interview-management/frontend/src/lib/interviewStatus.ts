export const INTERVIEW_STATUSES = [
  "L1 Scheduled",
  "L1 Completed",
  "L2 Scheduled",
  "L2 Completed",
  "Client Round Scheduled",
  "Client Round Completed",
  "Rejected",
  "Scheduled",
  "In Progress",
  "Completed",
  "Cancelled",
  "No Show",
] as const;

export const INTERVIEW_ACTIVE_STATUSES = new Set(["L1 Scheduled", "L2 Scheduled", "Client Round Scheduled", "Scheduled", "In Progress"]);

export const INTERVIEW_FEEDBACK_ELIGIBLE_STATUSES = new Set([
  "L1 Scheduled",
  "L1 Completed",
  "L2 Scheduled",
  "L2 Completed",
  "Client Round Scheduled",
  "Client Round Completed",
  "Scheduled",
  "Completed",
]);

export const STATUS_STYLES: Record<string, string> = {
  "L1 Scheduled": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "L2 Scheduled": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "Client Round Scheduled": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  Scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "In Progress": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "L1 Completed": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "L2 Completed": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "Client Round Completed": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Cancelled: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "No Show": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};
