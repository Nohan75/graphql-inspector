/* =============================================================
   GraphQL Inspector – panel.js
   Complete DevTools panel logic
   ============================================================= */

// ── State ──────────────────────────────────────────────────────
let requests       = [];
let selectedId     = null;
let filterText     = '';
let preserveLog    = false;
let activeTab      = 'request';
let requestCounter = 0;

// ── DOM refs ───────────────────────────────────────────────────
const requestList          = document.getElementById('request-list');
const filterInput          = document.getElementById('filter-input');
const preserveLogCheckbox  = document.getElementById('preserve-log');
const clearBtn             = document.getElementById('clear-btn');
const requestCount         = document.getElementById('request-count');
const emptyState           = document.getElementById('empty-state');
const noSelection          = document.getElementById('no-selection');
const requestDetail        = document.getElementById('request-detail');
const tabButtons           = document.querySelectorAll('.tab-btn');
const tabContents          = document.querySelectorAll('.tab-content');

// Request tab
const queryDisplay         = document.getElementById('query-display');
const variablesSection     = document.getElementById('variables-section');
const variablesDisplay     = document.getElementById('variables-display');
const copyQueryBtn         = document.getElementById('copy-query');
const copyVariablesBtn     = document.getElementById('copy-variables');

// Response tab
const responseDisplay      = document.getElementById('response-display');
const responseErrorNotice  = document.getElementById('response-error-notice');
const copyResponseBtn      = document.getElementById('copy-response');

// Raw tab
const rawDisplay           = document.getElementById('raw-display');
const copyRawBtn           = document.getElementById('copy-raw');

// Headers tab
const requestHeadersTable  = document.getElementById('request-headers-table');
const responseHeadersTable = document.getElementById('response-headers-table');

// ── Utility helpers ────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  });
}

// ── GraphQL detection & parsing ────────────────────────────────

function isGraphQLRequest(request) {
  if (request.request.method !== 'POST') return false;
  const postData = request.request.postData;
  if (!postData || !postData.text) return false;
  try {
    const body = JSON.parse(postData.text);
    // Support both single and batched requests
    if (Array.isArray(body)) {
      return body.length > 0 && (body[0].query !== undefined || body[0].operationName !== undefined);
    }
    return body.query !== undefined || body.operationName !== undefined;
  } catch (e) {
    // Check for multipart/form-data with query field (rare)
    return postData.text.includes('"query"') && postData.text.includes('{');
  }
}

/**
 * Extract operation type from query string.
 * Returns 'query' | 'mutation' | 'subscription'
 */
function extractOperationType(queryStr) {
  if (!queryStr) return 'query';
  const trimmed = queryStr.trim();
  // Match leading keyword
  const match = trimmed.match(/^\s*(query|mutation|subscription)\b/i);
  if (match) return match[1].toLowerCase();
  // If starts with { it's a shorthand query
  if (trimmed.startsWith('{')) return 'query';
  return 'query';
}

/**
 * Extract operation name from query string if not already in body.
 * e.g. "query GetUser { … }" → "GetUser"
 */
function extractOperationName(queryStr) {
  if (!queryStr) return null;
  const match = queryStr.match(/^\s*(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  return match ? match[1] : null;
}

/**
 * Parse a single GQL operation body object.
 */
function parseGQLBody(body) {
  const query         = body.query         || '';
  const variables     = body.variables     || null;
  const operationType = extractOperationType(query);
  const operationName = body.operationName
    || extractOperationName(query)
    || '(anonymous)';
  return { query, variables, operationType, operationName };
}

// ── Network listener ───────────────────────────────────────────

chrome.devtools.network.onRequestFinished.addListener(function(request) {
  if (!isGraphQLRequest(request)) return;

  const postData  = request.request.postData;
  let   bodyParsed;
  try {
    bodyParsed = JSON.parse(postData.text);
  } catch (e) {
    return; // skip unparseable
  }

  // Handle batched requests – create one entry per operation
  const operations = Array.isArray(bodyParsed) ? bodyParsed : [bodyParsed];

  request.getContent(function(content) {
    let responseParsed = null;
    let responseRaw    = content || '';

    try {
      responseParsed = JSON.parse(content);
    } catch (e) {
      // keep raw
    }

    // If batched, responseParsed may also be an array
    const responseArray = Array.isArray(responseParsed) ? responseParsed : null;

    operations.forEach(function(op, idx) {
      const { query, variables, operationType, operationName } = parseGQLBody(op);

      const entry = {
        id:              ++requestCounter,
        operationName:   operationName,
        operationType:   operationType,
        query:           query,
        variables:       variables,
        headers:         request.request.headers  || [],
        responseHeaders: request.response.headers || [],
        response:        responseArray ? responseArray[idx] : responseParsed,
        responseRaw:     responseArray
                           ? JSON.stringify(responseArray[idx], null, 2)
                           : responseRaw,
        status:          request.response.status,
        url:             request.request.url,
        timestamp:       Date.now(),
      };

      requests.push(entry);
    });

    renderRequestList();
  });
});

// Clear on navigation unless preserve log is on
chrome.devtools.network.onNavigated.addListener(function() {
  if (!preserveLog) {
    clearAll();
  }
});

// ── Rendering: request list ────────────────────────────────────

function renderRequestList() {
  // Remove old request items (keep empty-state node)
  const items = requestList.querySelectorAll('.request-item');
  items.forEach(el => el.remove());

  const filtered = requests.filter(r => {
    if (!filterText) return true;
    return r.operationName.toLowerCase().includes(filterText.toLowerCase());
  });

  // Show/hide empty state
  emptyState.style.display = filtered.length === 0 && requests.length === 0
    ? 'flex'
    : 'none';

  // Update count
  requestCount.textContent = requests.length > 0
    ? `${filtered.length}${filtered.length !== requests.length ? '/' + requests.length : ''} requests`
    : '';

  filtered.forEach(function(req) {
    const item = document.createElement('div');
    item.className = 'request-item' + (req.id === selectedId ? ' selected' : '');
    item.dataset.id = req.id;

    const badgeLetter = req.operationType === 'mutation'
      ? 'M'
      : req.operationType === 'subscription'
        ? 'S'
        : 'Q';

    const isError   = req.status >= 400 || hasGraphQLErrors(req.response);
    const statusCls = isError ? 'err' : 'ok';
    const statusTxt = req.status || '–';

    const shortUrl = shortenUrl(req.url);

    item.innerHTML =
      '<div class="type-badge ' + req.operationType + '">' + badgeLetter + '</div>' +
      '<div class="request-info">' +
        '<div class="request-name">' + escapeHtml(req.operationName) + '</div>' +
        '<div class="request-meta">' +
          '<span class="request-url">' + escapeHtml(shortUrl) + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="status-badge ' + statusCls + '">' + statusTxt + '</span>';

    item.addEventListener('click', function() {
      selectRequest(req.id);
    });

    requestList.appendChild(item);
  });
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch (e) {
    return url;
  }
}

function hasGraphQLErrors(response) {
  if (!response) return false;
  if (Array.isArray(response)) {
    return response.some(r => r && Array.isArray(r.errors) && r.errors.length > 0);
  }
  return Array.isArray(response.errors) && response.errors.length > 0;
}

// ── Request selection ──────────────────────────────────────────

function selectRequest(id) {
  selectedId = id;

  // Highlight in list
  requestList.querySelectorAll('.request-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.id) === id);
  });

  const req = requests.find(r => r.id === id);
  if (!req) return;

  noSelection.classList.add('hidden');
  requestDetail.classList.remove('hidden');

  populateDetail(req);
}

function populateDetail(req) {
  // ── Request tab ──────────────────────────────────────────
  queryDisplay.innerHTML = '';
  queryDisplay.appendChild(renderQueryWithLineNumbers(req.query));

  if (req.variables && Object.keys(req.variables).length > 0) {
    variablesSection.classList.remove('hidden');
    variablesDisplay.innerHTML = '';
    variablesDisplay.appendChild(renderJsonTree(req.variables));
  } else {
    variablesSection.classList.add('hidden');
  }

  copyQueryBtn.onclick = () => copyToClipboard(normalizeQuery(req.query), copyQueryBtn);
  copyVariablesBtn.onclick = () => copyToClipboard(
    JSON.stringify(req.variables, null, 2), copyVariablesBtn
  );

  // ── Response tab ─────────────────────────────────────────
  if (hasGraphQLErrors(req.response)) {
    const errMsgs = (req.response.errors || [])
      .map(e => e.message || JSON.stringify(e))
      .join('; ');
    responseErrorNotice.textContent = errMsgs;
    responseErrorNotice.classList.remove('hidden');
    responseErrorNotice.classList.add('error-notice');
  } else {
    responseErrorNotice.classList.add('hidden');
    responseErrorNotice.classList.remove('error-notice');
  }

  responseDisplay.innerHTML = '';
  if (req.response !== null) {
    responseDisplay.appendChild(renderJsonTree(req.response));
  } else {
    responseDisplay.textContent = '(no response body)';
  }
  copyResponseBtn.onclick = () => copyToClipboard(
    JSON.stringify(req.response, null, 2), copyResponseBtn
  );

  // ── Raw tab ───────────────────────────────────────────────
  rawDisplay.textContent = req.responseRaw || '';
  copyRawBtn.onclick = () => copyToClipboard(req.responseRaw || '', copyRawBtn);

  // ── Headers tab ───────────────────────────────────────────
  renderHeadersTable(requestHeadersTable,  req.headers);
  renderHeadersTable(responseHeadersTable, req.responseHeaders);
}

// ── Headers table ──────────────────────────────────────────────

function renderHeadersTable(table, headers) {
  table.innerHTML = '';
  if (!headers || headers.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 2;
    cell.style.color = 'var(--text-dim)';
    cell.style.padding = '4px 6px';
    cell.textContent = '(none)';
    return;
  }
  headers.forEach(function(h) {
    const row  = table.insertRow();
    const key  = row.insertCell();
    const val  = row.insertCell();
    key.textContent = h.name;
    val.textContent = h.value;
  });
}

// ── Tabs ───────────────────────────────────────────────────────

tabButtons.forEach(function(btn) {
  btn.addEventListener('click', function() {
    const tab = btn.dataset.tab;
    activeTab = tab;

    tabButtons.forEach(b  => b.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

// ── Filter ─────────────────────────────────────────────────────

filterInput.addEventListener('input', function() {
  filterText = filterInput.value.trim();
  renderRequestList();
});

// ── Preserve log ───────────────────────────────────────────────

preserveLogCheckbox.addEventListener('change', function() {
  preserveLog = preserveLogCheckbox.checked;
});

// ── Clear ──────────────────────────────────────────────────────

clearBtn.addEventListener('click', clearAll);

function clearAll() {
  requests   = [];
  selectedId = null;
  requestCounter = 0;

  // Reset right panel
  noSelection.classList.remove('hidden');
  requestDetail.classList.add('hidden');

  renderRequestList();
}

// ── GraphQL syntax highlighting ────────────────────────────────

/**
 * Convert a raw GraphQL string into syntax-highlighted HTML.
 * Returns an HTML string safe to set as innerHTML.
 *
 * Strategy: tokenise character-by-character / simple lexer.
 */
function highlightGQL(source) {
  if (!source) return '';

  // We'll build the output as an array of HTML chunks
  let out   = '';
  let i     = 0;
  const len = source.length;

  function peek(offset) { return source[i + (offset || 0)]; }
  function consume()    { return source[i++]; }

  function emitRaw(text)      { out += escapeHtml(text); }
  function emitSpan(cls, text){ out += '<span class="' + cls + '">' + escapeHtml(text) + '</span>'; }

  const KEYWORDS = new Set([
    'query','mutation','subscription','fragment','on',
    'true','false','null',
  ]);

  while (i < len) {
    const ch = peek();

    // ── Comments
    if (ch === '#') {
      let comment = '';
      while (i < len && peek() !== '\n') comment += consume();
      emitSpan('ql-comment', comment);
      continue;
    }

    // ── Block strings """
    if (ch === '"' && peek(1) === '"' && peek(2) === '"') {
      let str = consume() + consume() + consume(); // consume """
      while (i < len) {
        if (peek() === '"' && peek(1) === '"' && peek(2) === '"') {
          str += consume() + consume() + consume();
          break;
        }
        str += consume();
      }
      emitSpan('ql-string', str);
      continue;
    }

    // ── Regular strings
    if (ch === '"') {
      let str = consume();
      while (i < len && peek() !== '"') {
        if (peek() === '\\') str += consume(); // escape
        str += consume();
      }
      if (i < len) str += consume(); // closing "
      emitSpan('ql-string', str);
      continue;
    }

    // ── Numbers
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      // look-ahead: only treat as number if next char is digit
      if (ch === '-' && !(peek(1) >= '0' && peek(1) <= '9')) {
        emitRaw(consume());
        continue;
      }
      let num = consume();
      while (i < len && (
        (peek() >= '0' && peek() <= '9') ||
        peek() === '.' || peek() === 'e' || peek() === 'E' ||
        peek() === '+' || peek() === '-'
      )) { num += consume(); }
      emitSpan('ql-number', num);
      continue;
    }

    // ── Braces / brackets / parens
    if ('{}[]()'.includes(ch)) {
      emitSpan('ql-brace', consume());
      continue;
    }

    // ── Punctuation (colon, comma, …, =, |, &, !)
    if (':,!|&=@$'.includes(ch)) {
      emitRaw(consume());
      continue;
    }

    // ── Identifiers / keywords
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let word = consume();
      while (i < len && (
        (peek() >= 'a' && peek() <= 'z') ||
        (peek() >= 'A' && peek() <= 'Z') ||
        (peek() >= '0' && peek() <= '9') ||
        peek() === '_'
      )) { word += consume(); }

      if (KEYWORDS.has(word)) {
        emitSpan('ql-keyword', word);
      } else if (word[0] >= 'A' && word[0] <= 'Z') {
        emitSpan('ql-type', word);
      } else {
        // Peek ahead: if followed by ( it's a field used as a call / alias
        emitSpan('ql-field', word);
      }
      continue;
    }

    // ── Whitespace / anything else
    out += escapeHtml(consume());
  }

  return out;
}

// ── Query renderer with line numbers + collapse ────────────────

function normalizeQuery(source) {
  if (!source) return '';
  const lines = source.split('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const minIndent = nonEmpty.length
    ? Math.min(...nonEmpty.map(l => l.match(/^(\s*)/)[1].length))
    : 0;
  return lines.map(l => l.slice(minIndent)).join('\n').trim();
}

function renderQueryWithLineNumbers(source) {
  if (!source) return document.createDocumentFragment();

  const trimmedLines = normalizeQuery(source).split('\n');

  const editor = document.createElement('div');
  editor.className = 'query-editor';

  const lineEls = [];

  trimmedLines.forEach(function(line, idx) {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'ql-line';

    const gutter = document.createElement('span');
    gutter.className = 'ql-gutter';
    gutter.textContent = idx + 1;

    const fold = document.createElement('span');
    fold.className = 'ql-fold';

    const content = document.createElement('span');
    content.className = 'ql-line-content';
    content.innerHTML = highlightGQL(line);

    lineDiv.appendChild(gutter);
    lineDiv.appendChild(fold);
    lineDiv.appendChild(content);
    editor.appendChild(lineDiv);
    lineEls.push(lineDiv);
  });

  // Attach fold handlers: lines ending with { are foldable
  trimmedLines.forEach(function(line, idx) {
    if (!line.trimEnd().endsWith('{')) return;

    const openIndent = line.search(/\S/);
    if (openIndent === -1) return;

    // Find the matching closing line (same indent level, starts with })
    let closeIdx = -1;
    for (let j = idx + 1; j < trimmedLines.length; j++) {
      const jLine = trimmedLines[j];
      if (!jLine.trim()) continue;
      const jIndent = jLine.search(/\S/);
      if (jIndent <= openIndent && jLine.trim().startsWith('}')) {
        closeIdx = j;
        break;
      }
    }

    if (closeIdx <= idx + 1) return; // nothing to fold

    const foldBtn = lineEls[idx].querySelector('.ql-fold');
    foldBtn.textContent = '▾';

    let collapsed = false;
    let ellipsis  = null;

    foldBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      collapsed = !collapsed;
      foldBtn.textContent = collapsed ? '▸' : '▾';

      for (let j = idx + 1; j < closeIdx; j++) {
        lineEls[j].classList.toggle('folded-hidden', collapsed);
      }

      const contentSpan = lineEls[idx].querySelector('.ql-line-content');
      if (collapsed) {
        ellipsis = document.createElement('span');
        ellipsis.className = 'ql-ellipsis-inline';
        ellipsis.textContent = ' … }';
        contentSpan.appendChild(ellipsis);
      } else if (ellipsis) {
        ellipsis.remove();
        ellipsis = null;
      }
    });
  });

  return editor;
}

// ── JSON tree renderer (flat DOM, fixed gutter) ─────────────────

function renderJsonTree(rootValue) {
  const container = document.createElement('div');
  container.className = 'json-tree';

  // Build a flat array of row descriptors
  const rowsData = [];
  let lineNum = 1;
  let nextId  = 0;

  function flatten(value, key, depth, isLast) {
    const id = ++nextId;

    if (value !== null && typeof value === 'object') {
      const isArr   = Array.isArray(value);
      const entries = isArr ? value : Object.entries(value);
      const count   = entries.length;
      const openIdx = rowsData.length;

      rowsData.push({ type: 'open', id, depth, key, count, isArr, lineNum: lineNum++, isLast, openIdx });

      if (isArr) {
        value.forEach(function(v, i) { flatten(v, i, depth + 1, i === value.length - 1); });
      } else {
        entries.forEach(function(entry, i) { flatten(entry[1], entry[0], depth + 1, i === entries.length - 1); });
      }

      const closeIdx = rowsData.length;
      rowsData.push({ type: 'close', id, depth, isArr, lineNum: lineNum++, isLast });
      rowsData[openIdx].closeIdx = closeIdx;

    } else {
      rowsData.push({ type: 'prim', id, depth, key, value, lineNum: lineNum++, isLast });
    }
  }

  flatten(rootValue, undefined, 0, true);

  // Build DOM rows (all flat, direct children of container)
  const rowEls = [];

  rowsData.forEach(function(row) {
    const div = document.createElement('div');
    div.className = 'jt-row';
    div._hiddenBy = new Set();

    // Fixed gutter
    const gutter = document.createElement('span');
    gutter.className = 'jt-gutter';
    gutter.textContent = row.lineNum;
    div.appendChild(gutter);

    // Content — indented via padding-left based on depth
    const content = document.createElement('span');
    content.className = 'jt-content';
    content.style.paddingLeft = (row.depth * 16) + 'px';

    if (row.type === 'open') {
      const toggle = document.createElement('span');
      toggle.className = row.count > 0 ? 'jt-toggle open' : 'jt-toggle';
      toggle.style.visibility = row.count > 0 ? '' : 'hidden';
      toggle.textContent = '▶';
      content.appendChild(toggle);

      if (row.key !== undefined) {
        const keyEl = document.createElement('span');
        keyEl.innerHTML = '<span class="jt-key">' + escapeHtml(String(row.key)) + '</span><span class="jt-colon">: </span>';
        content.appendChild(keyEl);
      }

      const brace = document.createElement('span');
      brace.className = 'jt-brace';
      brace.textContent = row.isArr ? '[' : '{';
      content.appendChild(brace);

      if (row.count > 0) {
        const summary = document.createElement('span');
        summary.className = 'jt-summary';
        summary.textContent = row.isArr ? row.count + ' items' : row.count + ' keys';
        content.appendChild(summary);
        div._toggleEl  = toggle;
        div._summaryEl = summary;
      }

    } else if (row.type === 'close') {
      const placeholder = document.createElement('span');
      placeholder.className = 'jt-toggle';
      placeholder.style.visibility = 'hidden';
      content.appendChild(placeholder);

      const brace = document.createElement('span');
      brace.className = 'jt-brace';
      brace.textContent = (row.isArr ? ']' : '}') + (row.isLast === false ? ',' : '');
      content.appendChild(brace);

    } else {
      // Primitive
      const placeholder = document.createElement('span');
      placeholder.className = 'jt-toggle';
      placeholder.style.visibility = 'hidden';
      content.appendChild(placeholder);

      if (row.key !== undefined) {
        const keyEl = document.createElement('span');
        keyEl.innerHTML = '<span class="jt-key">' + escapeHtml(String(row.key)) + '</span><span class="jt-colon">: </span>';
        content.appendChild(keyEl);
      }

      const valEl = document.createElement('span');
      const v = row.value;
      if (v === null)             { valEl.className = 'jt-null';    valEl.textContent = 'null'; }
      else if (typeof v === 'string')  { valEl.className = 'jt-string';  valEl.textContent = '"' + v + '"'; }
      else if (typeof v === 'number')  { valEl.className = 'jt-number';  valEl.textContent = String(v); }
      else if (typeof v === 'boolean') { valEl.className = 'jt-boolean'; valEl.textContent = String(v); }
      else                              { valEl.textContent = String(v); }
      content.appendChild(valEl);

      if (row.isLast === false) {
        const comma = document.createElement('span');
        comma.className = 'jt-comma';
        comma.textContent = ',';
        content.appendChild(comma);
      }
    }

    div.appendChild(content);
    container.appendChild(div);
    rowEls.push(div);
  });

  // Attach collapse handlers
  rowsData.forEach(function(row, idx) {
    if (row.type !== 'open' || row.count === 0) return;

    const openEl   = rowEls[idx];
    const toggleEl = openEl._toggleEl;
    const summaryEl = openEl._summaryEl;
    // Child rows = everything between open and close (inclusive of close)
    const childEls = rowEls.slice(idx + 1, row.closeIdx + 1);

    toggleEl.addEventListener('click', function(e) {
      e.stopPropagation();
      const isOpen = toggleEl.classList.contains('open');

      toggleEl.classList.toggle('open',   !isOpen);
      toggleEl.classList.toggle('closed',  isOpen);
      summaryEl.style.display = isOpen ? 'inline' : 'none';

      childEls.forEach(function(el) {
        if (isOpen) {
          el._hiddenBy.add(row.id);
        } else {
          el._hiddenBy.delete(row.id);
        }
        el.style.display = el._hiddenBy.size > 0 ? 'none' : '';
      });
    });
  });

  return container;
}

// ── Init ───────────────────────────────────────────────────────

// Ensure empty state is visible on load
emptyState.style.display = 'flex';
requestDetail.classList.add('hidden');
