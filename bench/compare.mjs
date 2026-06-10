/**
 * Compare two bench runs: timings + per-pixel diff of deterministic captures.
 * Run with: bun bench/compare.mjs <baselineLabel> <candidateLabel>
 */
const root = import.meta.dir;
const [baseLabel, candLabel] = process.argv.slice(2);
if (!baseLabel || !candLabel) {
  console.error('usage: bun bench/compare.mjs <baselineLabel> <candidateLabel>');
  process.exit(1);
}

const base = await Bun.file(`${root}/results/${baseLabel}/results.json`).json();
const cand = await Bun.file(`${root}/results/${candLabel}/results.json`).json();

console.log(`GPU: ${base.gpu}`);
console.log(
  'scenario'.padEnd(10) +
    baseLabel.padStart(12) +
    candLabel.padStart(12) +
    'speedup'.padStart(10) +
    'pixels>2'.padStart(11) +
    'maxΔ'.padStart(7) +
    'MAE'.padStart(8)
);

for (const b of base.results) {
  const c = cand.results.find((r) => r.scenario === b.scenario);
  if (!c) continue;

  let diffStats = { pct: NaN, max: NaN, mae: NaN };
  try {
    const pa = new Uint8Array(
      await Bun.file(`${root}/results/${baseLabel}/${b.scenario}.rgba`).arrayBuffer()
    );
    const pb = new Uint8Array(
      await Bun.file(`${root}/results/${candLabel}/${b.scenario}.rgba`).arrayBuffer()
    );
    let maxD = 0;
    let sum = 0;
    let over2 = 0;
    const nPx = pa.length / 4;
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.max(
        Math.abs(pa[i] - pb[i]),
        Math.abs(pa[i + 1] - pb[i + 1]),
        Math.abs(pa[i + 2] - pb[i + 2])
      );
      if (d > maxD) maxD = d;
      if (d > 2) over2++;
      sum += d;
    }
    diffStats = { pct: (100 * over2) / nPx, max: maxD, mae: sum / nPx };
  } catch {
    // missing capture
  }

  const speedup = b.medianMs / c.medianMs;
  console.log(
    b.scenario.padEnd(10) +
      `${b.medianMs.toFixed(2)}ms`.padStart(12) +
      `${c.medianMs.toFixed(2)}ms`.padStart(12) +
      `${speedup.toFixed(2)}x`.padStart(10) +
      `${diffStats.pct.toFixed(2)}%`.padStart(11) +
      `${diffStats.max}`.padStart(7) +
      diffStats.mae.toFixed(3).padStart(8)
  );
}

const totalBase = base.results.reduce((s, r) => s + r.medianMs, 0);
const totalCand = cand.results.reduce((s, r) => s + r.medianMs, 0);
console.log(
  '\nTOTAL'.padEnd(11) +
    `${totalBase.toFixed(2)}ms`.padStart(11) +
    `${totalCand.toFixed(2)}ms`.padStart(12) +
    `${(totalBase / totalCand).toFixed(2)}x`.padStart(10)
);
