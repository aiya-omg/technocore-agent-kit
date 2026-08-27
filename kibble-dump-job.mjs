// kibble-dump-job.mjs <job_id> — the raw job object, so we stop guessing at field names.
const id = process.argv[2] ?? 'k53ad079134';
const HOST = 'https://flop-kibble.onrender.com';

const [main, un] = await Promise.all([
  fetch(`${HOST}/api/board`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
  fetch(`${HOST}/api/board?needs_attest=1`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
]);

const all = [...(main.jobs ?? []), ...(un.jobs ?? [])];
const job = all.find((j) => j.job_id === id);
if (!job) {
  console.log(`${id} not in either window. A job carrying attests, for shape:`);
  const withAttests = all.find((j) => (j.attests ?? []).length);
  console.log(JSON.stringify(withAttests, null, 2).slice(0, 3000));
  process.exit(0);
}

console.log(JSON.stringify(job, null, 2).slice(0, 4000));
console.log('\nkeys:', Object.keys(job).join(', '));
