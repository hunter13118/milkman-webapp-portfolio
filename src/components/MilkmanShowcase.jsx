import { useEffect, useState } from 'react';
import { projectHref, siteUrls } from '../config/site.js';

const SCROLL_BREAKPOINT = 1024;

/**
 * MilkMan Audiobook Generator embed — scroll tour (desktop/tablet) or card (mobile).
 * Web component scripts live in the sibling showcase repo (legacy filenames).
 */
export default function MilkmanShowcase() {
  const [mode, setMode] = useState('card');
  const [scriptsReady, setScriptsReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SCROLL_BREAKPOINT}px)`);
    const pick = () => setMode(mq.matches ? 'scroll' : 'card');
    pick();
    mq.addEventListener('change', pick);
    return () => mq.removeEventListener('change', pick);
  }, []);

  useEffect(() => {
    const src =
      mode === 'scroll' ? '/showcase/wc/voxnovel-scroll.js' : '/showcase/wc/voxnovel-card.js';
    const existing = document.querySelector(`script[data-milkman-showcase="${mode}"]`);
    if (existing) {
      setScriptsReady(true);
      return;
    }
    document.querySelectorAll('script[data-milkman-showcase]').forEach((s) => s.remove());
    const el = document.createElement('script');
    el.src = src;
    el.dataset.milkmanShowcase = mode;
    el.onload = () => setScriptsReady(true);
    el.onerror = () => setScriptsReady(false);
    document.head.appendChild(el);
    return () => {};
  }, [mode]);

  const screenshotBase = '/showcase/screenshots';
  const appHref = projectHref(siteUrls.milkmanApp, siteUrls.milkmanRepo);
  const apiBase = siteUrls.milkmanApp || '';

  return (
    <div className="milkman-showcase-wrap" data-mode={mode}>
      <p className="showcase-mode-label" aria-live="polite">
        {mode === 'scroll' ? (
          <>
            <strong>Desktop & tablet:</strong> scroll the panel below for a full feature tour (snap
            sections, not the whole page). Resize narrower than {SCROLL_BREAKPOINT}px to see the
            mobile card instead.
          </>
        ) : (
          <>
            <strong>Mobile:</strong> compact preview card — no scroll-snap tour. Widen past{' '}
            {SCROLL_BREAKPOINT}px for the in-panel scroll showcase.
          </>
        )}
      </p>
      {!scriptsReady && <p className="showcase-loading">Loading showcase…</p>}
      {scriptsReady && mode === 'card' && (
        <voxnovel-showcase href={appHref} api={apiBase} target="_blank" rel="noreferrer" />
      )}
      {scriptsReady && mode === 'scroll' && (
        <voxnovel-showcase-scroll screenshots={screenshotBase} href={appHref} />
      )}
    </div>
  );
}
