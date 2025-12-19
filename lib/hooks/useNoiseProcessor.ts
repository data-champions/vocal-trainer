import { useEffect, useState } from 'react';
import { useLatestRef } from './common';

export type DenoiserType = 'none' | 'dsp' | 'ml';
export type NoiseProcessorStatus = 'idle' | 'loading' | 'ready' | 'error';

type UseNoiseProcessorParams = {
  audioContext: AudioContext | null;
  stream: MediaStream | null;
  destination?: AudioNode | null;
  mode: DenoiserType;
};

type NoiseNodeResult = {
  node: AudioNode;
  disconnect: () => void;
};

const rnnoiseModuleCache = new WeakMap<AudioContext, Promise<void>>();

class NoiseProcessor {
  static createPassthrough(
    audioContext: AudioContext,
    stream: MediaStream
  ): NoiseNodeResult {
    const source = audioContext.createMediaStreamSource(stream);
    return {
      node: source,
      disconnect: () => {
        try {
          source.disconnect();
        } catch {
          // noop
        }
      },
    };
  }

  static createDSPCleaner(
    audioContext: AudioContext,
    stream: MediaStream
  ): NoiseNodeResult {
    const source = audioContext.createMediaStreamSource(stream);

    const highPass = audioContext.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 100;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    source.connect(highPass);
    highPass.connect(compressor);

    return {
      node: compressor,
      disconnect: () => {
        try {
          source.disconnect();
          highPass.disconnect();
          compressor.disconnect();
        } catch {
          // noop
        }
      },
    };
  }

  static async createRNNoiseCleaner(
    audioContext: AudioContext,
    stream: MediaStream
  ): Promise<NoiseNodeResult> {
    await NoiseProcessor.loadRNNoiseWorklet(audioContext);

    const source = audioContext.createMediaStreamSource(stream);
    const rnnoiseNode = new AudioWorkletNode(audioContext, 'rnnoise-processor');
    source.connect(rnnoiseNode);

    return {
      node: rnnoiseNode,
      disconnect: () => {
        try {
          source.disconnect();
          rnnoiseNode.disconnect();
        } catch {
          // noop
        }
      },
    };
  }

  private static loadRNNoiseWorklet(audioContext: AudioContext): Promise<void> {
    const cached = rnnoiseModuleCache.get(audioContext);
    if (cached) {
      return cached;
    }
    const loadPromise = audioContext.audioWorklet.addModule('/rnnoise-processor.js');
    rnnoiseModuleCache.set(audioContext, loadPromise);
    return loadPromise;
  }
}

export function useNoiseProcessor({
  audioContext,
  stream,
  destination,
  mode,
}: UseNoiseProcessorParams) {
  const destinationRef = useLatestRef(destination ?? null);
  const [node, setNode] = useState<AudioNode | null>(null);
  const [status, setStatus] = useState<NoiseProcessorStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [effectiveMode, setEffectiveMode] = useState<DenoiserType>('none');

  useEffect(() => {
    if (!audioContext || !stream) {
      setNode(null);
      setStatus('idle');
      setError(null);
      setEffectiveMode('none');
      return;
    }

    let cancelled = false;
    let disconnectChain: (() => void) | undefined;

    const setup = async () => {
      setStatus(mode === 'ml' ? 'loading' : 'ready');
      setError(null);
      try {
        let result: NoiseNodeResult;
        if (mode === 'dsp') {
          result = NoiseProcessor.createDSPCleaner(audioContext, stream);
          setEffectiveMode('dsp');
        } else if (mode === 'ml') {
          try {
            result = await NoiseProcessor.createRNNoiseCleaner(
              audioContext,
              stream
            );
            setEffectiveMode('ml');
          } catch (rnnoiseError) {
            console.warn(
              'RNNoise worklet unavailable, falling back to raw mic input',
              rnnoiseError
            );
            result = NoiseProcessor.createPassthrough(audioContext, stream);
            setEffectiveMode('none');
            setError(
              rnnoiseError instanceof Error
                ? rnnoiseError.message
                : String(rnnoiseError)
            );
          }
        } else {
          result = NoiseProcessor.createPassthrough(audioContext, stream);
          setEffectiveMode('none');
        }

        const outputNode = result.node;
        disconnectChain = result.disconnect;

        const destinationNode = destinationRef.current;
        if (destinationNode) {
          outputNode.connect(destinationNode);
          const prevDisconnect = disconnectChain;
          disconnectChain = () => {
            try {
              outputNode.disconnect();
            } catch (disconnectError) {
              console.warn(
                'Unable to disconnect noise processor output',
                disconnectError
              );
            }
            prevDisconnect?.();
          };
        }

        if (cancelled) {
          disconnectChain?.();
          return;
        }

        setNode(outputNode);
        setStatus('ready');
      } catch (setupError) {
        if (cancelled) {
          return;
        }
        setNode(null);
        setStatus('error');
        setError(
          setupError instanceof Error ? setupError.message : String(setupError)
        );
      }
    };

    void setup();

    return () => {
      cancelled = true;
      disconnectChain?.();
      setNode(null);
    };
  }, [audioContext, stream, mode, destination, destinationRef]);

  return { node, status, error, effectiveMode };
}
