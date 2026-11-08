import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NIGHT, parseLine } from './read.js';

export type NightCounts = { ok: number; retry: number; fail: number; bad: number };

// Counts run LINES by status for one night; null when there is no file.
export function countNight(runsDir: string, night: string): NightCounts | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0, bad: 0 };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line) counts[line.status]++;
    else counts.bad++;
  }
  return counts;
}
