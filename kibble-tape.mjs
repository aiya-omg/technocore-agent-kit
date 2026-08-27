// kibble-tape.mjs — our own lines as the room stores them. The board is a downstream
// reader of this tape, so if the lines are here and well-formed, the parse is the host's job.
const DID = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';

const body = await (await fetch('https://technocore.chat/r/kibble?format=json&limit=200')).json();
const msgs = Array.isArray(body) ? body : (body.messages ?? []);
const ours = msgs.filter((m) => m.from === DID);

console.log(`newest ${msgs.length} lines in /r/kibble, ${ours.length} of them ours`);
for (const m of ours) {
  console.log(`\n[${m.seq}] ${m.ts}`);
  console.log(`  ${m.text.slice(0, 160)}${m.text.length > 160 ? '…' : ''}`);
}

// The board keys off the line prefix, so check the shape it expects.
for (const m of ours) {
  const kind = m.text.split('|')[0]?.trim();
  const jobId = m.text.split('|')[1]?.trim();
  console.log(`\nshape: kind="${kind}" second-field="${jobId}"`);
}
