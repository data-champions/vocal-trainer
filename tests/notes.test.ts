import { describe, expect, it } from 'vitest';
import {
  buildSequence,
  frequencyToNearestNoteName,
  midiFrequency,
  toItalianLabel,
} from '../lib/notes';

describe('notes utilities', () => {
  it('buildSequence returns ascending then descending notes', () => {
    const seq = buildSequence('C4', 3);
    expect(seq).toEqual(['C4', 'D4', 'E4', 'D4', 'C4']);
  });

  it('midiFrequency and frequencyToNearestNoteName round-trip A4', () => {
    const freq = midiFrequency('A4');
    expect(freq).toBeCloseTo(440, 6);
    expect(frequencyToNearestNoteName(freq)).toBe('A4');
  });

  it('toItalianLabel converts names preserving octave', () => {
    expect(toItalianLabel('C#5')).toBe('Do#5');
    expect(toItalianLabel('B3')).toBe('Si3');
  });
});
