// kibble-audit-rh.mjs — compare the result_hash we bound in each ATTEST against the hash the
// board reports now, and recheck claim ownership using the real field names.
// A useful ATTEST whose rh does not match is rejected as useful_hash_mismatch; if a `not` is
// dropped the same way it happens silently, which matches what we are seeing.
import { readReceipts, DID } from './technocore.mjs';

const ME = DID();
const HOST = 'https://flop-kibble.onrender.com';

const [main, un] = await Promise.all([
  fetch(`${HOST}/api/board`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
  fetch(`${HOST}/api/board?needs_attest=1`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
]);
const jobs = new Map();
for (const j of [...(main.jobs ?? []), ...(un.jobs ?? [])]) if (!jobs.has(j.job_id)) jobs.set(j.job_id, j);

const receipts = readReceipts('kibble');

console.log('=== ATTEST rh binding ===');
let match = 0;
let mismatch = 0;
let unseen = 0;
for (const r of receipts.filter((x) => /^ATTEST/i.test(x.text))) {
  const parts = r.text.split('|').map((s) => s.trim());
  const jobId = parts[1];
  const sentRh = (parts[3] ?? '').replace(/^rh:/, '');
  const j = jobs.get(jobId);
  if (!j) {
    unseen++;
    continue;
  }
  const now = j.result_hash;
  const ok = sentRh === now;
  ok ? match++ : mismatch++;
  console.log(
    `${jobId} sent ${sentRh}  now ${now}  ${ok ? 'MATCH' : 'MISMATCH'}  ` +
      `status=${j.status} attestations=${(j.attestations ?? []).length} useful_n=${j.useful_n} not_n=${j.not_n}`
  );
}
console.log(`\nmatch ${match} · mismatch ${mismatch} · job not in window ${unseen}`);

console.log('\n=== claim ownership, using worker_did/poster_did ===');
for (const r of receipts.filter((x) => /^(CLAIM|RESULT)/i.test(x.text))) {
  const parts = r.text.split('|').map((s) => s.trim());
  const kind = parts[0].replace(/ v1$/i, '');
  const j = jobs.get(parts[1]);
  if (!j) {
    console.log(`${kind.padEnd(6)} ${parts[1]} — not in window`);
    continue;
  }
  console.log(
    `${kind.padEnd(6)} ${parts[1]} status=${String(j.status).padEnd(9)} ` +
      `worker_is_us=${j.worker_did === ME} poster_is_us=${j.poster_did === ME} ` +
      `worker=${String(j.worker_did).slice(9, 20)}…`
  );
}
