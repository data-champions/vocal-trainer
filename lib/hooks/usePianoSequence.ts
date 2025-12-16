import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodeWav } from '../audio';
import {
  DEFAULT_NOTATION_MODE,
  GAP_SECONDS,
  type NotationMode,
} from '../constants';
import { renderPianoSequence, isPianoReady as isPianoSamplesReady } from '../piano';
import {
  ASCENDING_KEYS,
  PIANO_KEYS,
  PianoKey,
  buildAscendingNotes,
  buildSequence,
  formatNoteByNotation,
  noteIndex,
} from '../notes';
import { useLatestRef } from './common';
import type { Feedback, PlaybackSegment } from '../types';

type RangeBounds = { startIdx: number; endIdx: number };

type UsePianoSequenceParams = {
  notationMode?: NotationMode;
  playMode: 'single' | 'loop';
  selectedNote: PianoKey | '';
  setSelectedNote: (note: PianoKey | '') => void;
  noteCount: number;
  duration: number;
  allowedNoteSet: Set<PianoKey>;
  availableNotes: PianoKey[];
  rangeBounds: RangeBounds;
  onTargetReset?: () => void;
};

export function usePianoSequence({
  notationMode = DEFAULT_NOTATION_MODE,
  playMode,
  selectedNote,
  setSelectedNote,
  noteCount,
  duration,
  allowedNoteSet,
  availableNotes,
  rangeBounds,
  onTargetReset,
}: UsePianoSequenceParams) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({
    type: 'info',
    message: 'Seleziona una nota per iniziare.',
  });
  const [sequenceDescription, setSequenceDescription] = useState('');
  const [isPianoReady, setIsPianoReady] = useState(isPianoSamplesReady());
  const generationIdRef = useRef(0);
  const playbackScheduleRef = useRef<PlaybackSegment[] | null>(null);
  const lastScheduleNoteRef = useRef<string | null>(null);
  const selectedNoteRef = useLatestRef(selectedNote);

  const maxNotes = useMemo(() => {
    if (!selectedNote) {
      return 20;
    }
    const ascending = buildAscendingNotes(selectedNote, PIANO_KEYS.length);
    return ascending.length > 0 ? ascending.length : 1;
  }, [selectedNote]);

  const sequence = useMemo(() => {
    if (!selectedNote) {
      return [];
    }
    return buildSequence(selectedNote, noteCount);
  }, [selectedNote, noteCount]);

  const sequenceDisplay = useMemo(() => {
    if (sequence.length === 0) {
      return '';
    }
    return sequence
      .map((note) => formatNoteByNotation(note, notationMode))
      .join(', ');
  }, [sequence, notationMode]);

  const currentNoteIndex = useMemo(
    () => (selectedNote ? noteIndex(selectedNote) : -1),
    [selectedNote]
  );

  const canStepDown =
    currentNoteIndex !== -1 &&
    rangeBounds.startIdx !== -1 &&
    currentNoteIndex > rangeBounds.startIdx;
  const canStepUp =
    currentNoteIndex !== -1 &&
    rangeBounds.endIdx !== -1 &&
    currentNoteIndex < rangeBounds.endIdx;

  const handleHalfStep = useCallback(
    (direction: 1 | -1) => {
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
    },
    [selectedNote, rangeBounds.startIdx, rangeBounds.endIdx, setSelectedNote]
  );

  const generateAudioForNote = useCallback(
    async (note: string): Promise<boolean> => {
      if (!note) {
        return false;
      }
      const generatedSequence = buildSequence(note, noteCount);
      if (generatedSequence.length === 0) {
        setFeedback({
          type: 'warning',
          message: 'La sequenza generata è vuota.',
        });
        return false;
      }

      const requestId = generationIdRef.current + 1;
      generationIdRef.current = requestId;
      setFeedback({
        type: 'info',
        message: isPianoReady
          ? 'Sto preparando un vero pianoforte...'
          : 'Carico i campioni del pianoforte...',
      });

      try {
        const rendering = await renderPianoSequence(
          generatedSequence,
          duration,
          GAP_SECONDS
        );
        if (!rendering || rendering.samples.length === 0) {
          if (generationIdRef.current === requestId) {
            setFeedback({
              type: 'warning',
              message:
                'Nessun audio generato; riprova con una durata maggiore.',
            });
          }
          return false;
        }

        const wavBuffer = encodeWav(rendering.samples, rendering.sampleRate, 1);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
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

        const display = generatedSequence
          .map((sequenceNote) =>
            formatNoteByNotation(sequenceNote, notationMode)
          )
          .join(', ');
        setSequenceDescription(display);
        setFeedback({
          type: 'success',
          message:
            playMode === 'loop'
              ? 'Pianoforte pronto in modalità ripetizione infinita. Premi play sul lettore.'
              : 'Pianoforte pronto. Premi play sul lettore.',
        });
        const segments = generatedSequence.map((sequenceNote, idx) => {
          const start = idx * (duration + GAP_SECONDS);
          return { note: sequenceNote, start, end: start + duration };
        });
        playbackScheduleRef.current = segments;
        lastScheduleNoteRef.current = null;
        onTargetReset?.();
        return true;
      } catch (error) {
        console.error('Errore nella generazione del pianoforte', error);
        if (generationIdRef.current === requestId) {
          setFeedback({
            type: 'warning',
            message: 'Errore nella generazione del suono di pianoforte.',
          });
        }
        return false;
      } finally {
        // no-op
      }
    },
    [noteCount, duration, notationMode, playMode, isPianoReady, onTargetReset]
  );

  useEffect(() => {
    let cancelled = false;
    renderWarmup()
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

  async function renderWarmup() {
    await renderPianoSequence(['C4'], 0.1, GAP_SECONDS);
  }

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }
    if (!allowedNoteSet.has(selectedNote)) {
      const currentIdx = noteIndex(selectedNote);
      let fallbackIdx = -1;
      if (
        rangeBounds.startIdx !== -1 &&
        currentIdx !== -1 &&
        currentIdx < rangeBounds.startIdx
      ) {
        fallbackIdx = rangeBounds.startIdx;
      } else if (
        rangeBounds.endIdx !== -1 &&
        currentIdx !== -1 &&
        currentIdx > rangeBounds.endIdx
      ) {
        fallbackIdx = rangeBounds.endIdx;
      } else if (rangeBounds.startIdx !== -1) {
        fallbackIdx = rangeBounds.startIdx;
      }
      const fallbackNote =
        fallbackIdx !== -1
          ? ASCENDING_KEYS[fallbackIdx]
          : availableNotes[0] ?? '';
      setSelectedNote(fallbackNote);
    }
  }, [
    allowedNoteSet,
    selectedNote,
    availableNotes,
    rangeBounds.startIdx,
    rangeBounds.endIdx,
    setSelectedNote,
  ]);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }
    void generateAudioForNote(selectedNote);
  }, [selectedNote, noteCount, duration, generateAudioForNote]);

  return {
    audioUrl,
    feedback,
    sequenceDescription,
    setSequenceDescription,
    isPianoReady,
    maxNotes,
    sequence,
    sequenceDisplay,
    handleHalfStep,
    canStepDown,
    canStepUp,
    generateAudioForNote,
    hasAudio: Boolean(audioUrl),
    playbackScheduleRef,
    lastScheduleNoteRef,
    selectedNoteRef,
  };
}
