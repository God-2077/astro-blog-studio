const pad = (value: number): string => String(value).padStart(2, '0');

/** Format a Date as `YYYY-MM-DD HH:mm:ss` in the given IANA timezone. */
export function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** `YYYY-MM-DD` in the given IANA timezone. */
export function dateOnlyInTimeZone(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone).slice(0, 10);
}

/** Human label for a frontmatter date string without parsing it as UTC. */
export function displayDate(value: string | undefined): string {
  if (!value) return '无日期';
  const text = value.trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

const READ_CHARS_PER_MINUTE = 300;

export function readingMinutes(text: string): number {
  const chars = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / READ_CHARS_PER_MINUTE));
}

export function wordCount(text: string): number {
  const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff]/g) ?? []).length;
  const words = (text.replace(/[\u3400-\u9fff\u3040-\u30ff]/g, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length;
  return cjk + words;
}

export function padNumber(value: number): string {
  return pad(value);
}
