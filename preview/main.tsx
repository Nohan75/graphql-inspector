import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/components/App';
import { installFakeChrome, TAB_OPENED } from './fakeChrome';
import './preview.css';

// Before the panel renders: its hooks read `chrome` as soon as they mount
installFakeChrome();

/** Shows the last URL the panel asked to open, in place of the new tab */
function OpenedTab() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => setUrl((event as CustomEvent<string>).detail);
    window.addEventListener(TAB_OPENED, onOpen);
    return () => window.removeEventListener(TAB_OPENED, onOpen);
  }, []);

  if (!url) return null;
  return (
    <pre
      id="opened-tab"
      className="shrink-0 m-0 px-2 py-1 border-t border-border bg-toolbar text-[11px] text-text-muted whitespace-pre-wrap break-all max-h-40 overflow-y-auto"
    >
      {`Would open: ${decodeURIComponent(url)}`}
    </pre>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <React.StrictMode>
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <App />
      </div>
      <OpenedTab />
    </div>
  </React.StrictMode>
);

/**
 * Drives the panel from the address bar, so that a state reached by clicking
 * can be captured in one screenshot:
 *
 *   ?click=Response            clicks the element whose text is "Response"
 *   ?click=Add to compare      matches `title` and `aria-label` too
 *   ?click=Character#2         the second match, counting from 1
 *
 * Clicks run in the order given, one after the other.
 */
async function replayClicks() {
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await settle(300); // let the fixtures arrive and render

  for (const step of new URLSearchParams(location.search).getAll('click')) {
    const [label, nth = '1'] = step.split('#');
    // An element's own text, without its children's: a tab that carries a
    // count badge still matches on its label.
    const ownText = (el: HTMLElement) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('')
        .trim();
    const matches = [...document.querySelectorAll<HTMLElement>('button, [title], [aria-label], div, span')].filter(
      (el) => el.title === label || el.getAttribute('aria-label') === label || ownText(el) === label
    );
    const target = matches[Number(nth) - 1];
    if (!target) {
      console.error(`preview: no element matches "${step}"`);
      continue;
    }
    target.click();
    await settle(100);
  }
  document.documentElement.dataset.previewReady = 'true';
}

void replayClicks();
