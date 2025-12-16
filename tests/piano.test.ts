import { describe, expect, it } from 'vitest';
import { mixToMono } from '../lib/piano';

describe('piano utilities', () => {
  it('mixToMono averages multiple channels', () => {
    const ch1 = new Float32Array([1, 1, -1, -1]);
    const ch2 = new Float32Array([1, -1, 1, -1]);
    const mono = mixToMono([ch1, ch2]);
    expect(Array.from(mono)).toEqual([1, 0, 0, -1]);
  });

  it('mixToMono returns empty array when no channels are provided', () => {
    const mono = mixToMono([]);
    expect(mono.length).toBe(0);
  });
});
