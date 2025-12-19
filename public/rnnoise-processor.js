/**
 * RNNoise AudioWorklet wrapper.
 * The processor falls back to a pass-through pipeline when RNNoise cannot load,
 * so ensure you serve a compatible rnnoise-wasm bundle at /rnnoise-wasm.js to
 * enable real ML denoising.
 */

let rnnoiseFactoryPromise = null;

function loadRnnoiseFactory() {
  if (rnnoiseFactoryPromise) {
    return rnnoiseFactoryPromise;
  }

  rnnoiseFactoryPromise = new Promise((resolve, reject) => {
    try {
      if (typeof RNNoise !== 'undefined') {
        resolve(RNNoise);
        return;
      }

      if (typeof importScripts === 'function') {
        try {
          importScripts('/rnnoise-wasm.js');
        } catch (scriptError) {
          // Ignore and let the check below handle missing assets.
          console.warn('Unable to import rnnoise-wasm.js inside worklet', scriptError);
        }
      }

      if (typeof RNNoise !== 'undefined') {
        resolve(RNNoise);
        return;
      }

      reject(
        new Error(
          'RNNoise module not found. Provide rnnoise-wasm.js in /public to enable ML denoising.'
        )
      );
    } catch (error) {
      reject(error);
    }
  });

  return rnnoiseFactoryPromise;
}

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.rnnoise = null;
    this.init();
  }

  async init() {
    try {
      const factory = await loadRnnoiseFactory();
      this.rnnoise = new factory.RNNoise();
      this.ready = true;
    } catch (error) {
      this.ready = false;
      try {
        this.port.postMessage({
          type: 'rnnoise-error',
          message:
            error && typeof error.message === 'string'
              ? error.message
              : 'RNNoise unavailable; using dry mic signal.',
        });
      } catch (postError) {
        // Worklet ports may not be connected yet; ignore.
        console.warn('Unable to notify RNNoise failure', postError);
      }
    }
  }

  process(inputs, outputs) {
    const input = inputs?.[0]?.[0];
    const output = outputs?.[0]?.[0];

    if (!input || !output) {
      return true;
    }

    if (this.ready && this.rnnoise && typeof this.rnnoise.processFrame === 'function') {
      const denoised = this.rnnoise.processFrame(input);
      output.set(denoised);
    } else {
      output.set(input);
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
