import { useEffect, useState } from 'react';

const SCROLL_BREAKPOINT = 1024;

/** Auto card vs scroll from viewport; optional manual override via toggle. */
export function useShowcaseMode() {
  const [viewportMode, setViewportMode] = useState('card');
  const [manualMode, setManualMode] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SCROLL_BREAKPOINT}px)`);
    const pick = () => setViewportMode(mq.matches ? 'scroll' : 'card');
    pick();
    mq.addEventListener('change', pick);
    return () => mq.removeEventListener('change', pick);
  }, []);

  const mode = manualMode ?? viewportMode;

  return {
    mode,
    setManualMode,
    isAuto: manualMode === null,
  };
}
