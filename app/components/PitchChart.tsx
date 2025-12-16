'use client';

import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

type PitchChartProps = {
  voicePitchHistory: Array<number | null>;
  targetHistory: Array<number | null>;
  chartFrequencyBounds: { min: number; max: number };
  showPlot: boolean;
  height: number;
};

export function PitchChart({
  voicePitchHistory,
  targetHistory,
  chartFrequencyBounds,
  showPlot,
  height,
}: PitchChartProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);

  const chartData = useMemo<uPlot.AlignedData>(() => {
    const maxLength = Math.max(
      voicePitchHistory.length,
      targetHistory.length,
      1
    );
    const labels = Array.from({ length: maxLength }, (_, index) => index);
    const voicedData = labels.map((_, idx) => {
      const value = voicePitchHistory[idx] ?? null;
      if (value === null) {
        return null;
      }
      if (value < chartFrequencyBounds.min || value > chartFrequencyBounds.max) {
        return null;
      }
      return value;
    });
    const targetData = labels.map((_, idx) => targetHistory[idx] ?? null);
    return [labels, targetData, voicedData];
  }, [voicePitchHistory, targetHistory, chartFrequencyBounds.min, chartFrequencyBounds.max]);

  useEffect(() => {
    if (!showPlot && chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
  }, [showPlot]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !showPlot) {
      return;
    }
    const width = container.clientWidth || 320;
    if (!chartRef.current) {
      chartRef.current = new uPlot(
        {
          width,
          height,
          scales: {
            x: { time: false },
            y: {
              min: chartFrequencyBounds.min,
              max: chartFrequencyBounds.max,
            },
          },
          axes: [
            { show: false },
            {
              label: 'Frequenza (Hz)',
              stroke: '#cbd5f5',
              grid: { stroke: 'rgba(255,255,255,0.1)' },
            },
          ],
          legend: { show: false },
          series: [
            {},
            {
              label: 'Nota bersaglio (Hz)',
              stroke: 'rgba(80, 220, 120, 1)',
              width: 2,
              spanGaps: true,
              points: { show: false },
            },
            {
              label: 'Voce (Hz)',
              stroke: 'rgba(255, 214, 102, 1)',
              width: 2,
              spanGaps: true,
              points: { show: false },
            },
          ],
        },
        chartData,
        container
      );
      return;
    }
    chartRef.current.setScale('y', {
      min: chartFrequencyBounds.min,
      max: chartFrequencyBounds.max,
    });
    chartRef.current.setData(chartData);
  }, [chartData, chartFrequencyBounds.max, chartFrequencyBounds.min, height, showPlot]);

  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const chart = chartRef.current;
      if (!container || !chart || !showPlot) {
        return;
      }
      const width = container.clientWidth || 320;
      chart.setSize({ width, height });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height, showPlot]);

  useEffect(
    () => () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    },
    []
  );

  if (!showPlot) {
    return null;
  }

  return (
    <div style={{ height: `${height}px` }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
