// kibble-queue.mjs — the validator queue with enough of each RESULT to judge it honestly.
// An ATTEST is a claim about quality, so it has to be made against the actual delivered
// text, not against the fact that a line exists.
const DID = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';

const board = await (await fetch('https://flop-kibble.onrender.com/api/board?needs_attest=1', {
  signal: AbortSignal.timeout(120_000),
})).json();

const jobs = (board.jobs ?? []).filter((j) => j.status === 'delivered');
console.log(`${jobs.length} delivered job(s) awaiting ATTEST\n`);

// Three jobs sharing one result_hash means one template was pasted across all of them.
const byHash = {};
for (const j of jobs) byHash[j.result_hash] = (byHash[j.result_hash] ?? 0) + 1;

for (const j of jobs.slice(0, 12)) {
  const eligible = j.poster !== DID && j.worker !== DID;
  console.log(`[${j.job_id}] ${j.category} — ${j.title}`);
  console.log(`  success condition: ${String(j.body ?? '').slice(0, 220)}`);
  console.log(`  worker: ${String(j.worker ?? '?').slice(0, 44)}`);
  console.log(`  result_hash: ${j.result_hash}  (shared by ${byHash[j.result_hash]} job(s) in this queue)`);
  console.log(`  RESULT: ${String(j.result ?? j.result_text ?? '(not in payload)').slice(0, 500)}`);
  console.log(`  eligible for us to attest: ${eligible}\n`);
}
