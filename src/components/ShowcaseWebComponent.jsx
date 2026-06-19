import { useEffect, useRef } from 'react';

/**
 * Mount vanilla custom elements via DOM APIs only.
 * React 19 assigns JSX props as element properties; iOS Safari throws
 * "attempted to assign to read only property" on custom element tags.
 */
export default function ShowcaseWebComponent({ tag, attributes = {}, fill = false }) {
  const hostRef = useRef(null);
  const attrKey = JSON.stringify(attributes);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value != null && value !== '') el.setAttribute(key, String(value));
    }
    host.replaceChildren(el);

    return () => {
      host.replaceChildren();
    };
  }, [tag, attrKey]);

  return (
    <div
      ref={hostRef}
      className={`showcase-wc-host${fill ? ' showcase-wc-host--fill' : ''}`}
    />
  );
}
