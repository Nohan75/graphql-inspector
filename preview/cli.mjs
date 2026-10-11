// The panel preview from the command line: replay steps, then read the panel
// as text or take a picture of it.
//
//   npm run panel:dump -- click=Response "click=Collapse all"
//   npm run panel:shot -- shot.png click=Response --size=1100x640
//
// A step is `click=<label>` or `type=<text>`, as preview/main.tsx replays
// them; it is encoded here, so it is written as it reads. The preview server
// is started for the run when it is not already up, and stopped afterwards.
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const PREVIEW = 'http://localhost:5183/';
const run = promisify(execFile);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
if (command !== 'dump' && command !== 'shot') {
  fail('usage: cli.mjs dump [step…]  |  cli.mjs shot <file.png> [step…] [--size=<width>x<height>]');
}

const size = rest.find((arg) => arg.startsWith('--size='))?.slice('--size='.length) ?? '1100x640';
const plain = rest.filter((arg) => !arg.startsWith('--'));
const file = command === 'shot' ? plain.shift() : undefined;
if (command === 'shot' && !file?.endsWith('.png')) fail('shot: the first argument is the .png file to write');

const steps = plain.map((step) => {
  const [, action, value] = step.match(/^(click|type)=([\s\S]*)$/) ?? [];
  if (!action) fail(`not a step: "${step}". A step is click=<label> or type=<text>`);
  return `${action}=${encodeURIComponent(value)}`;
});
const url = `${PREVIEW}?${steps.join('&')}`;

function findChrome() {
  const { PROGRAMFILES, LOCALAPPDATA } = process.env;
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    PROGRAMFILES && `${PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    LOCALAPPDATA && `${LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) fail('Chrome was not found. Set CHROME_PATH to its executable.');
  return found;
}

const isUp = () =>
  fetch(PREVIEW).then(
    (response) => response.ok,
    () => false
  );

/** Starts the preview when nothing answers on its port. Returns how to stop what it started. */
async function preview() {
  if (await isUp()) return () => {};

  // Vite itself, not `npm run panel`: stopping npm would leave Vite on the port
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'preview/vite.config.mts'], {
    stdio: 'ignore',
  });
  const stop = () => server.kill();
  for (let waited = 0; waited < 30_000; waited += 200) {
    if (await isUp()) return stop;
    await new Promise((done) => setTimeout(done, 200));
  }
  stop();
  fail(`the preview did not start on ${PREVIEW}`);
}

const unescape = (html) =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** What the page wrote in one of its hidden <pre>, or undefined when it is not there */
const written = (html, id) => {
  const [, text] = html.match(new RegExp(`<pre id="${id}"[^>]*>([\\s\\S]*?)</pre>`)) ?? [];
  return text === undefined ? undefined : unescape(text);
};

const chrome = findChrome();
const stop = await preview();
let failed = false;
try {
  const flags = ['--headless=new', '--virtual-time-budget=8000'];
  if (command === 'shot') {
    await run(chrome, [...flags, `--window-size=${size.replace('x', ',')}`, `--screenshot=${resolve(file)}`, url]);
    console.log(`wrote ${file}`);
  }

  // Read in both cases: a picture of a step that matched nothing shows the wrong state
  const { stdout } = await run(chrome, [...flags, '--dump-dom', url], { maxBuffer: 64 * 1024 * 1024 });
  const text = written(stdout, 'preview-outline');
  const problems = written(stdout, 'preview-problems')?.trim();
  if (!stdout.includes('data-preview-ready="true"') || text === undefined) {
    console.error('the preview did not finish replaying the steps');
    failed = true;
  } else {
    if (command === 'dump') console.log(text);
    if (problems) {
      console.error(problems.replace(/^/gm, 'step not replayed: '));
      failed = true;
    }
  }
} finally {
  stop();
}
if (failed) process.exit(1);
