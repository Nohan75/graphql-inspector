/**
 * The panel as text: one line per line on screen, top to bottom.
 *
 * It reads the page the way a person does, not the way it is built: a line is
 * whatever sits on one row, whichever components drew it. A change of class
 * names or of structure leaves it readable. State that a screenshot would show
 * by a colour is spelled out:
 *
 *   [Label]            a button, with its tooltip when that says more
 *   [Label]*           a button that is on, or the tab that is open
 *   [x] [ ]            a checkbox
 *   [field: "text"]    a field and what it holds, or (its placeholder)
 *   > …                the line that is selected, or the current search match
 *   «text»             a search match
 *   text "tooltip"     an element that has a tooltip
 */
export function outline(root: Element): string {
  const lines: string[] = [];
  walk(root, lines);
  return lines.join('\n').replaceAll(KEPT_SPACE, ' ');
}

/** Stands for a space that means something, an indentation, until the line is put together */
const KEPT_SPACE = '\uE000';

/** Rows taller than this hold more than one line and are read part by part */
const MAX_LINE_HEIGHT = 48;
/** What an indented element is indented by, in the trees of the panel */
const INDENT_STEP = 16;

function walk(el: Element, lines: string[]) {
  if (!isShown(el)) return;
  if (isLine(el)) {
    const text = inline(el, new Set()).trim();
    if (text) lines.push((isCurrent(el) ? '> ' : '') + text);
    return;
  }
  for (const child of el.children) walk(child, lines);
}

function isShown(el: Element): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function isCurrent(el: Element): boolean {
  return el.getAttribute('aria-current') === 'true';
}

function isLine(el: Element): boolean {
  if (el.children.length === 0 || el.matches('button, input, select, textarea, pre')) return true;

  const style = getComputedStyle(el);
  const isRow = style.display.endsWith('flex') && style.flexDirection.startsWith('row');
  if (isRow && el.getBoundingClientRect().height <= MAX_LINE_HEIGHT) return true;

  // Text with inline elements in it, such as a sentence with a word in bold
  return [...el.children].every((child) => getComputedStyle(child).display.startsWith('inline'));
}

const squash = (text: string) => text.replace(/\s+/g, ' ');
const quoted = (text: string) => `"${squash(text.replace(/\n+/g, ' / ')).trim()}"`;

/**
 * An element and what it holds, on one line. `said` holds the tooltips the
 * line has already given: two elements that share one, a badge and the value
 * next to it, say it once.
 */
function inline(node: Node, said: Set<string>): string {
  if (node.nodeType === Node.TEXT_NODE) return squash(node.textContent ?? '');
  if (!(node instanceof Element) || !isShown(node)) return '';

  if (node instanceof HTMLInputElement) {
    if (node.type === 'checkbox') return node.checked ? '[x]' : '[ ]';
    return node.value ? `[field: "${node.value}"]` : `[field: (${node.placeholder})]`;
  }
  if (node instanceof HTMLSelectElement) {
    return `[select: ${node.selectedOptions[0]?.textContent ?? ''}]`;
  }
  if (node instanceof HTMLPreElement) return (node.textContent ?? '').trim();

  const style = getComputedStyle(node);
  // Text laid out by its own spaces, as code is, keeps them
  const keepsSpaces = style.whiteSpace.startsWith('pre');
  let text = [...node.childNodes]
    .map((child) =>
      child.nodeType === Node.TEXT_NODE && keepsSpaces
        ? (child.textContent ?? '').replaceAll(' ', KEPT_SPACE)
        : inline(child, said)
    )
    .filter((part) => part !== '')
    .join(keepsSpaces ? '' : ' ');
  if (!keepsSpaces) text = squash(text).trim();

  const title = node.getAttribute('title') ?? '';
  const label = node.getAttribute('aria-label') ?? '';

  if (node instanceof HTMLButtonElement) {
    const name = text || label || title;
    const isOn = node.getAttribute('aria-pressed') === 'true' || node.getAttribute('aria-selected') === 'true';
    return `[${name}${tooltip(title, name, said)}]${isOn ? '*' : ''}${node.disabled ? ' (disabled)' : ''}`;
  }

  if (node.tagName === 'MARK') return `«${text}»`;

  const indent = KEPT_SPACE.repeat(2 * Math.floor(parseFloat(style.paddingLeft) / INDENT_STEP));
  // A one-word tooltip on a mark, such as "Collapse" on an arrow, says what
  // the mark already shows: only the ones that say more are given
  return `${indent}${text}${title.includes(' ') ? tooltip(title, text, said) : ''}`;
}

/** The tooltip of an element, when it adds to its text and the line has not given it yet */
function tooltip(title: string, text: string, said: Set<string>): string {
  if (!title || title === text || said.has(title)) return '';
  said.add(title);
  return ` ${quoted(title)}`;
}
