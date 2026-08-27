// kibble-job.mjs <job_id> — the board's view of one job, to see who the host credited.
const jobId = process.argv[2];
if (!jobId) {
  console.error('usage: node kibble-job.mjs <job_id>');
  process.exit(1);
}

const board = await (await fetch('https://flop-kibble.onrender.com/api/board', {
  signal: AbortSignal.timeout(120_000),
})).json();

const job = (board.jobs ?? []).find((j) => j.job_id === jobId);
console.log(job ? JSON.stringify(job, null, 2).slice(0, 2500) : `job ${jobId} not in the board window`);

console.log('\n=== recent policy events (why a line was ignored) ===');
for (const e of (board.policy_events ?? []).slice(0, 8)) {
  console.log(JSON.stringify(e).slice(0, 260));
}
