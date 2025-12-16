import { useEffect, useRef } from 'react';

export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  target: Window | Document | HTMLElement | null = typeof window !== 'undefined'
    ? window
    : null
) {
  const handlerRef = useLatestRef(handler);

  useEffect(() => {
    if (!target?.addEventListener) {
      return;
    }
    const listener = (event: Event) => {
      handlerRef.current(event as WindowEventMap[K]);
    };
    target.addEventListener(eventName, listener as EventListener);
    return () => {
      target.removeEventListener(eventName, listener as EventListener);
    };
  }, [eventName, target, handlerRef]);
}

export function useRafLoop(callback: () => void, enabled: boolean = true) {
  const cbRef = useLatestRef(callback);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let rafId: number;
    const tick = () => {
      cbRef.current();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, cbRef]);
}
