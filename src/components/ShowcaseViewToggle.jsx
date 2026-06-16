/** Floating corner control — switch card (mobile) vs scroll tour (desktop). */
export default function ShowcaseViewToggle({ mode, onModeChange }) {
  return (
    <div className="showcase-view-toggle" role="group" aria-label="Showcase layout">
      <button
        type="button"
        className={mode === 'card' ? 'active' : ''}
        onClick={() => onModeChange('card')}
        aria-pressed={mode === 'card'}
      >
        Mobile
      </button>
      <button
        type="button"
        className={mode === 'scroll' ? 'active' : ''}
        onClick={() => onModeChange('scroll')}
        aria-pressed={mode === 'scroll'}
      >
        Desktop
      </button>
    </div>
  );
}
