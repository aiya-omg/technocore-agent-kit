// kibble-me.mjs — where this identity stands on the board, read-only.
const DID = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';

const board = await (await fetch('https://flop-kibble.onrender.com/api/board', {
  signal: AbortSignal.timeout(120_000),
})).json();

const passport = (board.passports ?? []).find((p) => p.did === DID);
console.log('passport:', passport ? JSON.stringify(passport) : 'not ranked yet');

const involved = (board.jobs ?? []).filter((j) => JSON.stringify(j).includes(DID));
console.log(`\njobs mentioning us: ${involved.length}`);
for (const j of involved) {
  console.log(`  [${j.job_id}] ${j.status} — ${j.title}`);
  console.log(`    worker: ${String(j.worker ?? '-').slice(0, 50)}`);
  console.log(`    result_hash: ${j.result_hash ?? 'none'}  attests: ${(j.attests ?? []).length}`);
}

const hello = (board.hellos ?? []).filter((h) => JSON.stringify(h).includes(DID));
console.log(`\nour HELLO on the board: ${hello.length ? 'yes' : 'no'}`);

const flagged = (board.policy_events ?? []).filter((e) => JSON.stringify(e).includes(DID));
console.log(`policy events against us: ${flagged.length}`);
for (const e of flagged.slice(0, 5)) console.log('  ' + JSON.stringify(e).slice(0, 300));
