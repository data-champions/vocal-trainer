import {
  GAP_SECONDS,
  PIANO_RELEASE_SECONDS,
  PIANO_SAMPLE_BASE_URL,
  PIANO_SAMPLE_MAP,
} from './constants';

type ToneModule = typeof import('tone');

export type PianoRendering = {
  samples: Float32Array;
  sampleRate: number;
};

export type PianoNoteEvent = {
  note: string;
  durationSeconds: number;
};

let toneModulePromise: Promise<ToneModule> | null = null;
let pianoPreloadPromise: Promise<void> | null = null;
let pianoSamplesReady = false;

export function loadToneModule(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import('tone');
  }
  return toneModulePromise;
}

export function preloadPianoSamples(): Promise<void> {
  if (pianoSamplesReady) {
    return Promise.resolve();
  }
  if (!pianoPreloadPromise) {
    pianoPreloadPromise = (async () => {
      const Tone = await loadToneModule();
      const sampler = new Tone.Sampler({
        urls: PIANO_SAMPLE_MAP,
        release: PIANO_RELEASE_SECONDS,
        baseUrl: PIANO_SAMPLE_BASE_URL,
      });
      await sampler.loaded;
      sampler.dispose();
      pianoSamplesReady = true;
    })().catch((error) => {
      console.error('Errore nel pre-caricamento del pianoforte', error);
      pianoPreloadPromise = null;
      throw error;
    });
  }
  return pianoPreloadPromise.then(() => {
    pianoSamplesReady = true;
  });
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  if (channels.length === 1) {
    return channels[0];
  }
  const length = channels[0].length;
  const mono = new Float32Array(length);
  channels.forEach((channel) => {
    for (let i = 0; i < length; i += 1) {
      mono[i] += channel[i] / channels.length;
    }
  });
  return mono;
}

export async function renderPianoSequence(
  notes: string[],
  durationSeconds: number,
  gapSeconds: number = GAP_SECONDS
): Promise<PianoRendering | null> {
  if (notes.length === 0) {
    return null;
  }

  await preloadPianoSamples();
  const Tone = await loadToneModule();
  const sustainSynthRelease = 0.6;
  const releaseTail =
    Math.max(PIANO_RELEASE_SECONDS, sustainSynthRelease) + 0.5;
  const sequenceSpan =
    notes.length * (durationSeconds + gapSeconds) - gapSeconds;
  const offlineDuration = Math.max(
    sequenceSpan + releaseTail,
    durationSeconds + releaseTail
  );
  const toneBuffer = await Tone.Offline(async () => {
    const masterGain = new Tone.Gain(0.85).toDestination();
    const sampler = new Tone.Sampler({
      urls: PIANO_SAMPLE_MAP,
      release: PIANO_RELEASE_SECONDS,
      baseUrl: PIANO_SAMPLE_BASE_URL,
    }).connect(masterGain);
    const sustainLayer = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: 0,
        sustain: 1,
        release: sustainSynthRelease,
      },
    }).connect(new Tone.Gain(0.35).connect(masterGain));
    await Tone.loaded();

    let cursor = 0;
    notes.forEach((note) => {
      sampler.triggerAttackRelease(note, durationSeconds, cursor, 0.9);
      // Subtle sustained layer keeps the pitch audible for the full duration.
      sustainLayer.triggerAttackRelease(note, durationSeconds, cursor, 0.5);
      cursor += durationSeconds + gapSeconds;
    });
  }, offlineDuration);

  const channelData = toneBuffer.toArray();
  const channels = Array.isArray(channelData) ? channelData : [channelData];
  if (channels.length === 0) {
    return null;
  }

  const samples = mixToMono(channels);
  return { samples, sampleRate: toneBuffer.sampleRate };
}

export async function renderPianoMelody(
  notes: PianoNoteEvent[],
  gapSeconds: number = GAP_SECONDS
): Promise<PianoRendering | null> {
  const playableNotes = notes.filter(
    (note) => note.note && note.durationSeconds > 0
  );
  if (playableNotes.length === 0) {
    return null;
  }

  await preloadPianoSamples();
  const Tone = await loadToneModule();
  const sustainSynthRelease = 0.6;
  const releaseTail =
    Math.max(PIANO_RELEASE_SECONDS, sustainSynthRelease) + 0.5;
  const sequenceSpan =
    playableNotes.reduce(
      (total, note) => total + note.durationSeconds,
      0
    ) + gapSeconds * Math.max(0, playableNotes.length - 1);
  const offlineDuration = Math.max(sequenceSpan + releaseTail, releaseTail);

  const toneBuffer = await Tone.Offline(async () => {
    const masterGain = new Tone.Gain(0.85).toDestination();
    const sampler = new Tone.Sampler({
      urls: PIANO_SAMPLE_MAP,
      release: PIANO_RELEASE_SECONDS,
      baseUrl: PIANO_SAMPLE_BASE_URL,
    }).connect(masterGain);
    const sustainLayer = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: 0,
        sustain: 1,
        release: sustainSynthRelease,
      },
    }).connect(new Tone.Gain(0.35).connect(masterGain));
    await Tone.loaded();

    let cursor = 0;
    playableNotes.forEach((note) => {
      sampler.triggerAttackRelease(note.note, note.durationSeconds, cursor, 0.9);
      sustainLayer.triggerAttackRelease(
        note.note,
        note.durationSeconds,
        cursor,
        0.5
      );
      cursor += note.durationSeconds + gapSeconds;
    });
  }, offlineDuration);

  const channelData = toneBuffer.toArray();
  const channels = Array.isArray(channelData) ? channelData : [channelData];
  if (channels.length === 0) {
    return null;
  }

  const samples = mixToMono(channels);
  return { samples, sampleRate: toneBuffer.sampleRate };
}

export function isPianoReady(): boolean {
  return pianoSamplesReady;
}
