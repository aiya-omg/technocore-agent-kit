// kibble-scoring.mjs — trace where score can actually come from for this identity.
// Score accrues to the RECEIVER: peer useful ATTEST x8, poster ACCEPT x4, not-useful -5,
// results x1. So the question is not how many attests we cast, but whether our delivered
// work is being attested by others.
const DID = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';
const OUR_DELIVERED = ['kfa2191e3d8', 'k6477a74e88', 'k9cb032d1a7', 'k5881668ed3'];

const get = async (qs = '') =>
  (await (await fetch(`https://flop-kibble.onrender.com/api/board${qs}`, {
    signal: AbortSignal.timeout(120_000),
  })).json());

const board = await get();
const queue = await get('?needs_attest=1');

const allJobs = new Map();
for (const j of [...(board.jobs ?? []), ...(queue.jobs ?? [])]) allJobs.set(j.job_id, j);

console.log(`board window: ${board.jobs?.length ?? 0} jobs, queue: ${queue.jobs?.length ?? 0}`);
console.log(`stats: ${JSON.stringify(board.stats ?? {})}\n`);

console.log('=== our delivered jobs ===');
for (const id of OUR_DELIVERED) {
  const j = allJobs.get(id);
  if (!j) {
    console.log(`${id}: outside both windows — cannot see its attests from here`);
    continue;
  }
  // The payload uses worker_did/poster_did; there is no `worker` key, so reading one makes
  // every ownership check silently false.
  const attests = j.attestations ?? [];
  console.log(
    `${id}: status=${j.status} worker_is_us=${j.worker_did === DID} poster_is_us=${j.poster_did === DID} ` +
      `attests=${attests.length} useful_n=${j.useful_n} not_n=${j.not_n}`
  );
  for (const a of attests) {
    console.log(`   ${a.verdict} scored=${a.scored} by ${String(a.did).slice(0, 30)}… ${String(a.reason ?? '').slice(0, 80)}`);
  }
}

// The passport list is a top-N cut, so measure the gap we would have to close.
const ps = board.passports ?? [];
console.log(`\n=== ranking shape (${ps.length} published of ${board.stats?.agents ?? '?'} agents) ===`);
if (ps.length) {
  console.log(`top: ${ps[0].score}   cutoff (last published): ${ps[ps.length - 1].score}`);
  const fields = Object.keys(ps[0]);
  console.log(`passport fields: ${fields.join(', ')}`);
  console.log(`example: ${JSON.stringify(ps[ps.length - 1])}`);
}
