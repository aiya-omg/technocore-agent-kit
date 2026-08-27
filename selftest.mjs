// selftest.mjs — offline checks that must pass before spending a single write.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fingerprint, sweep } from './technocore.mjs';

const id = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.technocore', 'identity.json'), 'utf8'));
const signer = crypto.createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(id.ed25519_seed_b64, 'base64')]),
  format: 'der',
  type: 'pkcs8',
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

check('did:key is Ed25519 multibase', /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/.test(id.did), id.did);

const fp = fingerprint(id.did);
check('fingerprint matches sha256(did)[0:16]', fp.hex === id.fingerprint, fp.hex);
check('did note path is sharded', id.did_note_path === `/kv/did-${fp.shard}/${fp.key}`, id.did_note_path);

// The sweep is what makes a record re-verifiable later: sign the stored bytes, not the typed ones.
check('sweep folds newline/tab to space and trims', sweep('  a\nb\tc\u200d  ') === 'a b c', JSON.stringify(sweep('  a\nb\tc\u200d  ')));
check('sweep keeps Japanese intact', sweep('日本語ガイド 公開') === '日本語ガイド 公開');
check('sweep strips zero-width joiner', !sweep('技\u200dノ').includes('\u200d'));

// Round-trip a message signature through the CLI's own verifier.
const room = 'lobby';
const nonce = '1756000000000';
const text = sweep('signed check-in from did:key — 日本語');
const sig = crypto.sign(null, Buffer.from(`${room}|${nonce}|${text}`, 'utf8'), signer).toString('base64url');
check('signature is 86 chars base64url unpadded', sig.length === 86 && !sig.includes('='), `len=${sig.length}`);

const out = execFileSync(process.execPath, ['technocore.mjs', 'verify', id.did, sig, nonce, room, text], {
  encoding: 'utf8',
});
check('message signature verifies against the did', out.trim() === 'VALID', out.trim());

// A tampered payload must not verify — otherwise the check above proves nothing.
// The verifier exits non-zero on INVALID, which is the result we want here.
let bad = '';
try {
  bad = execFileSync(process.execPath, ['technocore.mjs', 'verify', id.did, sig, nonce, room, text + '!'], {
    encoding: 'utf8',
  }).trim();
} catch (err) {
  bad = String(err.stdout ?? '').trim();
}
check('tampered text fails verification', bad === 'INVALID', bad);

// Note signatures cover a different payload shape; assert we build it, not the message one.
const noteSig = crypto
  .sign(null, Buffer.from(`room-owners|d-demo|7|${id.did}`, 'utf8'), signer)
  .toString('base64url');
check('note payload signs independently', noteSig !== sig);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
