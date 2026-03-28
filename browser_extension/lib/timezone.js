/**
 * Burner Timezone Module
 *
 * Provides timezone utilities for converting UTC timestamps to local dates
 * and splitting sessions across local date boundaries.
 */

/**
 * Get user's IANA timezone name
 * @returns {string} IANA timezone name (e.g., "Europe/Berlin")
 */
export function getTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Convert ISO timestamp to date string in specified timezone
 * @param {string} isoString - ISO 8601 timestamp (e.g., "2026-03-14T23:30:00.000Z")
 * @param {string} timeZone - IANA timezone name
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function dateStringInTimeZone(isoString, timeZone) {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // Returns YYYY-MM-DD format
}

/**
 * Split a session into daily buckets based on local timezone
 * Sessions spanning multiple local dates are split proportionally
 * 
 * @param {string} startIso - Session start UTC timestamp (ISO string)
 * @param {string} endIso - Session end UTC timestamp (ISO string)
 * @param {string} timeZone - IANA timezone name for bucket assignment
 * @returns {Array<{date: string, seconds: number}>} Array of date buckets with seconds
 */
export function splitSessionByLocalDates(startIso, endIso, timeZone) {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);

  // Return empty array if invalid timestamps
  if (endDate <= startDate) {
    return [];
  }

  const buckets = [];
  let currentUtc = startDate;

  while (currentUtc < endDate) {
    // Get local date for current UTC moment
    const currentLocalDateStr = dateStringInTimeZone(currentUtc.toISOString(), timeZone);
    const [year, month, day] = currentLocalDateStr.split("-").map(Number);

    // Compute next midnight in local timezone using UTC date construction
    // Create UTC date for next day at 00:00:00, then adjust for timezone offset
    const nextDayLocal = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
    
    // Find the UTC offset for next day local midnight
    const offsetNext = getTimezoneOffset(nextDayLocal, timeZone);
    
    // Convert local midnight to UTC
    const nextMidnightUtc = new Date(nextDayLocal.getTime() - offsetNext * 60000);

    // Segment end is either next midnight or session end, whichever is earlier
    const segmentEndUtc = nextMidnightUtc < endDate ? nextMidnightUtc : endDate;

    // Calculate seconds in this segment
    const durationSeconds = Math.floor((segmentEndUtc - currentUtc) / 1000);

    if (durationSeconds > 0) {
      // Get the local date for this segment
      const segmentLocalDate = dateStringInTimeZone(currentUtc.toISOString(), timeZone);
      buckets.push({
        date: segmentLocalDate,
        seconds: durationSeconds
      });
    }

    currentUtc = segmentEndUtc;
  }

  return buckets;
}

/**
 * Get timezone offset in minutes for a given UTC date in a specific timezone
 * @param {Date} utcDate - UTC date
 * @param {string} timeZone - IANA timezone name
 * @returns {number} Offset in minutes (positive = behind UTC)
 */
function getTimezoneOffset(utcDate, timeZone) {
  // Format the UTC date in the target timezone to get local components
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(utcDate);

  const values = {};
  parts.forEach(part => {
    if (part.type !== "literal") {
      values[part.type] = parseInt(part.value, 10);
    }
  });

  // Construct what the local time would be as UTC
  const localAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour || 0,
    values.minute || 0,
    values.second || 0
  );

  // The difference between UTC date and local-as-UTC is the offset
  const utcTime = utcDate.getTime();
  const offsetMs = localAsUtc - utcTime;
  
  return Math.round(offsetMs / 60000); // Return offset in minutes
}

/**
 * Aggregate seconds by date from an array of date buckets
 * @param {Array<{date: string, seconds: number}>} buckets - Array of date buckets
 * @returns {Map<string, number>} Map of date strings to total seconds
 */
export function aggregateByDate(buckets) {
  const dateTotals = new Map();

  for (const bucket of buckets) {
    const existing = dateTotals.get(bucket.date) || 0;
    dateTotals.set(bucket.date, existing + bucket.seconds);
  }

  return dateTotals;
}

/**
 * Get today's date string in specified timezone
 * @param {string} timeZone - IANA timezone name
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayInTimeZone(timeZone) {
  return dateStringInTimeZone(new Date().toISOString(), timeZone);
}

/**
 * Get date range for a period
 * @param {string} period - "week" or "month"
 * @param {string} timeZone - IANA timezone name
 * @returns {{start: string, end: string, days: number}} Date range info
 */
export function getDateRangeForPeriod(period, timeZone) {
  const today = getTodayInTimeZone(timeZone);
  const days = period === "week" ? 7 : 30;

  // Parse today's date
  const [year, month, day] = today.split("-").map(Number);
  const todayDate = new Date(Date.UTC(year, month - 1, day));

  // Calculate start date
  const startDate = new Date(todayDate);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

  // Format start date as YYYY-MM-DD
  const startStr = startDate.toISOString().split("T")[0];

  return {
    start: startStr,
    end: today,
    days
  };
}
