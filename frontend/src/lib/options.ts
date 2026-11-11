export const PROCESS_TYPES = ["CS", "ACC", "NDR", "Retention"].map((v) => ({ value: v, label: v }));

export const CALENDAR_TYPES = [
  { value: "ALL_365", label: "All 365 days" },
  { value: "EXCEPT_HOLIDAYS", label: "Except holidays" },
  { value: "NO_SUN_NO_HOLIDAY", label: "No Sundays, no holidays" },
];

export const ROSTER_STATUSES = ["WORKING", "WEEKLY_OFF", "HOLIDAY", "LEAVE", "COMP_OFF"] as const;
