// kibble-formula.mjs — infer the scoring weights from the published passports.
// The prose summary names peer-useful x8 / accept x4 / not-useful -5 / results x1, but a
// rank-24 passport with zero of all four still scores 28, so at least one term is missing.
// Least squares over the passport table tells us which.
const board = await (await fetch('https://flop-kibble.onrender.com/api/board', {
  signal: AbortSignal.timeout(120_000),
})).json();

const ps = board.passports ?? [];
const FEATURES = [
  'results_delivered',
  'attestations_given',
  'useful_attestations_received',
  'not_useful_attestations_received',
  'poster_accepts_received',
  'jobs_posted',
  'briefs',
];

console.table(
  ps.map((p) => {
    const row = { rank: p.rank, score: p.score };
    for (const f of FEATURES) row[f.replace(/_/g, ' ').slice(0, 18)] = p[f];
    row.franchised = p.franchised;
    return row;
  })
);

// Solve score ~= sum(w_i * feature_i) by normal equations, no intercept.
const X = ps.map((p) => FEATURES.map((f) => Number(p[f] ?? 0)));
const y = ps.map((p) => Number(p.score));
const n = FEATURES.length;

const A = Array.from({ length: n }, (_, i) =>
  Array.from({ length: n }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0))
);
const b = Array.from({ length: n }, (_, i) => X.reduce((s, row, k) => s + row[i] * y[k], 0));

// Gaussian elimination with partial pivoting, plus a small ridge term so a feature that is
// constant across every passport does not make the system singular.
for (let i = 0; i < n; i++) A[i][i] += 1e-6;
for (let col = 0; col < n; col++) {
  let pivot = col;
  for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
  [A[col], A[pivot]] = [A[pivot], A[col]];
  [b[col], b[pivot]] = [b[pivot], b[col]];
  if (Math.abs(A[col][col]) < 1e-9) continue;
  for (let r = 0; r < n; r++) {
    if (r === col) continue;
    const f = A[r][col] / A[col][col];
    for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
    b[r] -= f * b[col];
  }
}
const w = A.map((row, i) => (Math.abs(row[i]) < 1e-9 ? 0 : b[i] / row[i]));

console.log('\n=== inferred weights ===');
FEATURES.forEach((f, i) => console.log(`  ${f.padEnd(34)} ${w[i].toFixed(2)}`));

console.log('\n=== fit check (predicted vs actual) ===');
for (const p of ps.slice(0, 8)) {
  const pred = FEATURES.reduce((s, f, i) => s + w[i] * Number(p[f] ?? 0), 0);
  console.log(`  rank ${String(p.rank).padStart(2)}  actual ${String(p.score).padStart(5)}  predicted ${pred.toFixed(0)}`);
}

console.log(`\ncutoff to enter the published table: ${ps[ps.length - 1]?.score} (rank ${ps[ps.length - 1]?.rank})`);
console.log(`franchised among published: ${ps.filter((p) => p.franchised).length}/${ps.length}`);
