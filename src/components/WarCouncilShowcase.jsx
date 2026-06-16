import { useEffect, useState } from 'react';
import { projectHref, siteUrls } from '../config/site.js';

const SCROLL_BREAKPOINT = 1024;

/** War Council scroll/card embed (screenshots from war-council Playwright suite). */
export default function WarCouncilShowcase() {
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
      mode === 'scroll'
        ? '/showcase/wc/war-council-scroll.js'
        : '/showcase/wc/war-council-card.js';
    const existing = document.querySelector(`script[data-wc-showcase="${mode}"]`);
    if (existing) {
      setScriptsReady(true);
      return;
    }
    document.querySelectorAll('script[data-wc-showcase]').forEach((s) => s.remove());
    const el = document.createElement('script');
    el.src = src;
    el.dataset.wcShowcase = mode;
    el.onload = () => setScriptsReady(true);
    el.onerror = () => setScriptsReady(false);
    document.head.appendChild(el);
    return () => {};
  }, [mode]);

  const screenshotBase = '/showcase/war-council-screenshots';
  const commandCenter = projectHref(siteUrls.warCouncil, siteUrls.warCouncilRepo);

  return (
    <div className="milkman-showcase-wrap war-council-showcase-wrap" data-mode={mode}>
      <p className="showcase-mode-label" aria-live="polite">
        {mode === 'scroll' ? (
          <>
            <strong>Desktop & tablet:</strong> scroll the War Council tour below (mandatory snap,
            centered slides). Narrower than {SCROLL_BREAKPOINT}px shows the compact card.
          </>
        ) : (
          <>
            <strong>Mobile:</strong> compact War Council card — tap to open the live demo or repo.
          </>
        )}
      </p>
      {!scriptsReady && <p className="showcase-loading">Loading showcase…</p>}
      {scriptsReady && mode === 'card' && (
        <war-council-showcase href={commandCenter} target="_blank" />
      )}
      {scriptsReady && mode === 'scroll' && (
        <war-council-showcase-scroll screenshots={screenshotBase} href={commandCenter} />
      )}
    </div>
  );
}
