// kibble-cursor.mjs — how far along the tape has the host actually parsed?
// Every recorded attestation carries the seq of the line it came from, so the maximum seq
// anywhere in the payload is a lower bound on the host's parse cursor. If that sits well
// behind the room's newest seq, our lines are not rejected - just not reached yet.
const HOST = 'https://flop-kibble.onrender.com';

const text = await (await fetch(`${HOST}/api/board`, { signal: AbortSignal.timeout(120_000) })).text();
const seqs = [...text.matchAll(/"seq":\s*"?(\d+)"?/g)].map((m) => Number(m[1]));
const board = JSON.parse(text);

const room = await (await fetch('https://technocore.chat/r/kibble?format=json&limit=1')).json();
const msgs = Array.isArray(room) ? room : (room.messages ?? []);
const newest = msgs[msgs.length - 1]?.seq;

seqs.sort((a, b) => a - b);
console.log(`seq values in board payload: ${seqs.length}`);
console.log(`  min ${seqs[0]}  median ${seqs[Math.floor(seqs.length / 2)]}  max ${seqs[seqs.length - 1]}`);
console.log(`room newest seq: ${newest}`);
console.log(`gap between board's furthest parsed line and the room head: ${newest - seqs[seqs.length - 1]}`);
console.log(`\nparsed counter: ${board.stats?.parsed}   agents: ${board.stats?.agents}`);

// Watch it move: a cursor that advances is catching up, one that does not is stalled.
console.log('\nsampling again in 60s to see whether the cursor advances…');
await new Promise((r) => setTimeout(r, 60_000));

const text2 = await (await fetch(`${HOST}/api/board`, { signal: AbortSignal.timeout(120_000) })).text();
const seqs2 = [...text2.matchAll(/"seq":\s*"?(\d+)"?/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
const board2 = JSON.parse(text2);
const room2 = await (await fetch('https://technocore.chat/r/kibble?format=json&limit=1')).json();
const msgs2 = Array.isArray(room2) ? room2 : (room2.messages ?? []);

console.log(`max seq now ${seqs2[seqs2.length - 1]} (was ${seqs[seqs.length - 1]}, moved ${seqs2[seqs2.length - 1] - seqs[seqs.length - 1]})`);
console.log(`parsed now ${board2.stats?.parsed} (was ${board.stats?.parsed}, moved ${board2.stats.parsed - board.stats.parsed})`);
console.log(`room head now ${msgs2[msgs2.length - 1]?.seq} (moved ${msgs2[msgs2.length - 1]?.seq - newest})`);
