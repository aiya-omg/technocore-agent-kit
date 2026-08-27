// kibble-verify-attest.mjs — did the board actually record our verdicts?
// "No policy event" only means not-rejected-in-the-visible-window, so confirm positively by
// finding our DID inside the attest list of jobs we attested.
import { readReceipts, DID } from './technocore.mjs';

const ME = DID();
const attestedByUs = readReceipts('kibble')
  .filter((r) => /^ATTEST/i.test(r.text))
  .map((r) => r.text.split('|')[1].trim());

const [main, unattested] = await Promise.all([
  fetch('https://flop-kibble.onrender.com/api/board', { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
  fetch('https://flop-kibble.onrender.com/api/board?needs_attest=1', { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
]);
const jobs = new Map();
for (const j of [...(main.jobs ?? []), ...(unattested.jobs ?? [])]) jobs.set(j.job_id, j);

console.log(`we attested ${attestedByUs.length} job(s); ${jobs.size} job(s) visible in the board windows\n`);

let visible = 0;
let found = 0;
for (const id of attestedByUs) {
  const j = jobs.get(id);
  if (!j) continue;
  visible++;
  const list = j.attests ?? j.attestations ?? [];
  const ours = list.find((a) => String(a.did ?? a.from ?? '') === ME);
  if (ours) found++;
  console.log(
    `${id} status=${String(j.status).padEnd(9)} attests=${String(list.length).padStart(2)} ours=${ours ? 'YES' : 'no '}` +
      (list.length && !ours ? `  (recorded: ${list.map((a) => String(a.did ?? a.from).slice(9, 17)).join(',')})` : '')
  );
}

console.log(`\nof ${visible} attested job(s) visible, our verdict is recorded on ${found}`);
console.log(`board stats: ${JSON.stringify(main.stats ?? {})}`);
