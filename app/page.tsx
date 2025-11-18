"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SAMPLE_RATE = 44_100;
const GAP_SECONDS = 0.05;
const PIANO_SAMPLE_BASE_URL = "https://tonejs.github.io/audio/salamander/";
const PIANO_SAMPLE_MAP = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  "D#1": "Ds1.mp3",
  "F#1": "Fs1.mp3",
  A1: "A1.mp3",
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  "D#6": "Ds6.mp3",
  "F#6": "Fs6.mp3",
  A6: "A6.mp3",
  C7: "C7.mp3",
  "D#7": "Ds7.mp3",
  "F#7": "Fs7.mp3",
  A7: "A7.mp3",
  C8: "C8.mp3"
} as const;

// Whole steps (2) and half steps (1) for a major scale: T-T-ST-T-T-T-ST
const MAJOR_SCALE_INTERVALS = [2, 2, 1, 2, 2, 2, 1];

const PIANO_KEYS = [
  "C8",
  "B7", "A#7", "A7", "G#7", "G7", "F#7", "F7", "E7", "D#7", "D7", "C#7", "C7",
  "B6", "A#6", "A6", "G#6", "G6", "F#6", "F6", "E6", "D#6", "D6", "C#6", "C6",
  "B5", "A#5", "A5", "G#5", "G5", "F#5", "F5", "E5", "D#5", "D5", "C#5", "C5",
  "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4", "C#4", "C4",
  "B3", "A#3", "A3", "G#3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3",
  "B2", "A#2", "A2", "G#2", "G2", "F#2", "F2", "E2", "D#2", "D2", "C#2", "C2",
  "B1", "A#1", "A1", "G#1", "G1", "F#1", "F1", "E1", "D#1", "D1", "C#1", "C1",
  "B0", "A#0", "A0"
];

const ASCENDING_KEYS = [...PIANO_KEYS].reverse();

const NOTE_TO_ITALIAN: Record<string, string> = {
  C: "Do",
  "C#": "Do#",
  D: "Re",
  "D#": "Re#",
  E: "Mi",
  F: "Fa",
  "F#": "Fa#",
  G: "Sol",
  "G#": "Sol#",
  A: "La",
  "A#": "La#",
  B: "Si"
};

type ToneModule = typeof import("tone");

type PianoRendering = {
  samples: Float32Array;
  sampleRate: number;
};

let toneModulePromise: Promise<ToneModule> | null = null;
let pianoPreloadPromise: Promise<void> | null = null;
let pianoSamplesReady = false;

function loadToneModule(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import("tone");
  }
  return toneModulePromise;
}

function preloadPianoSamples(): Promise<void> {
  if (pianoSamplesReady) {
    return Promise.resolve();
  }
  if (!pianoPreloadPromise) {
    pianoPreloadPromise = (async () => {
      const Tone = await loadToneModule();
      const sampler = new Tone.Sampler({
        urls: PIANO_SAMPLE_MAP,
        release: 2,
        baseUrl: PIANO_SAMPLE_BASE_URL
      });
      await sampler.loaded;
      sampler.dispose();
      pianoSamplesReady = true;
    })().catch((error) => {
      console.error("Errore nel pre-caricamento del pianoforte", error);
      pianoPreloadPromise = null;
      throw error;
    });
  }
  return pianoPreloadPromise.then(() => {
    pianoSamplesReady = true;
  });
}

function mixToMono(channels: Float32Array[]): Float32Array {
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

async function renderPianoSequence(
  notes: string[],
  durationSeconds: number,
  gapSeconds = GAP_SECONDS
): Promise<PianoRendering | null> {
  if (notes.length === 0) {
    return null;
  }

  await preloadPianoSamples();
  const Tone = await loadToneModule();
  const releaseTail = 1.5;
  const sequenceSpan = notes.length * (durationSeconds + gapSeconds) - gapSeconds;
  const offlineDuration = Math.max(sequenceSpan + releaseTail, durationSeconds + releaseTail);
  const toneBuffer = await Tone.Offline(async () => {
    const sampler = new Tone.Sampler({
      urls: PIANO_SAMPLE_MAP,
      release: 2,
      baseUrl: PIANO_SAMPLE_BASE_URL
    }).toDestination();
    await Tone.loaded();

    let cursor = 0;
    notes.forEach((note) => {
      sampler.triggerAttackRelease(note, durationSeconds, cursor, 0.9);
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

type VocalRangeKey =
  | "soprano"
  | "mezzo-soprano"
  | "contralto"
  | "countertenor"
  | "tenor"
  | "baritone"
  | "bass";

const VOCAL_RANGES: Record<VocalRangeKey, { label: string; min: string; max: string }> = {
  soprano: { label: "Soprano", min: "C4", max: "A5" },
  "mezzo-soprano": { label: "Mezzo-soprano", min: "A3", max: "F#5" },
  contralto: { label: "Contralto", min: "F3", max: "D5" },
  countertenor: { label: "Countertenore", min: "G3", max: "E5" },
  tenor: { label: "Tenore", min: "C3", max: "A4" },
  baritone: { label: "Baritono", min: "A2", max: "F4" },
  bass: { label: "Basso", min: "F2", max: "E4" }
};

const noteIndex = (note: string): number => ASCENDING_KEYS.indexOf(note);

type Feedback =
  | { type: "success" | "info" | "warning"; message: string }
  | null;

function removeDigits(note: string): string {
  return note.replace(/\d/g, "");
}

function extractOctave(note: string): string {
  const match = note.match(/\d+/);
  return match ? match[0] : "";
}

function toItalianLabel(note: string): string {
  const base = removeDigits(note);
  return `${NOTE_TO_ITALIAN[base] ?? base}${extractOctave(note)}`;
}

function formatNoteByNotation(note: string, mode: "italian" | "english"): string {
  return mode === "italian" ? toItalianLabel(note) : note;
}


function buildAscendingNotes(startNote: string, count: number): string[] {
  if (count <= 0) {
    return [];
  }
  const startIdx = ASCENDING_KEYS.indexOf(startNote);
  if (startIdx === -1) {
    return [];
  }
  const ascending: string[] = [ASCENDING_KEYS[startIdx]];
  let currentIdx = startIdx;
  for (let i = 0; i < count - 1; i += 1) {
    const interval = MAJOR_SCALE_INTERVALS[i % MAJOR_SCALE_INTERVALS.length];
    currentIdx += interval;
    if (currentIdx >= ASCENDING_KEYS.length) {
      break;
    }
    ascending.push(ASCENDING_KEYS[currentIdx]);
  }
  return ascending;
}

function buildSequence(startNote: string, count: number): string[] {
  const ascending = buildAscendingNotes(startNote, count);
  if (ascending.length === 0) {
    return [startNote];
  }

  const descending = ascending.slice(0, -1).reverse();
  return [...ascending, ...descending];
}

function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE, numChannels = 1): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

export default function HomePage(): JSX.Element {
  const [notationMode, setNotationMode] = useState<"italian" | "english">("italian");
  const [vocalRange, setVocalRange] = useState<VocalRangeKey>("mezzo-soprano");
  const [selectedNote, setSelectedNote] = useState("");
  const [duration, setDuration] = useState(1);
  const [noteCount, setNoteCount] = useState(3);
  const [playMode, setPlayMode] = useState<"single" | "loop">("single");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sequenceDescription, setSequenceDescription] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ type: "info", message: "Seleziona una nota per iniziare." });
  const [isRendering, setIsRendering] = useState(false);
  const [isPianoReady, setIsPianoReady] = useState(pianoSamplesReady);
  const generationIdRef = useRef(0);
  const selectedRange = VOCAL_RANGES[vocalRange];
  const rangeBounds = useMemo(() => {
    const startIdx = noteIndex(selectedRange.min);
    const endIdx = noteIndex(selectedRange.max);
    return { startIdx, endIdx };
  }, [selectedRange.min, selectedRange.max]);
  const rangeNotesAsc = useMemo(() => {
    if (rangeBounds.startIdx === -1 || rangeBounds.endIdx === -1) {
      return ASCENDING_KEYS;
    }
    return ASCENDING_KEYS.slice(rangeBounds.startIdx, rangeBounds.endIdx + 1);
  }, [rangeBounds.startIdx, rangeBounds.endIdx]);
  const allowedNoteSet = useMemo(() => new Set(rangeNotesAsc), [rangeNotesAsc]);
  const availableNotes = useMemo(
    () => PIANO_KEYS.filter((note) => allowedNoteSet.has(note)),
    [allowedNoteSet]
  );
  const currentNoteIndex = useMemo(() => (selectedNote ? noteIndex(selectedNote) : -1), [selectedNote]);
  const canStepDown =
    currentNoteIndex !== -1 && rangeBounds.startIdx !== -1 && currentNoteIndex > rangeBounds.startIdx;
  const canStepUp =
    currentNoteIndex !== -1 && rangeBounds.endIdx !== -1 && currentNoteIndex < rangeBounds.endIdx;
  const generateAudioForNote = useCallback(
    async (note: string): Promise<boolean> => {
      if (!note) {
        return false;
      }
      const generatedSequence = buildSequence(note, noteCount);
      if (generatedSequence.length === 0) {
        setFeedback({ type: "warning", message: "La sequenza generata è vuota." });
        return false;
      }

      const requestId = generationIdRef.current + 1;
      generationIdRef.current = requestId;
      setIsRendering(true);
      setFeedback({
        type: "info",
        message: isPianoReady ? "Sto preparando un vero pianoforte..." : "Carico i campioni del pianoforte..."
      });

      try {
        const rendering = await renderPianoSequence(generatedSequence, duration, GAP_SECONDS);
        if (!rendering || rendering.samples.length === 0) {
          if (generationIdRef.current === requestId) {
            setFeedback({ type: "warning", message: "Nessun audio generato; riprova con una durata maggiore." });
          }
          return false;
        }

        const wavBuffer = encodeWav(rendering.samples, rendering.sampleRate, 1);
        const blob = new Blob([wavBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        if (generationIdRef.current !== requestId) {
          URL.revokeObjectURL(url);
          return false;
        }
        setAudioUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return url;
        });

        const display = generatedSequence.map((sequenceNote) => formatNoteByNotation(sequenceNote, notationMode)).join(", ");
        setSequenceDescription(display);
        setFeedback({
          type: "success",
          message:
            playMode === "loop"
              ? "Pianoforte pronto in modalità ripetizione infinita. Premi play sul lettore."
              : "Pianoforte pronto. Premi play sul lettore."
        });
        return true;
      } catch (error) {
        console.error("Errore nella generazione del pianoforte", error);
        if (generationIdRef.current === requestId) {
          setFeedback({ type: "warning", message: "Errore nella generazione del suono di pianoforte." });
        }
        return false;
      } finally {
        if (generationIdRef.current === requestId) {
          setIsRendering(false);
        }
      }
    },
    [noteCount, duration, notationMode, playMode, isPianoReady]
  );

  const handleHalfStep = (direction: 1 | -1) => {
    if (!selectedNote) {
      return;
    }
    const idx = noteIndex(selectedNote);
    if (idx === -1) {
      return;
    }
    const nextIdx = idx + direction;
    if (
      nextIdx < 0 ||
      nextIdx >= ASCENDING_KEYS.length ||
      (rangeBounds.startIdx !== -1 && nextIdx < rangeBounds.startIdx) ||
      (rangeBounds.endIdx !== -1 && nextIdx > rangeBounds.endIdx)
    ) {
      return;
    }
    const nextNote = ASCENDING_KEYS[nextIdx];
    setSelectedNote(nextNote);
    if (audioUrl) {
      void generateAudioForNote(nextNote);
    }
  };

  useEffect(() => {
    let cancelled = false;
    preloadPianoSamples()
      .then(() => {
        if (!cancelled) {
          setIsPianoReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsPianoReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }
    if (!allowedNoteSet.has(selectedNote)) {
      const currentIdx = noteIndex(selectedNote);
      let fallbackIdx = -1;
      if (rangeBounds.startIdx !== -1 && currentIdx !== -1 && currentIdx < rangeBounds.startIdx) {
        fallbackIdx = rangeBounds.startIdx;
      } else if (rangeBounds.endIdx !== -1 && currentIdx !== -1 && currentIdx > rangeBounds.endIdx) {
        fallbackIdx = rangeBounds.endIdx;
      } else if (rangeBounds.startIdx !== -1) {
        fallbackIdx = rangeBounds.startIdx;
      }
      const fallbackNote =
        fallbackIdx !== -1 ? ASCENDING_KEYS[fallbackIdx] : availableNotes[0] ?? "";
      setSelectedNote(fallbackNote);
      if (fallbackNote && audioUrl) {
        void generateAudioForNote(fallbackNote);
      }
    }
  }, [
    allowedNoteSet,
    selectedNote,
    availableNotes,
    rangeBounds.startIdx,
    rangeBounds.endIdx,
    audioUrl,
    generateAudioForNote
  ]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const maxNotes = useMemo(() => {
    if (!selectedNote) {
      return 20;
    }
    const ascending = buildAscendingNotes(selectedNote, PIANO_KEYS.length);
    return ascending.length > 0 ? ascending.length : 1;
  }, [selectedNote]);

  useEffect(() => {
    const maxSelectable = Math.min(maxNotes, 16);
    if (noteCount > maxSelectable) {
      setNoteCount(maxSelectable);
    }
  }, [maxNotes, noteCount]);

  const sequence = useMemo(() => {
    if (!selectedNote) {
      return [];
    }
    return buildSequence(selectedNote, noteCount);
  }, [selectedNote, noteCount]);

  const sequenceDisplay = useMemo(() => {
    if (sequence.length === 0) {
      return "";
    }
    return sequence.map((note) => formatNoteByNotation(note, notationMode)).join(", ");
  }, [sequence, notationMode]);

  useEffect(() => {
    if (!audioUrl || sequence.length === 0) {
      return;
    }
    if (sequenceDescription !== sequenceDisplay) {
      setSequenceDescription(sequenceDisplay);
    }
  }, [audioUrl, sequence.length, sequenceDisplay, sequenceDescription]);

  const handlePlay = () => {
    if (!selectedNote) {
      setFeedback({ type: "warning", message: "Scegli una nota prima di avviare la riproduzione." });
      return;
    }
    void generateAudioForNote(selectedNote);
  };

  const handleStop = () => {
    generationIdRef.current += 1;
    setIsRendering(false);
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setSequenceDescription("");
    setFeedback({ type: "info", message: "Riproduzione interrotta." });
  };

  return (
    <main>
      <h1>Voice trainer 🎹</h1>
      <div className="card-grid">
        <fieldset>
          <legend>Impostazioni di notazione</legend>
          <div className="toggle-row">
            <p>Notazione</p>
            <div className="toggle-group" role="group" aria-label="Seleziona la notazione">
              <button
                type="button"
                className={`toggle-option${notationMode === "italian" ? " active" : ""}`}
                aria-pressed={notationMode === "italian"}
                onClick={() => setNotationMode("italian")}
              >
                🇮🇹 Italiana
              </button>
              <button
                type="button"
                className={`toggle-option${notationMode === "english" ? " active" : ""}`}
                aria-pressed={notationMode === "english"}
                onClick={() => setNotationMode("english")}
              >
                🇬🇧 Inglese
              </button>
            </div>
          </div>
          <label htmlFor="vocal-range-select" style={{ marginTop: "12px", display: "block" }}>
            Estensione vocale
            <select
              id="vocal-range-select"
              value={vocalRange}
              onChange={(event) => setVocalRange(event.target.value as VocalRangeKey)}
            >
              {(Object.keys(VOCAL_RANGES) as VocalRangeKey[]).map((rangeKey) => {
                const range = VOCAL_RANGES[rangeKey];
                const minLabel = formatNoteByNotation(range.min, notationMode);
                const maxLabel = formatNoteByNotation(range.max, notationMode);
                return (
                  <option key={rangeKey} value={rangeKey}>
                    {`${range.label} (${minLabel}–${maxLabel})`}
                  </option>
                );
              })}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Sequenza e controlli</legend>
          <label htmlFor="note-select">
            Nota iniziale
            <select
              id="note-select"
              className={!selectedNote ? "error-input" : undefined}
              value={selectedNote}
              onChange={(event) => setSelectedNote(event.target.value)}
            >
              <option value="" disabled>
                Seleziona la nota
              </option>
              {availableNotes.map((note) => (
                <option key={note} value={note}>
                  {formatNoteByNotation(note, notationMode)}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="duration-slider">
            Durata di ogni nota: {duration.toFixed(1)} secondi
            <input
              id="duration-slider"
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </label>

          <label htmlFor="note-count">
            Numero di note ascendenti
            <select
              id="note-count"
              value={String(noteCount)}
              onChange={(event) => setNoteCount(Number(event.target.value))}
            >
              {[1, 2, 3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((option) => (
                <option
                  key={option}
                  value={option}
                  disabled={option > Math.min(maxNotes, 16)}
                >
                  {option}
                </option>
              ))}
            </select>
            <small>Massimo disponibile: {Math.min(maxNotes, 16)}</small>
          </label>

          {sequence.length > 0 && (
            <p className="note-display">
              Sequenza selezionata: {sequenceDisplay}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "12px",
              marginTop: "16px"
            }}
          >
            <button
              className="primary-button"
              type="button"
              onClick={handlePlay}
              disabled={!selectedNote || isRendering}
              style={{ width: "80%", minWidth: 0 }}
            >
              {isRendering ? "🎹 In preparazione" : "▶️ Avvia"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleStop}
              disabled={!audioUrl && !isRendering}
              style={{ width: "80%", minWidth: 0 }}
            >
              ⏹️ Ferma
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-label="Abbassa nota di mezzo tono"
              onClick={() => handleHalfStep(-1)}
              disabled={!canStepDown}
              style={{ width: "80%", minWidth: 0 }}
            >
              ⬇️ Nota giù
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-label="Alza nota di mezzo tono"
              onClick={() => handleHalfStep(1)}
              disabled={!canStepUp}
              style={{ width: "80%", minWidth: 0 }}
            >
              ⬆️ Nota su
            </button>
          </div>
          {feedback && (
            <div className={`feedback ${feedback.type}`} style={{ marginTop: "12px" }}>
              {feedback.message}
            </div>
          )}
        </fieldset>
      </div>

      {audioUrl && (
        <fieldset style={{ marginTop: "16px" }}>
          <legend>Modalità e riproduzione</legend>
          <div className="toggle-row">
            <div className="toggle-group" role="group" aria-label="Seleziona la modalità di riproduzione">
              <button
                type="button"
                className={`toggle-option${playMode === "single" ? " active" : ""}`}
                aria-pressed={playMode === "single"}
                onClick={() => setPlayMode("single")}
              >
                ▶️ Play
              </button>
              <button
                type="button"
                className={`toggle-option${playMode === "loop" ? " active" : ""}`}
                aria-pressed={playMode === "loop"}
                onClick={() => setPlayMode("loop")}
              >
                🔁 Ripetizione infinita
              </button>
            </div>
          </div>

          <div className="player-card" style={{ marginTop: "12px" }}>
            <audio
              key={audioUrl}
              controls
              autoPlay
              loop={playMode === "loop"}
              src={audioUrl ?? undefined}
              aria-label={sequenceDescription ? `Sequenza: ${sequenceDescription}` : "Audio generato"}
            />
          </div>
        </fieldset>
      )}
    </main>
  );
}
