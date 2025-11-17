"use client";

import { useEffect, useMemo, useState } from "react";

const SAMPLE_RATE = 44_100;
const GAP_SECONDS = 0.05;

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

function midiFrequency(note: string): number {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Number(note.slice(-1));
  const name = note.slice(0, -1);
  const midiNum = names.indexOf(name) + 12 * (octave + 1);
  return 440 * 2 ** ((midiNum - 69) / 12);
}

function createNoteSamples(note: string, durationSeconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const samples = new Float32Array(length);
  const freq = midiFrequency(note);

  const attack = Math.max(1, Math.floor(0.02 * sampleRate));
  const decay = Math.max(1, Math.floor(0.1 * sampleRate));
  const release = Math.max(1, Math.floor(0.3 * sampleRate));
  const sustainLevel = 0.6;

  let maxAmp = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const fundamental = Math.sin(2 * Math.PI * freq * t) * 0.6;
    const second = Math.sin(2 * Math.PI * 2 * freq * t) * 0.3;
    const third = Math.sin(2 * Math.PI * 3 * freq * t) * 0.1;

    let envelope = sustainLevel;
    if (i < attack) {
      envelope = i / attack;
    } else if (i < attack + decay) {
      const progress = (i - attack) / decay;
      envelope = 1 - (1 - sustainLevel) * progress;
    } else if (i >= Math.max(length - release, 0)) {
      const progress = (i - Math.max(length - release, 0)) / release;
      envelope = sustainLevel * Math.max(1 - progress, 0);
    }

    const sample = (fundamental + second + third) * envelope;
    samples[i] = sample;
    const abs = Math.abs(sample);
    if (abs > maxAmp) {
      maxAmp = abs;
    }
  }

  if (maxAmp > 0) {
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] /= maxAmp;
    }
  }

  return samples;
}

function buildSequenceSamples(notes: string[], duration: number, sampleRate = SAMPLE_RATE, gapSeconds = GAP_SECONDS): Float32Array {
  if (notes.length === 0) {
    return new Float32Array(0);
  }

  const segments = notes.map((note) => createNoteSamples(note, duration, sampleRate));
  const gapSamples = Math.max(0, Math.floor(gapSeconds * sampleRate));
  const totalLength = segments.reduce(
    (acc, segment, idx) => acc + segment.length + (idx < segments.length - 1 ? gapSamples : 0),
    0
  );
  const track = new Float32Array(totalLength);

  let offset = 0;
  segments.forEach((segment, idx) => {
    track.set(segment, offset);
    offset += segment.length;
    if (gapSamples > 0 && idx < segments.length - 1) {
      offset += gapSamples;
    }
  });

  return track;
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
  const [selectedNote, setSelectedNote] = useState("");
  const [duration, setDuration] = useState(1);
  const [noteCount, setNoteCount] = useState(3);
  const [playMode, setPlayMode] = useState<"single" | "loop">("single");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [sequenceDescription, setSequenceDescription] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ type: "info", message: "Seleziona una nota per iniziare." });

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
    return sequence
      .map((note) => (notationMode === "italian" ? toItalianLabel(note) : note))
      .join(", ");
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
    if (sequence.length === 0) {
      setFeedback({ type: "warning", message: "La sequenza generata è vuota." });
      return;
    }

    const track = buildSequenceSamples(sequence, duration, SAMPLE_RATE, GAP_SECONDS);
    if (track.length === 0) {
      setFeedback({ type: "warning", message: "Nessun audio generato; riprova con una durata maggiore." });
      return;
    }

    const wavBuffer = encodeWav(track, SAMPLE_RATE, 1);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
    setSequenceDescription(sequenceDisplay);
    setFeedback({
      type: "success",
      message:
        playMode === "loop"
          ? "Audio pronto in modalità ripetizione infinita. Premi play sul lettore."
          : "Audio pronto.  premi play sul lettore."
    });
  };

  const handleStop = () => {
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
        </fieldset>

        <fieldset>
          <legend>Sequenza melodica</legend>
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
              {PIANO_KEYS.map((note) => (
                <option key={note} value={note}>
                  {`${toItalianLabel(note)} / ${note}`}
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

          <div className="toggle-row">
            <p>Modalità</p>
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

          {sequence.length > 0 && (
            <p className="note-display">
              Sequenza selezionata: {sequenceDisplay}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>Controlli</legend>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <button className="primary-button" type="button" onClick={handlePlay} disabled={!selectedNote}>
              ▶️ Avvia
            </button>
            <button className="secondary-button" type="button" onClick={handleStop} disabled={!audioUrl}>
              ⏹️ Ferma
            </button>
          </div>
          {feedback && (
            <div className={`feedback ${feedback.type}`}>
              {feedback.message}
            </div>
          )}
        </fieldset>
      </div>

      {audioUrl && (
        <div className="player-card">
          <p>{sequenceDescription ? `Ascoltando: ${sequenceDescription}` : "Audio pronto"}</p>
          <audio
            key={audioUrl}
            controls
            autoPlay
            loop={playMode === "loop"}
            src={audioUrl}
          />
        </div>
      )}
    </main>
  );
}
