import { useEffect, useState } from 'react';
import { projectHref, siteUrls } from '../config/site.js';
import { useShowcaseMode } from '../hooks/useShowcaseMode.js';
import ShowcaseViewToggle from './ShowcaseViewToggle.jsx';

/** War Council scroll/card embed. */
export default function WarCouncilShowcase() {
  const { mode, setManualMode } = useShowcaseMode();
  const [scriptsReady, setScriptsReady] = useState(false);

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
    setScriptsReady(false);
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
      <ShowcaseViewToggle mode={mode} onModeChange={setManualMode} />
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
