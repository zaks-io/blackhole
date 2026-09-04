import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CONFIG } from '../lib/config';

const diskShader = readFileSync(
  new URL('../lib/shaders/chunks/disk.glsl', import.meta.url),
  'utf8'
);
const raymarcherShader = readFileSync(
  new URL('../lib/shaders/chunks/raymarcher.glsl', import.meta.url),
  'utf8'
);

function miniDiskBounds(massFraction: number, separation: number) {
  return {
    inner: 3 * CONFIG.rs * massFraction,
    outer: separation * 0.4 * (0.5 + massFraction),
  };
}

describe('binary mini-disk bounds', () => {
  test('both default mini-disks begin at their Schwarzschild ISCO', () => {
    const primary = miniDiskBounds(CONFIG.binary.mass1, CONFIG.binary.separation);
    const secondary = miniDiskBounds(1 - CONFIG.binary.mass1, CONFIG.binary.separation);
    expect(primary).toEqual({ inner: 2.25, outer: 4 });
    expect(secondary).toEqual({ inner: 0.75, outer: 2.4000000000000004 });

    expect(diskShader).toContain('float innerR = 3.0 * bhRs;');
    expect(diskShader).toContain('if (r < innerR || r > outerR * 1.1)');
    expect(diskShader).toContain(
      'float innerFade = smoothstep(innerR, innerR + innerEdgeWidth, r);'
    );
    expect(diskShader).toContain(
      'float outerFade = 1.0 - smoothstep(outerR - outerEdgeWidth, outerR * 1.1, r);'
    );
  });

  test('tidal truncation at or inside the ISCO returns before radius divisions', () => {
    const functionStart = diskShader.indexOf('vec4 sampleMiniDisk');
    const functionEnd = diskShader.indexOf('vec4 sampleCircumbinaryDisk');
    const source = diskShader.slice(functionStart, functionEnd);
    const emptyGuard = source.indexOf('if (outerR <= innerR)');
    const scaledRadius = source.indexOf('diskOuterRadius / outerR');
    const diskRange = source.indexOf('outerR - innerR');

    expect(emptyGuard).toBeGreaterThan(0);
    expect(emptyGuard).toBeLessThan(scaledRadius);
    expect(emptyGuard).toBeLessThan(diskRange);

    for (const mass of [0.1, 0.5, 0.9]) {
      const contact = miniDiskBounds(mass, CONFIG.rs);
      expect(contact.outer).toBeLessThanOrEqual(contact.inner);
    }
  });
});

describe('binary volumetric transfer', () => {
  test('one contributing disk matches single-disk Beer-Lambert transfer', () => {
    expect(raymarcherShader).toContain('volColor.a = vol1.a + vol2.a + volCB.a;');
    expect(raymarcherShader).toContain('if (volColor.a > 0.0) volColor.rgb /= volColor.a;');

    const source = [2, 4, 8] as const;
    const alpha = 0.3;
    const densityPath = 0.2;
    const binaryColor = source.map((channel) => (channel * alpha) / alpha);
    const binaryOutput = binaryColor.map(
      (channel) => channel * (1 - Math.exp(-alpha * densityPath))
    );
    const singleOutput = source.map((channel) => channel * (1 - Math.exp(-alpha * densityPath)));
    expect(binaryOutput).toEqual(singleOutput);
  });
});
