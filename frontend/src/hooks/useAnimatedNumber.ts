import { useEffect, useRef, useState } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Eases a displayed number toward `target` on every animation frame, so values that arrive
 * once per poll glide instead of jumping. `wobble` adds a small live flutter (as a real
 * speedometer needle has) while a measurement is running.
 */
export function useAnimatedNumber(target: number, { tau = 320, wobble = 0 }: { tau?: number; wobble?: number } = {}): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const targetRef = useRef(target);
  const wobbleRef = useRef(wobble);
  targetRef.current = target;
  wobbleRef.current = wobble;

  useEffect(() => {
    if (prefersReducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const goal = targetRef.current;
      current.current += (goal - current.current) * (1 - Math.exp(-dt / tau));
      const settled = Math.abs(goal - current.current) < Math.max(0.005, Math.abs(goal) * 0.0005);
      if (settled) current.current = goal;
      const flutter = wobbleRef.current ? 1 + wobbleRef.current * (Math.sin(now / 90) * 0.6 + Math.sin(now / 37) * 0.4) : 1;
      setValue(current.current * flutter);
      if (!settled || wobbleRef.current) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, tau, wobble]);

  return value;
}
