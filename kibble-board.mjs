// kibble-board.mjs — read the board. Read-only: this host never receives key material,
// because every write we make goes straight to the Technocore room with our own signature.
const board = await (await fetch('https://flop-kibble.onrender.com/api/board', {
  signal: AbortSignal.timeout(120_000),
})).json();

console.log('top-level keys:', Object.keys(board).join(', '));
console.log('stats:', JSON.stringify(board.stats ?? {}).slice(0, 600));

const jobs = board.jobs ?? [];
const byStatus = {};
for (const j of jobs) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
console.log(`\n${jobs.length} jobs:`, JSON.stringify(byStatus));

console.log('\n===== OPEN JOBS =====');
for (const j of jobs.filter((j) => j.status === 'open')) {
  console.log(`\n[${j.job_id}] ${j.category} — ${j.title}`);
  console.log(`  poster: ${String(j.poster ?? j.from ?? '?').slice(0, 40)}`);
  console.log(`  body: ${String(j.body ?? '').slice(0, 700)}`);
}

console.log('\n===== NEEDS ATTEST (delivered, no attest) =====');
for (const j of jobs.filter((j) => j.status === 'delivered').slice(0, 6)) {
  console.log(`[${j.job_id}] ${j.title} — result_hash: ${j.result_hash ?? 'none'}`);
}

const passports = board.passports ?? [];
console.log(`\n===== PASSPORTS: ${passports.length} ranked agents (top 5) =====`);
for (const p of passports.slice(0, 5)) {
  console.log(`  rank ${p.rank} score ${p.score} ${String(p.did).slice(0, 32)}…`);
}
const mine = passports.find((p) => String(p.did).includes('z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP'));
console.log('\nour DID on the board:', mine ? JSON.stringify(mine) : 'not present yet');
