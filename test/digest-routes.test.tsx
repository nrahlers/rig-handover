import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Fixtures live in a temp dir. runs/ is never touched.
const NIGHT_OK = '2026-10-29';
const NIGHT_EMPTY = '2026-10-30';
const NIGHT_BAD = '2026-10-31';
const NIGHT_MISSING = '2026-01-01';

const okLines = [
  { at: '2026-10-29T06:00:00+01:00', job: 'zeta/report', status: 'ok', owner: 'lane-07' },
  { at: '2026-10-29T06:10:00+01:00', job: 'alpha/sync', status: 'ok', owner: null },
  { at: '2026-10-29T06:20:00+01:00', job: 'beta/flaky', status: 'retry', owner: 'lane-07', error: 'upstream 503' },
  { at: '2026-10-29T06:21:00+01:00', job: 'beta/flaky', status: 'retry', owner: 'lane-07', error: 'upstream 503' },
  { at: '2026-10-29T06:22:00+01:00', job: 'beta/flaky', status: 'retry', owner: 'lane-07', error: 'upstream 503' },
  { at: '2026-10-29T06:23:00+01:00', job: 'beta/flaky', status: 'ok', owner: 'lane-07' },
  { at: '2026-10-29T06:30:00+01:00', job: 'gamma/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' },
];

const jobOrder = ['alpha/sync', 'beta/flaky', 'gamma/backup', 'zeta/report'];

type Cell = { cls: string | null; text: string };

// Rows of the page's job table, as cells. Hono renders no whitespace between tags.
function pageRows(html: string): Cell[][] {
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<td(?: class="([^"]+)")?>([\s\S]*?)<\/td>/g)].map((td) => ({
      cls: td[1] ?? null,
      text: td[2],
    })),
  );
}

describe('digest routes', () => {
  let runsDir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    writeFileSync(join(runsDir, `${NIGHT_OK}.jsonl`), okLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    writeFileSync(join(runsDir, `${NIGHT_EMPTY}.jsonl`), '');
    writeFileSync(
      join(runsDir, `${NIGHT_BAD}.jsonl`),
      JSON.stringify(okLines[1]) + '\nthis is not json\n',
    );
    app = createApp({
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    });
  });

  afterAll(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('page 200 shows each job, sorted, with warn on a 3-retry job and a fail job', async () => {
    const res = await app.request(`/digest/${NIGHT_OK}`);
    expect(res.status).toBe(200);
    const rows = pageRows(await res.text());
    expect(rows.map((r) => r[0].text)).toEqual(jobOrder);

    const [alpha, beta, gamma, zeta] = rows;
    expect(alpha[0].cls).toBeNull();
    expect(zeta[0].cls).toBeNull();

    expect(beta[0].cls).toBe('warn');
    expect(beta[3]).toEqual({ cls: 'warn', text: '3' });

    expect(gamma[0].cls).toBe('warn');
    expect(gamma[4]).toEqual({ cls: 'warn', text: 'fail' });
  });

  it('page renders a null owner as the dash', async () => {
    const res = await app.request(`/digest/${NIGHT_OK}`);
    const rows = pageRows(await res.text());
    expect(rows[0][1].text).toBe('—');
    expect(rows[3][1].text).toBe('lane-07');
  });

  it('JSON 200 lists the same jobs in the same order as the page', async () => {
    const pageHtml = await (await app.request(`/digest/${NIGHT_OK}`)).text();
    const pageJobs = pageRows(pageHtml).map((r) => r[0].text);

    const res = await app.request(`/api/digest/${NIGHT_OK}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(NIGHT_OK);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(pageJobs);
    expect(body.rows.map((r) => r.job)).toEqual(jobOrder);
  });

  it('404 on both routes for a night with no file', async () => {
    const page = await app.request(`/digest/${NIGHT_MISSING}`);
    expect(page.status).toBe(404);
    expect(await page.text()).toContain(`no run log for ${NIGHT_MISSING}`);

    const api = await app.request(`/api/digest/${NIGHT_MISSING}`);
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'no run log', night: NIGHT_MISSING });
  });

  it('empty night: page says "nothing ran", JSON rows are []', async () => {
    const page = await app.request(`/digest/${NIGHT_EMPTY}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const api = await app.request(`/api/digest/${NIGHT_EMPTY}`);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ night: NIGHT_EMPTY, rows: [], badLines: 0 });
  });

  it('bad line: both routes still 200, badLines is 1, page says "1 line could not be read"', async () => {
    const page = await app.request(`/digest/${NIGHT_BAD}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('1 line could not be read');
    expect(pageRows(html).map((r) => r[0].text)).toEqual(['alpha/sync']);

    const api = await app.request(`/api/digest/${NIGHT_BAD}`);
    expect(api.status).toBe(200);
    const body = (await api.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/sync']);
  });
});
