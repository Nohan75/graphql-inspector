import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/components/App';
import { installFakeChrome, TAB_OPENED } from './fakeChrome';
import { outline } from './outline';
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
 * and typing can be captured in one screenshot:
 *
 *   ?click=Response            clicks the element whose text is "Response"
 *   ?click=Add to compare      matches `title` and `aria-label` too
 *   ?click=Character#2         the second match, counting from 1
 *   ?click=Filter requests…    a field is matched by its placeholder, and takes the focus
 *   ?type=https://example.test replaces the text of the field that has the focus
 *
 * Steps run in the order given, one after the other.
 */
/** A step that could not be replayed: said in the console and kept for the command line */
function problem(message: string) {
  console.error(`preview: ${message}`);
  const problems = document.getElementById('preview-problems');
  if (problems) problems.textContent += `${message}\n`;
}

async function replaySteps() {
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await settle(300); // let the fixtures arrive and render

  for (const [action, value] of new URLSearchParams(location.search)) {
    if (action === 'click') click(value);
    else if (action === 'type') type(value);
    else continue;
    await settle(100);
  }

  const text = document.getElementById('preview-outline');
  if (text && container) text.textContent = outline(container);
  document.documentElement.dataset.previewReady = 'true';
}

function click(step: string) {
  const [label, nth = '1'] = step.split('#');
  // An element's own text, without its children's: a tab that carries a
  // count badge still matches on its label.
  const ownText = (el: HTMLElement) =>
    [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim();
  const matches = [...document.querySelectorAll<HTMLElement>('button, input, [title], [aria-label], div, span')].filter(
    (el) =>
      el.title === label ||
      el.getAttribute('aria-label') === label ||
      el.getAttribute('placeholder') === label ||
      ownText(el) === label
  );
  const target = matches[Number(nth) - 1];
  if (!target) {
    problem(`no element matches "${step}"`);
    return;
  }
  target.click();
  // A real click also gives a field the focus, which typing then needs
  if (target instanceof HTMLInputElement) target.focus();
}

function type(text: string) {
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement)) {
    problem(`no field has the focus to type "${text}" into`);
    return;
  }
  // Through the element's own setter, then an input event: React ignores a
  // value that was only assigned.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

void replaySteps();
