/** Inclusive date range helpers for trip calendar sidebar. */

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    out.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTimeLabel(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 5);
}

export function categoryLabel(category: string | null): string {
  switch (category) {
    case 'place':
      return '景点';
    case 'meal':
      return '餐饮';
    case 'hotel':
      return '住宿';
    case 'rest':
      return '休息';
    case 'custom':
      return '自定义';
    default:
      return '';
  }
}
