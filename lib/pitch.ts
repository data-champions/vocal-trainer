import { getToleranceHzByNote } from './notes';

export function getPitchAdvice(
  targetHz: number | null,
  voiceHz: number | null
): string | null {
  if (
    targetHz === null ||
    voiceHz === null ||
    !Number.isFinite(targetHz) ||
    !Number.isFinite(voiceHz) ||
    targetHz <= 0 ||
    voiceHz <= 0
  ) {
    return null;
  }
  const delta = targetHz - voiceHz;
  const toleranceHz = getToleranceHzByNote(targetHz, 4); // 1/4 tone tolerance
  const diffHz = Math.abs(delta);
  if (diffHz <= toleranceHz) {
    return '✅';
  }
  return delta > 0 ? '⬆️' : '⬇️';
}

export function rmsFromSamples(samples: Float32Array | null): number {
  if (!samples || samples.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples.length);
}

export function splFromRms(rms: number): number {
  const safeRms = rms || 1e-8;
  return 20 * Math.log10(safeRms);
}

export function computeSplDb(samples: Float32Array | null): number {
  return splFromRms(rmsFromSamples(samples));
}

export function isBelowNoiseFloor(
  splDb: number,
  noiseThreshold: number
): boolean {
  const splCutoff = -100 + noiseThreshold; // slider: 0 lets all through, 100 blocks nearly everything
  return splDb < splCutoff;
}
