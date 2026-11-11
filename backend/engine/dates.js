// Pure date helpers. All dates are "YYYY-MM-DD" strings, all weekdays are
// computed in UTC (0 = Sunday ... 6 = Saturday). No Date objects leak out.

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value) => String(value).padStart(2, "0");

// Throws on anything that is not a real YYYY-MM month.
export const parseMonth = (month) => {
  if (typeof month !== "string" || !MONTH_PATTERN.test(month)) {
    throw new Error("Invalid month format. Use YYYY-MM.");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  return { year, monthNumber };
};

export const isValidMonth = (month) => {
  try {
    parseMonth(month);
    return true;
  } catch {
    return false;
  }
};

// True only for real calendar dates in YYYY-MM-DD form (rejects 2026-02-30).
export const isValidDate = (date) => {
  if (typeof date !== "string") return false;

  const match = DATE_PATTERN.exec(date);

  if (!match) return false;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];

  if (month < 1 || month > 12 || day < 1) return false;

  return day <= daysInMonth(year, month);
};

export const daysInMonth = (year, monthNumber) =>
  new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

// Every date of the month, in order.
export const getMonthDates = (month) => {
  const { year, monthNumber } = parseMonth(month);
  const total = daysInMonth(year, monthNumber);

  return Array.from(
    { length: total },
    (_, index) => `${month}-${pad(index + 1)}`
  );
};

export const getWeekday = (date) => {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

export const addDays = (date, amount) => {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));

  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
};

export const getMonthOfDate = (date) => date.slice(0, 7);

// Inclusive overlap check for two date ranges of YYYY-MM-DD strings.
export const rangesOverlap = (startA, endA, startB, endB) =>
  startA <= endB && startB <= endA;

/**
 * Split a month into Monday-Sunday weeks.
 * Returns [{ index, start, end, dates, isFull }]. Only weeks with all
 * seven days inside the month are "full"; partial first/last weeks are
 * returned with isFull = false.
 */
export const getMonthWeeks = (month) => {
  const dates = getMonthDates(month);
  const weeks = [];
  let current = [];

  for (const date of dates) {
    current.push(date);

    // Sunday closes a Monday-Sunday week.
    if (getWeekday(date) === 0) {
      weeks.push(current);
      current = [];
    }
  }

  if (current.length) weeks.push(current);

  return weeks.map((weekDates, index) => ({
    index,
    start: weekDates[0],
    end: weekDates[weekDates.length - 1],
    dates: weekDates,
    isFull: weekDates.length === 7,
  }));
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
