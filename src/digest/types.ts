// Plan morning-digest § 1. The contract every part of § 2 builds on: change it only with care.

/** One line of runs/<night>.jsonl, after parsing. */
export type RunStatus = 'ok' | 'retry' | 'fail';

export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for the night. */
export type DigestRow = {
  job: string;
  owner: string | null; // views render null as '—'
  runs: number; // lines for this job
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line that had one; null if none
  first: string; // `at` of the first line, offset kept
  last: string; // `at` of the last line, offset kept
};

/** The night as read from disk. */
export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse; counted, never thrown
};

/**
 * Reads runs/<night>.jsonl. Returns null when the file does not exist (routes answer 404).
 * An empty file gives `rows: []`.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
