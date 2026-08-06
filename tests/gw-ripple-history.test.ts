import { describe, expect, test } from 'bun:test';

import { GwRippleHistory } from '../lib/physics/gwRippleHistory';

const CAPACITY = 16;
const INTERVAL = 0.5;

function sampleAt(history: GwRippleHistory, totalIndex: number) {
  const offset = (totalIndex % history.capacity) * 4;
  return {
    sin: history.data[offset],
    cos: history.data[offset + 1],
    amplitude: history.data[offset + 2],
  };
}

function phaseOf(history: GwRippleHistory, totalIndex: number): number {
  const s = sampleAt(history, totalIndex);
  return Math.atan2(s.sin, s.cos);
}

describe('GwRippleHistory', () => {
  test('first advance primes the full buffer to silence', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    const written = history.advance(100, 1.3, 0.8);

    expect(written).toBe(CAPACITY);
    expect(history.head).toBe(CAPACITY - 1);
    expect(history.headTime).toBe(100);
    for (let i = 0; i < CAPACITY; i++) {
      expect(sampleAt(history, i).amplitude).toBe(0);
    }
  });

  test('writes exactly the samples that have come due', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 0, 1);

    expect(history.advance(100 + 3.9 * INTERVAL, 0.4, 1)).toBe(3);
    expect(history.head).toBe(CAPACITY + 2);
    expect(history.headTime).toBeCloseTo(100 + 3 * INTERVAL, 12);

    // Nothing new due yet
    expect(history.advance(100 + 3.95 * INTERVAL, 0.4, 1)).toBe(0);
  });

  test('interpolates the source phase onto the grid between calls', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 1.0, 1);
    // Two grid samples come due, at fractions 1/2 and 1 of the phase change
    history.advance(100 + 2 * INTERVAL, 1.8, 1);

    expect(phaseOf(history, history.head - 1)).toBeCloseTo(1.4, 6);
    expect(phaseOf(history, history.head)).toBeCloseTo(1.8, 6);
  });

  test('interpolates the amplitude onto the grid between calls', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 0, 1);
    history.advance(100 + 2 * INTERVAL, 0, 0.5);

    expect(sampleAt(history, history.head - 1).amplitude).toBeCloseTo(0.75, 6);
    expect(sampleAt(history, history.head).amplitude).toBeCloseTo(0.5, 6);
  });

  test('recorded phase tracks the source across uneven frame times', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 0.2, 1);
    history.advance(100.7, 0.9, 1); // one due sample at t=100.5
    history.advance(101.1, 1.3, 1); // one due sample at t=101.0

    // t=100.5 sits 5/7 of the way from (100, 0.2) to (100.7, 0.9)
    expect(phaseOf(history, history.head - 1)).toBeCloseTo(0.2 + (5 / 7) * 0.7, 6);
    // t=101.0 sits 3/4 of the way from (100.7, 0.9) to (101.1, 1.3)
    expect(phaseOf(history, history.head)).toBeCloseTo(0.9 + 0.75 * 0.4, 6);
  });

  test('clear() forgets emission and the next advance re-primes to silence', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 0, 1);
    history.advance(100 + 4 * INTERVAL, 2.0, 1);

    history.clear();
    expect(history.head).toBe(-1);

    const written = history.advance(200, 5.0, 0.7);
    expect(written).toBe(CAPACITY);
    expect(history.headTime).toBe(200);
    for (let i = 0; i < CAPACITY; i++) {
      expect(sampleAt(history, history.head - i).amplitude).toBe(0);
    }
  });

  test('a gap longer than the buffer re-primes to silence instead of looping', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 0, 1);
    history.advance(100 + INTERVAL, 0.1, 1);

    const written = history.advance(100 + 100 * CAPACITY * INTERVAL, 0.4, 0.5);
    expect(written).toBe(CAPACITY);
    expect(history.headTime).toBe(100 + 100 * CAPACITY * INTERVAL);
    for (let i = 0; i < CAPACITY; i++) {
      expect(sampleAt(history, history.head - i).amplitude).toBe(0);
    }
  });

  test('a time regression (clock reset) re-primes to silence', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 0, 1);

    expect(history.advance(5, 0.4, 0.3)).toBe(CAPACITY);
    expect(history.headTime).toBe(5);
    expect(sampleAt(history, history.head).amplitude).toBe(0);
  });

  test('ring slots wrap: old samples are overwritten in place', () => {
    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    history.advance(100, 0, 1);
    history.advance(100 + CAPACITY * INTERVAL, 0, 0.6);

    // Every retained sample was rewritten one full revolution later,
    // interpolating amplitude from the priming value toward the current one
    expect(sampleAt(history, history.head).amplitude).toBeCloseTo(0.6, 6);
    expect(sampleAt(history, history.head - CAPACITY + 1).amplitude).toBeCloseTo(
      1 + (0.6 - 1) / CAPACITY,
      6
    );
  });

  test('rejects invalid construction and inputs', () => {
    expect(() => new GwRippleHistory(1, INTERVAL)).toThrow(RangeError);
    expect(() => new GwRippleHistory(2.5, INTERVAL)).toThrow(RangeError);
    expect(() => new GwRippleHistory(CAPACITY, 0)).toThrow(RangeError);

    const history = new GwRippleHistory(CAPACITY, INTERVAL);
    expect(() => history.advance(NaN, 0.4, 1)).toThrow(RangeError);
    expect(() => history.advance(100, NaN, 1)).toThrow(RangeError);
    expect(() => history.advance(100, 0.4, -1)).toThrow(RangeError);
  });
});
