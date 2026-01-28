import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { PitchDetector } from 'pitchy';
import { computeSplDb, isBelowNoiseFloor } from '../pitch';
import type { PitchSample } from '../types';
import { useLatestRef, useRafLoop } from './common';

type PitchStatus = 'idle' | 'starting' | 'ready' | 'error';
type AnalyserBuffer = Float32Array;

type UsePitchDetectionParams = {
  noiseThreshold: number;
  selectedRangeFrequencies: { min: number; max: number };
  getTargetFrequency: () => number | null;
  audioElementRef: MutableRefObject<HTMLAudioElement | null>;
};

// Keep the mic stream warm across route changes to avoid repeat prompts.
const SECONDS = 60000; // 60K seconds = several hours
const MIC_STREAM_KEEP_ALIVE_MS = SECONDS * 1000;

type SharedMicHandle = {
  stream: MediaStream;
  release: () => void;
};

let sharedMicStream: MediaStream | null = null;
let sharedMicPromise: Promise<MediaStream> | null = null;
let sharedMicUsers = 0;
let sharedMicStopTimer: ReturnType<typeof setTimeout> | null = null;

const isStreamLive = (stream: MediaStream) =>
  stream.getTracks().some((track) => track.readyState === 'live');

const clearSharedMicStopTimer = () => {
  if (sharedMicStopTimer) {
    clearTimeout(sharedMicStopTimer);
    sharedMicStopTimer = null;
  }
};

const stopSharedMicStream = () => {
  clearSharedMicStopTimer();
  if (sharedMicStream) {
    sharedMicStream.getTracks().forEach((track) => track.stop());
    sharedMicStream = null;
  }
};

const scheduleSharedMicStop = () => {
  clearSharedMicStopTimer();
  if (MIC_STREAM_KEEP_ALIVE_MS <= 0) {
    stopSharedMicStream();
    return;
  }
  sharedMicStopTimer = setTimeout(() => {
    if (sharedMicUsers === 0) {
      stopSharedMicStream();
    }
  }, MIC_STREAM_KEEP_ALIVE_MS);
};

const retainSharedMicStream = () => {
  sharedMicUsers += 1;
  clearSharedMicStopTimer();
};

const releaseSharedMicStream = () => {
  sharedMicUsers = Math.max(0, sharedMicUsers - 1);
  if (sharedMicUsers === 0) {
    scheduleSharedMicStop();
  }
};

const attachStreamLifecycleHandlers = (stream: MediaStream) => {
  const handleEnded = () => {
    if (sharedMicStream === stream) {
      sharedMicStream = null;
    }
  };
  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', handleEnded, { once: true });
  });
  stream.addEventListener('inactive', handleEnded, { once: true });
};

const getSharedMicStream = async (
  constraints: MediaStreamConstraints
): Promise<MediaStream> => {
  if (sharedMicStream && isStreamLive(sharedMicStream)) {
    return sharedMicStream;
  }
  if (sharedMicStream) {
    stopSharedMicStream();
  }
  if (sharedMicPromise) {
    return sharedMicPromise;
  }
  sharedMicPromise = navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      sharedMicStream = stream;
      sharedMicPromise = null;
      attachStreamLifecycleHandlers(stream);
      return stream;
    })
    .catch((error) => {
      sharedMicPromise = null;
      throw error;
    });
  return sharedMicPromise;
};

const acquireSharedMicStream = async (
  constraints: MediaStreamConstraints
): Promise<SharedMicHandle> => {
  retainSharedMicStream();
  try {
    const stream = await getSharedMicStream(constraints);
    return { stream, release: releaseSharedMicStream };
  } catch (error) {
    releaseSharedMicStream();
    throw error;
  }
};

export function usePitchDetection({
  noiseThreshold,
  selectedRangeFrequencies,
  getTargetFrequency,
  audioElementRef,
}: UsePitchDetectionParams) {
  const [voiceFrequency, setVoiceFrequency] = useState<number | null>(null);
  const [voiceDetected, setVoiceDetected] = useState(true);
  const [pitchOutOfRange, setPitchOutOfRange] = useState(false);
  const [pitchSamples, setPitchSamples] = useState<PitchSample[]>([]);
  const [targetHistory, setTargetHistory] = useState<(number | null)[]>([]);
  const [pitchStatus, setPitchStatus] = useState<PitchStatus>('idle');

  const noiseThresholdRef = useLatestRef(noiseThreshold);
  const targetFrequencyRef = useLatestRef<number | null>(null);
  const voiceFrequencyRef = useLatestRef<number | null>(null);
  const selectedRangeRef = useLatestRef(selectedRangeFrequencies);

  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserBufferRef = useRef<AnalyserBuffer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pitchDetectorRef = useRef<PitchDetector<Float32Array> | null>(null);
  const pitchRafRef = useRef<number | null>(null);
  const silenceAccumRef = useRef(0);
  const outOfRangeAccumRef = useRef(0);
  const lastSplLogRef = useRef(0);
  const lastPitchTimestampRef = useRef<number | null>(null);
  const micHandleRef = useRef<SharedMicHandle | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    targetFrequencyRef.current = getTargetFrequency();
  });

  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    []
  );

  const cleanup = useCallback(() => {
    if (pitchRafRef.current) {
      cancelAnimationFrame(pitchRafRef.current);
      pitchRafRef.current = null;
    }
    if (micHandleRef.current) {
      micHandleRef.current.release();
      micHandleRef.current = null;
    }
    micStreamRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    pitchDetectorRef.current = null;
    analyserRef.current = null;
    analyserBufferRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    const start = async () => {
      if (pitchStatus === 'starting' || pitchStatus === 'ready') {
        return;
      }
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return;
      }
      try {
        setPitchStatus('starting');
        if (!navigator.mediaDevices) {
          throw new Error('Media devices non disponibili');
        }
        const micHandle = await acquireSharedMicStream({
          audio: {
            /*       
            1. noiseSuppression
            What it does: Browser removes background noise before audio reaches you.
            Good for: Calls and simple voice.
            Bad for: Music, high-quality audio, ML (too aggressive).
            Why set to false: It can distort quiet voices.
            2. echoCancellation
            What it does: Removes echo by subtracting speaker output from mic input.
            Good for: Video calls, conferencing.
            Bad for: Music or precise audio work.
            Why set to false: It may remove real audio if it matches speaker frequencies.
            3. autoGainControl
            What it does: Adjusts mic volume automatically.
            Good for: Soft speakers who need louder input.
            Bad for: Audio processing, ML models (volume jumps).
            Why set to false: Keeps volume stable and predictable.
            */
            noiseSuppression: false,
            echoCancellation: false,
            autoGainControl: true,
          },
        });
        if (unmountedRef.current) {
          micHandle.release();
          return;
        }
        micHandleRef.current = micHandle;
        const stream = micHandle.stream;
        micStreamRef.current = stream;
        const win = window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        };
        const AudioCtx = win.AudioContext ?? win.webkitAudioContext;
        if (!AudioCtx) {
          throw new Error('AudioContext non supportato');
        }
        const audioContext = new AudioCtx();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 40;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
        analyserBufferRef.current = new Float32Array(analyser.fftSize);
        pitchDetectorRef.current = PitchDetector.forFloat32Array(
          analyser.fftSize
        );
        source.connect(highPass);
        highPass.connect(analyser);
        setPitchSamples([]);
        setTargetHistory([]);
        setVoiceFrequency(null);
        setVoiceDetected(true);
        silenceAccumRef.current = 0;
        setPitchOutOfRange(false);
        outOfRangeAccumRef.current = 0;
        lastPitchTimestampRef.current = null;
        setPitchStatus('ready');
      } catch (error) {
        console.error('Impossibile avviare la pitch detection', error);
        if (micHandleRef.current) {
          micHandleRef.current.release();
          micHandleRef.current = null;
        }
        micStreamRef.current = null;
        if (!unmountedRef.current) {
          setPitchStatus('error');
        }
      }
    };
    void start();
  }, [pitchStatus]);

  useEffect(
    () => () => {
      cleanup();
    },
    [cleanup]
  );

  const detectPitch = useCallback(() => {
    if (
      !analyserRef.current ||
      !pitchDetectorRef.current ||
      !analyserBufferRef.current ||
      !audioContextRef.current
    ) {
      return;
    }
    const now = performance.now();
    const lastTick = lastPitchTimestampRef.current ?? now;
    const deltaMs = now - lastTick;
    lastPitchTimestampRef.current = now;
    const buffer = analyserBufferRef.current as AnalyserBuffer;
    (analyserRef.current as AnalyserNode & {
      getFloatTimeDomainData: (data: Float32Array) => void;
    }).getFloatTimeDomainData(buffer);
    const [pitch, clarity] = pitchDetectorRef.current.findPitch(
      analyserBufferRef.current,
      audioContextRef.current.sampleRate
    );
    const voiceCandidate = pitch > 30 && pitch < 2000 ? pitch : null;
    let splDb = -Infinity;
    if (analyserBufferRef.current) {
      splDb = computeSplDb(analyserBufferRef.current);
      if (now - lastSplLogRef.current > 200) {
        lastSplLogRef.current = now;
      }
    }

    const belowNoiseFloor = isBelowNoiseFloor(
      splDb,
      noiseThresholdRef.current ?? 0
    );
    const hasSignal = !belowNoiseFloor;
    const voiceValue = hasSignal ? voiceCandidate : null;
    const audioEl = audioElementRef.current;
    const isAudioPlaying = Boolean(
      audioEl && !audioEl.paused && !audioEl.ended
    );
    const targetValue = isAudioPlaying
      ? targetFrequencyRef.current ?? null
      : null;

    if (hasSignal) {
      silenceAccumRef.current = 0;
      setVoiceDetected(true);
    } else {
      silenceAccumRef.current += deltaMs;
      if (silenceAccumRef.current >= 500 && voiceDetected) {
        setVoiceDetected(false);
      }
    }

    if (voiceValue !== null) {
      setVoiceFrequency(voiceValue);
      voiceFrequencyRef.current = voiceValue;
      const { min, max } = selectedRangeRef.current;
      const inRange = voiceValue >= min && voiceValue <= max;
      if (inRange) {
        outOfRangeAccumRef.current = 0;
        setPitchOutOfRange(false);
      } else {
        outOfRangeAccumRef.current += deltaMs;
        setPitchOutOfRange(outOfRangeAccumRef.current >= 500);
      }
    } else {
      setVoiceFrequency(null);
      voiceFrequencyRef.current = null;
      outOfRangeAccumRef.current = 0;
      setPitchOutOfRange(false);
    }

    if (isAudioPlaying) {
      setPitchSamples((prev) => {
        const next = [...prev, { pitch: voiceValue, clarity }];
        const limit = 150;
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
      setTargetHistory((prev) => {
        const next = [...prev, targetValue];
        const limit = 150;
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
    }
  }, [
    audioElementRef,
    noiseThresholdRef,
    selectedRangeRef,
    targetFrequencyRef,
    voiceDetected,
    voiceFrequencyRef,
  ]);

  useRafLoop(detectPitch, pitchStatus === 'ready');

  return {
    voiceFrequency,
    voiceDetected,
    pitchOutOfRange,
    pitchSamples,
    targetHistory,
    pitchStatus,
    targetFrequencyRef,
    voiceFrequencyRef,
  };
}
