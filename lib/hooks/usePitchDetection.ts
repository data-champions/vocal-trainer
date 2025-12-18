import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { PitchDetector } from 'pitchy';
import { computeSplDb, isBelowNoiseFloor } from '../pitch';
import type { PitchSample } from '../types';
import { useLatestRef, useRafLoop } from './common';
import {
  useNoiseProcessor,
  type DenoiserType,
} from './useNoiseProcessor';

type PitchStatus = 'idle' | 'starting' | 'ready' | 'error';
type AnalyserBuffer = Float32Array;

type UsePitchDetectionParams = {
  noiseThreshold: number;
  selectedRangeFrequencies: { min: number; max: number };
  getTargetFrequency: () => number | null;
  audioElementRef: MutableRefObject<HTMLAudioElement | null>;
  denoiserType: DenoiserType;
};

export function usePitchDetection({
  noiseThreshold,
  selectedRangeFrequencies,
  getTargetFrequency,
  audioElementRef,
  denoiserType,
}: UsePitchDetectionParams) {
  const [voiceFrequency, setVoiceFrequency] = useState<number | null>(null);
  const [voiceDetected, setVoiceDetected] = useState(true);
  const [pitchOutOfRange, setPitchOutOfRange] = useState(false);
  const [pitchSamples, setPitchSamples] = useState<PitchSample[]>([]);
  const [targetHistory, setTargetHistory] = useState<(number | null)[]>([]);
  const [pitchStatus, setPitchStatus] = useState<PitchStatus>('idle');
  const [audioContextState, setAudioContextState] = useState<AudioContext | null>(null);
  const [inputStream, setInputStream] = useState<MediaStream | null>(null);
  const [inputFilterNode, setInputFilterNode] = useState<BiquadFilterNode | null>(null);

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

  useEffect(() => {
    targetFrequencyRef.current = getTargetFrequency();
  });

  const {
    status: denoiserStatus,
    error: denoiserError,
    effectiveMode: activeDenoiser,
  } = useNoiseProcessor({
    audioContext: audioContextState,
    stream: inputStream,
    destination: inputFilterNode,
    mode: denoiserType,
  });

  const cleanup = useCallback(() => {
    if (pitchRafRef.current) {
      cancelAnimationFrame(pitchRafRef.current);
      pitchRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    pitchDetectorRef.current = null;
    analyserRef.current = null;
    analyserBufferRef.current = null;
    setAudioContextState(null);
    setInputStream(null);
    setInputFilterNode(null);
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
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: false,
          },
        });
        micStreamRef.current = stream;
        setInputStream(stream);
        const win = window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        };
        const AudioCtx = win.AudioContext ?? win.webkitAudioContext;
        if (!AudioCtx) {
          throw new Error('AudioContext non supportato');
        }
        const audioContext = new AudioCtx({ latencyHint: 'interactive' });
        audioContextRef.current = audioContext;
        const highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 40;
        setInputFilterNode(highPass);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
        highPass.connect(analyser);
        setAudioContextState(audioContext);
        analyserBufferRef.current = new Float32Array(analyser.fftSize);
        pitchDetectorRef.current = PitchDetector.forFloat32Array(
          analyser.fftSize
        );
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
        setPitchStatus('error');
      }
    };
    void start();
  }, [pitchStatus]);

  useEffect(() => {
    setPitchSamples([]);
    setTargetHistory([]);
    setVoiceFrequency(null);
    voiceFrequencyRef.current = null;
    setPitchOutOfRange(false);
    silenceAccumRef.current = 0;
    outOfRangeAccumRef.current = 0;
  }, [denoiserType]);

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

  useRafLoop(detectPitch, pitchStatus === 'ready' && denoiserStatus === 'ready');

  return {
    voiceFrequency,
    voiceDetected,
    pitchOutOfRange,
    pitchSamples,
    targetHistory,
    pitchStatus,
    denoiserStatus,
    denoiserError,
    activeDenoiser,
    targetFrequencyRef,
    voiceFrequencyRef,
  };
}
