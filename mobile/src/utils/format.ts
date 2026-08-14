const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Formats an ISO timestamp as "Joined March 2026". */
export function formatDateJoined(isoDate?: string | null): string {
  if (!isoDate) {
    return '';
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const month = MONTHS[date.getMonth()] ?? '';
  const year = date.getFullYear();
  return month ? `Joined ${month} ${year}` : '';
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** "HH:MM" 24h clock for a message bubble timestamp. */
export function formatMessageTime(isoDate?: string | null): string {
  if (!isoDate) {
    return '';
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Chat-list time label: "HH:MM" today, "Yesterday" for the previous day and
 * "MMM D" (e.g. "Aug 4") otherwise.
 */
export function formatChatTime(isoDate?: string | null): string {
  if (!isoDate) {
    return '';
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  if (isSameDay(date, now)) {
    return formatMessageTime(isoDate);
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${MONTHS[date.getMonth()]?.slice(0, 3) ?? ''} ${date.getDate()}`;
  }
  return `${MONTHS[date.getMonth()]?.slice(0, 3) ?? ''} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "m:ss" (e.g. "1:07") for voice notes and video durations. */
export function formatDuration(seconds?: number | null): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

/** Short relative time: "Just now", "3m", "2h", "5d", then "Aug 4". */
export function timeAgoShort(isoDate?: string | null): string {
  if (!isoDate) {
    return '';
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) {
    return 'Just now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  return `${MONTHS[date.getMonth()]?.slice(0, 3) ?? ''} ${date.getDate()}`;
}

/** Short date + 12-hour time, e.g. "Wed, Aug 12 · 6:00 PM". */
export function formatDateTime(isoDate?: string | null): string {
  if (!isoDate) {
    return '';
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const period = date.getHours() >= 12 ? 'PM' : 'AM';
  let hours = date.getHours() % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${days[date.getDay()] ?? ''}, ${MONTHS[date.getMonth()]?.slice(0, 3) ?? ''} ${
    date.getDate()
  } · ${hours}:${pad(date.getMinutes())} ${period}`;
}

/** Twelve-hour clock time, e.g. "6:00 PM". */
export function formatTimeOfDay(isoDate?: string | null): string {
  if (!isoDate) {
    return '';
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const period = date.getHours() >= 12 ? 'PM' : 'AM';
  let hours = date.getHours() % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${hours}:${pad(date.getMinutes())} ${period}`;
}