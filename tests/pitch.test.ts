import { describe, expect, it } from 'vitest';
import {
  computeSplDb,
  getPitchAdvice,
  isBelowNoiseFloor,
  rmsFromSamples,
} from '../lib/pitch';

describe('pitch utilities', () => {
  it('getPitchAdvice returns direction outside tolerance', () => {
    expect(getPitchAdvice(440, 470)).toBe('⬇️'); // voice above target
    expect(getPitchAdvice(440, 410)).toBe('⬆️'); // voice below target
    expect(getPitchAdvice(440, 440.5)).toBe('✅'); // within tolerance
  });

  it('rms and SPL calculations behave for common signals', () => {
    expect(rmsFromSamples(new Float32Array([1, 1, 1, 1]))).toBeCloseTo(1, 6);
    expect(computeSplDb(new Float32Array([1, 1, 1, 1]))).toBeCloseTo(0, 1);
    expect(computeSplDb(new Float32Array([0, 0, 0, 0]))).toBeLessThan(-100);
  });

  it('isBelowNoiseFloor respects threshold', () => {
    expect(isBelowNoiseFloor(-80, 30)).toBe(true); // cutoff -70
    expect(isBelowNoiseFloor(-60, 30)).toBe(false);
  });
});
