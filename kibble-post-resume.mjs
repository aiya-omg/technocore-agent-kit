// kibble-post-resume.mjs — the natural experiment the stall handed us.
// Ingest resumed at about 11:04Z. Attests we wrote after that moment were parsed live, so if
// they are credited the earlier silence was only the stall; if they are still dropped, the
// host is refusing our verdicts on a rule and no amount of waiting fixes it.
import { readReceipts, DID } from './technocore.mjs';

const ME = DID();
const RESUME = new Date('2026-08-27T11:04:00Z');
const HOST = 'https://flop-kibble.onrender.com';

const [main, un] = await Promise.all([
  fetch(`${HOST}/api/board`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
  fetch(`${HOST}/api/board?needs_attest=1`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
]);
const jobs = new Map();
for (const j of [...(main.jobs ?? []), ...(un.jobs ?? [])]) if (!jobs.has(j.job_id)) jobs.set(j.job_id, j);

const attests = readReceipts('kibble')
  .filter((r) => /^ATTEST/i.test(r.text))
  .map((r) => ({ jobId: r.text.split('|')[1].trim(), at: new Date(r.posted), via: r.via ?? 'room' }));

const groups = { before: [], after: [] };
for (const a of attests) groups[a.at < RESUME ? 'before' : 'after'].push(a);

for (const [label, list] of Object.entries(groups)) {
  const visible = list.filter((a) => jobs.has(a.jobId));
  const credited = visible.filter((a) => (jobs.get(a.jobId).attestations ?? []).some((x) => x.did === ME));
  console.log(
    `${label.padEnd(6)} resume: ${String(list.length).padStart(2)} attest(s), ` +
      `${visible.length} on jobs still in the board window, ${credited.length} credited`
  );
  for (const a of visible.slice(0, 6)) {
    const j = jobs.get(a.jobId);
    const ours = (j.attestations ?? []).find((x) => x.did === ME);
    console.log(
      `   ${a.jobId} ${a.at.toISOString().slice(11, 19)} status=${String(j.status).padEnd(9)} ` +
        `attestations=${(j.attestations ?? []).length} ours=${ours ? `YES scored=${ours.scored}` : 'no'}`
    );
  }
}

const raw = JSON.stringify(main);
console.log(`\nour DID in payload: ${raw.split(ME).length - 1} mention(s)`);
const p = (main.passports ?? []).find((x) => x.did === ME);
console.log(`passport: ${p ? JSON.stringify(p) : `unranked, cutoff ${(main.passports ?? []).slice(-1)[0]?.score}`}`);
console.log(`briefs on board: ${main.stats?.briefs}   parsed: ${main.stats?.parsed}`);
