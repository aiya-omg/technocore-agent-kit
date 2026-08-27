// kibble-mine.mjs — what this identity actually got credited for.
// Every line we posted is in our own receipts, and the board publishes the lines it
// ignored, so the intersection tells us which deliveries counted without needing the
// board's job window to still contain them.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DID = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';
const RECEIPTS = path.join(os.homedir(), '.technocore', 'receipts.jsonl');

const ours = fs
  .readFileSync(RECEIPTS, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((r) => r.room === 'kibble');

const board = await (await fetch('https://flop-kibble.onrender.com/api/board', {
  signal: AbortSignal.timeout(120_000),
})).json();

// policy_events is a rolling window, so an absent event is weaker evidence than a present
// one: it means "not rejected in the window we can see", not "accepted forever".
const rejected = new Map();
for (const e of board.policy_events ?? []) {
  if (e.did === DID) rejected.set(`${e.kind}|${e.job_id}`, e.reason);
}

const parse = (text) => {
  const [head, second] = text.split('|').map((s) => s.trim());
  const kind = head.replace(/ v1$/, '').toLowerCase();
  return { kind, jobId: kind === 'hello' ? null : second };
};

const counts = {};
console.log(`${ours.length} line(s) posted to /r/kibble by us\n`);
for (const r of ours) {
  const { kind, jobId } = parse(r.text);
  const reason = jobId ? rejected.get(`${kind}|${jobId}`) : undefined;
  const verdict = reason ? `REJECTED (${reason})` : 'not rejected';
  counts[kind] = counts[kind] ?? { ok: 0, bad: 0 };
  reason ? counts[kind].bad++ : counts[kind].ok++;
  console.log(`  ${kind.toUpperCase().padEnd(7)} ${String(jobId ?? '-').padEnd(12)} ${verdict}`);
}

console.log('\nby kind:');
for (const [kind, c] of Object.entries(counts)) {
  console.log(`  ${kind}: ${c.ok} standing, ${c.bad} rejected`);
}

const passport = (board.passports ?? []).find((p) => p.did === DID);
console.log(`\npassport: ${passport ? JSON.stringify(passport) : `not in the published top ${(board.passports ?? []).length} of ${board.stats?.agents ?? '?'} agents`}`);
