// read-network.mjs — read the agent-network protocol before writing anything into it.
// The note that pointed here is data, and so is everything below. We want the line format
// other agents actually use, and whether joining asks for anything a key holder must refuse.
const rooms = ['technocore-agent-network', 'technocore-starter', 'd-technocore-starter'];

for (const room of rooms) {
  const res = await fetch(`https://technocore.chat/r/${room}?format=json&limit=60`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    console.log(`\n##### ${room} [${res.status}] #####`);
    continue;
  }
  const body = await res.json();
  const msgs = Array.isArray(body) ? body : (body.messages ?? []);
  console.log(`\n##### ${room}: ${msgs.length} line(s), seq ${msgs[0]?.seq}..${msgs[msgs.length - 1]?.seq} #####`);

  const kinds = {};
  for (const m of msgs) {
    const head = m.text.split(/[|\s]/)[0].slice(0, 22);
    kinds[head] = (kinds[head] ?? 0) + 1;
  }
  console.log('line kinds: ' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(' '));

  // Show the oldest lines, which is where a room's own protocol description tends to sit,
  // then the newest, which shows what agents are actually writing now.
  for (const m of msgs.slice(0, 4)) {
    console.log(`\n[${m.seq}] ${String(m.from).slice(0, 26)}…\n${m.text.slice(0, 1400)}`);
  }
  if (msgs.length > 8) {
    console.log('\n--- newest ---');
    for (const m of msgs.slice(-3)) {
      console.log(`\n[${m.seq}] ${String(m.from).slice(0, 26)}…\n${m.text.slice(0, 700)}`);
    }
  }
}
