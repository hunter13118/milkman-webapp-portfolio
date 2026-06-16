import { useEffect, useState } from 'react';
import { projectHref, siteUrls } from '../config/site.js';
import { useShowcaseMode } from '../hooks/useShowcaseMode.js';
import ShowcaseViewToggle from './ShowcaseViewToggle.jsx';

/**
 * MilkMan Audiobook Generator embed — scroll tour or preview card.
 */
export default function MilkmanShowcase() {
  const { mode, setManualMode } = useShowcaseMode();
  const [scriptsReady, setScriptsReady] = useState(false);

  useEffect(() => {
    const src =
      mode === 'scroll' ? '/showcase/wc/voxnovel-scroll.js' : '/showcase/wc/voxnovel-card.js';
    const existing = document.querySelector(`script[data-milkman-showcase="${mode}"]`);
    if (existing) {
      setScriptsReady(true);
      return;
    }
    setScriptsReady(false);
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
      <ShowcaseViewToggle mode={mode} onModeChange={setManualMode} />
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
