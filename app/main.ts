"use client";

import React, { useEffect, useRef, useState } from "react";
import { getPitch } from "pitchy";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement
} from "chart.js";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

export default function PitchPlot() {
  const [pitchHistory, setPitchHistory] = useState<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const buffer = useRef<Float32Array | null>(null);

  useEffect(() => {
    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      buffer.current = new Float32Array(analyser.fftSize);
      source.connect(analyser);

      loop();
    }

    start();

    function loop() {
      requestAnimationFrame(loop);

      const analyser = analyserRef.current;
      if (!analyser || !buffer.current) return;

      analyser.getFloatTimeDomainData(buffer.current);
      const [pitch, clarity] = getPitch(buffer.current, audioCtxRef.current!.sampleRate);

      if (clarity > 0.8 && pitch < 1500) {
        // Only add valid pitches
        setPitchHistory(prev => [...prev.slice(-100), pitch]);
      }
    }
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Real-time Voice Pitch</h1>
      <Line
        data={{
          labels: pitchHistory.map((_, i) => i),
          datasets: [
            {
              label: "Pitch (Hz)",
              data: pitchHistory,
              borderColor: "rgb(75, 192, 192)",
              fill: false,
            },
          ],
        }}
        options={{
          animation: false,
          scales: {
            y: {
              min: 50,
              max: 1000,
            },
          },
        }}
      />
    </div>
  );
}
