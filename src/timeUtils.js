/**
 * Time utility functions for WCL data processing
 */

/**
 * Parses a local datetime string in the specified timezone
 * @param {string} dateStr - Date string in "YYYY-MM-DD HH:mm" format
 * @param {string} timezone - IANA timezone (e.g., "Europe/Stockholm")
 * @returns {string|null} ISO string in UTC, or null if invalid
 */
function parseLocalDateTime(dateStr, timezone) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  // Parse the date string
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) {
    console.warn(`parseLocalDateTime: invalid format "${dateStr}"`);
    return null;
  }

  const [, year, month, day, hour, minute] = match;

  // Create a date string that JavaScript can parse with timezone
  const localStr = `${year}-${month}-${day}T${hour}:${minute}:00`;

  try {
    // Use Intl to get the UTC offset for the timezone at this date
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Create date assuming it's in the local timezone
    // Then adjust for the actual timezone offset
    const localDate = new Date(localStr);

    // Get the timezone offset by comparing local interpretation with UTC
    const parts = formatter.formatToParts(localDate);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || '00';

    // Reconstruct what the date looks like in the target timezone
    const tzYear = getPart('year');
    const tzMonth = getPart('month');
    const tzDay = getPart('day');
    const tzHour = getPart('hour');
    const tzMinute = getPart('minute');

    // Calculate the offset between local and target timezone
    const targetStr = `${tzYear}-${tzMonth}-${tzDay}T${tzHour}:${tzMinute}:00`;
    const targetDate = new Date(targetStr);
    const offset = targetDate.getTime() - localDate.getTime();

    // Adjust the date to get the correct UTC time
    const utcDate = new Date(localDate.getTime() - offset);
    return utcDate.toISOString();
  } catch (err) {
    console.warn(`parseLocalDateTime: error parsing "${dateStr}" with tz "${timezone}": ${err.message}`);
    return null;
  }
}

/**
 * Formats milliseconds as a timer string (mm:ss.ms)
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted timer string
 */
function formatTimerMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00.000';

  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const millis = ms % 1000;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${mm}:${ss}.${mmm}`;
}

module.exports = {
  parseLocalDateTime,
  formatTimerMs,
};
