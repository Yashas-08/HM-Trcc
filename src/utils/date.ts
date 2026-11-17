/**
 * Platform-wide Date & Time formatting utilities for Hostel TRCC.
 * Enforces strict DD/MM/YYYY presentation across all modules.
 */

/**
 * Formats a date string (YYYY-MM-DD, ISO timestamp) or Date object into DD/MM/YYYY.
 * Uses string parsing first to avoid timezone shift anomalies.
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '-';
    const day = String(dateInput.getDate()).padStart(2, '0');
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const year = dateInput.getFullYear();
    return `${day}/${month}/${year}`;
  }

  const str = String(dateInput).trim();
  if (!str) return '-';

  // Match YYYY-MM-DD at the beginning of the string (e.g. 2026-11-16 or 2026-11-16T10:30)
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Fallback for standard date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return str;
}


/**
 * Formats a date + time string (or Date object) into "DD/MM/YYYY, HH:mm"
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '-';
    const dateStr = formatDate(dateInput);
    const hours = String(dateInput.getHours()).padStart(2, '0');
    const minutes = String(dateInput.getMinutes()).padStart(2, '0');
    return `${dateStr}, ${hours}:${minutes}`;
  }

  const str = String(dateInput).trim();
  if (!str) return '-';

  // Check for ISO strings like "2026-11-16T14:30" or "2026-11-16 14:30:00"
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, yyyy, mm, dd, hh, min] = match;
    const paddedHh = hh.padStart(2, '0');
    return `${dd}/${mm}/${yyyy}, ${paddedHh}:${min}`;
  }

  // If it's just a date without time
  const dateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return formatDate(str);
  }

  // Fallback parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const dateStr = formatDate(parsed);
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${dateStr}, ${hours}:${minutes}`;
  }

  return str;
}


/**
 * Formats a date range into "DD/MM/YYYY → DD/MM/YYYY" or with time if present
 */
export function formatDateRange(
  startInput: string | Date | null | undefined,
  endInput: string | Date | null | undefined,
  includeTime = false,
): string {
  const fn = includeTime ? formatDateTime : formatDate;
  const start = fn(startInput);
  const end = fn(endInput);
  if (start === '-' && end === '-') return '-';
  if (start === '-') return end;
  if (end === '-') return start;
  return `${start} → ${end}`;
}

export const formatDateDDMMYYYY = formatDate;
