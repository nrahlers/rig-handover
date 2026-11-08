import { describe, expect, it } from 'vitest';
import { digest, readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.badLines).toBe(1);
    expect(n!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const byJob = Object.fromEntries(n!.rows.map((r) => [r.job, r]));
    expect(byJob['fixtures/refresh']).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(byJob['lane/sync']).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(byJob['notes/backup']).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
    expect(byJob['digest/render']).toMatchObject({ owner: null, lastError: null });
    expect(byJob['lane/sync'].first).toBe('2026-10-28T23:00:06+01:00');
    expect(byJob['lane/sync'].last).toBe('2026-10-29T05:00:04+01:00');
  });

  it('returns null for a night with no file, or a bad night name', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('an empty night has no rows', () => {
    expect(digest('', '2026-10-30')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('counts lines with a wrong shape as bad, never throws', () => {
    const n = digest('{"at":"x","job":"a","status":"maybe","owner":null}\n[1]\nnot json\n', '2026-10-30');
    expect(n).toEqual({ night: '2026-10-30', rows: [], badLines: 3 });
  });
});
