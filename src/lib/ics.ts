import type { AppData, ISODate, StudyBlock, Task } from '../types';
import { addDays, todayISO } from './date';

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** RFC 5545 każe łamać linie po 75 oktetach, kontynuacja zaczyna się spacją. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(' ' + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

const stamp = (iso: ISODate, clock: string) =>
  `${iso.replace(/-/g, '')}T${clock.replace(':', '')}00`;

const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}` +
  `T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;

export interface IcsOptions {
  /** Eksportuj bloki nauki. */
  blocks: boolean;
  /** Eksportuj terminy zadań jako wydarzenia całodniowe. */
  deadlines: boolean;
  /** Przypomnienie N minut przed blokiem (0 = bez przypomnienia). */
  alarmMinutes: number;
  from?: ISODate;
  to?: ISODate;
}

export const DEFAULT_ICS_OPTIONS: IcsOptions = {
  blocks: true,
  deadlines: true,
  alarmMinutes: 10,
};

/**
 * Buduje plik .ics z zaplanowanymi blokami i terminami.
 * Czas zapisujemy jako "pływający" (bez strefy) — Kalendarz Apple pokaże go
 * dokładnie tak, jak widać w aplikacji, niezależnie od strefy czasowej telefonu.
 */
export function buildICS(data: AppData, options: IcsOptions = DEFAULT_ICS_OPTIONS): string {
  const from = options.from ?? addDays(todayISO(), -7);
  const to = options.to ?? addDays(todayISO(), 120);
  const now = utcStamp(new Date());
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Productiveness Calendar//PL//',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Plan nauki',
  ];

  if (options.blocks) {
    for (const block of data.blocks) {
      if (block.date < from || block.date > to) continue;
      if (block.status === 'skipped') continue;
      const task = taskById.get(block.taskId);
      lines.push(...blockEvent(block, task, now, options.alarmMinutes));
    }
  }

  if (options.deadlines) {
    for (const task of data.tasks) {
      if (task.status === 'done') continue;
      if (task.due < from || task.due > to) continue;
      lines.push(...deadlineEvent(task, now));
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function blockEvent(block: StudyBlock, task: Task | undefined, now: string, alarmMinutes: number): string[] {
  const title = task ? `Nauka: ${task.title}` : 'Blok nauki';
  const description = task
    ? `Przedmiot: ${task.subject ?? '—'}\nTrudność: ${task.difficulty}/5\nTermin: ${task.due}`
    : '';
  const out = [
    'BEGIN:VEVENT',
    `UID:block-${block.id}@productiveness-calendar`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(block.date, block.start)}`,
    `DTEND:${stamp(block.date, block.end)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'CATEGORIES:NAUKA',
  ];
  if (alarmMinutes > 0) {
    out.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(title)}`,
      `TRIGGER:-PT${alarmMinutes}M`,
      'END:VALARM',
    );
  }
  out.push('END:VEVENT');
  return out;
}

function deadlineEvent(task: Task, now: string): string[] {
  const day = task.due.replace(/-/g, '');
  const next = addDays(task.due, 1).replace(/-/g, '');
  const base = [
    'BEGIN:VEVENT',
    `UID:task-${task.id}@productiveness-calendar`,
    `DTSTAMP:${now}`,
  ];
  if (task.dueTime) {
    base.push(`DTSTART:${stamp(task.due, task.dueTime)}`, `DTEND:${stamp(task.due, task.dueTime)}`);
  } else {
    base.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`);
  }
  base.push(
    `SUMMARY:${escapeText(`Termin: ${task.title}`)}`,
    `DESCRIPTION:${escapeText(`Trudność ${task.difficulty}/5, szacowany czas ${task.estimatedMinutes} min`)}`,
    'CATEGORIES:TERMIN',
    'END:VEVENT',
  );
  return base;
}

/**
 * Na iPhonie najpewniej działa arkusz udostępniania — pozwala wysłać plik
 * prosto do Kalendarza. Gdy go nie ma, wracamy do zwykłego pobierania.
 */
export async function shareOrDownload(filename: string, content: string, mime: string): Promise<'shared' | 'downloaded'> {
  const file = new File([content], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'shared';
      // Udostępnianie odmówiło — schodzimy do pobierania.
    }
  }

  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
