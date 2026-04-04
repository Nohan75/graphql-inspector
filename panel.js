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
  queryDisplay.innerHTML = highlightGQL(req.query);
  attachQueryCollapseHandlers(queryDisplay);

  if (req.variables && Object.keys(req.variables).length > 0) {
    variablesSection.classList.remove('hidden');
    variablesDisplay.innerHTML = '';
    variablesDisplay.appendChild(renderJsonTree(req.variables));
  } else {
    variablesSection.classList.add('hidden');
  }

  copyQueryBtn.onclick = () => copyToClipboard(req.query, copyQueryBtn);
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

// ── Query collapse handlers ────────────────────────────────────
// After highlighting we attach click-to-collapse on brace spans.
// We do a DOM-based approach: wrap lines that contain { in a collapsible.

function attachQueryCollapseHandlers(container) {
  // Nothing extra needed: brace spans already in place.
  // We add a simpler line-based fold by re-building the content.
  // For a production tool we'd use a proper tokeniser; here we keep it simple
  // and just allow click on any brace to visually indicate collapsing.
  const braceSpans = container.querySelectorAll('.ql-brace');
  braceSpans.forEach(function(span) {
    if (span.textContent === '{') {
      span.title = 'Click to collapse block';
      span.style.cursor = 'pointer';
      span.addEventListener('click', function(e) {
        e.stopPropagation();
        // Find matching closing brace in DOM (sibling text nodes / spans)
        toggleQueryBlock(span);
      });
    }
  });
}

function toggleQueryBlock(openBrace) {
  // Simple approach: toggle a hidden sibling wrapper if it exists,
  // otherwise build one.
  const parent = openBrace.parentNode;
  let wrapper  = openBrace._collapseWrapper;

  if (wrapper) {
    const collapsed = wrapper.classList.contains('hidden');
    wrapper.classList.toggle('hidden', !collapsed);
    openBrace.textContent = collapsed ? '{' : '{ … }';
    return;
  }

  // Build wrapper: collect all nodes between this { and the matching }
  // We use a depth counter to find the matching close brace span.
  const allNodes = Array.from(parent.childNodes);
  const startIdx = allNodes.indexOf(openBrace);
  if (startIdx === -1) return;

  let depth    = 1;
  let endIdx   = -1;
  let closeSpan = null;

  for (let j = startIdx + 1; j < allNodes.length; j++) {
    const node = allNodes[j];
    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('ql-brace')) {
      if (node.textContent === '{') depth++;
      if (node.textContent === '}') {
        depth--;
        if (depth === 0) {
          endIdx    = j;
          closeSpan = node;
          break;
        }
      }
    }
  }

  if (endIdx === -1) return;

  // Wrap nodes between openBrace and closeSpan
  wrapper = document.createElement('span');
  wrapper.className = 'ql-block-content';
  openBrace._collapseWrapper = wrapper;

  // Insert wrapper after openBrace
  const fragment = document.createDocumentFragment();
  const toMove   = allNodes.slice(startIdx + 1, endIdx);
  toMove.forEach(n => fragment.appendChild(n));
  wrapper.appendChild(fragment);
  parent.insertBefore(wrapper, closeSpan);

  // Now toggle
  wrapper.classList.add('hidden');
  openBrace.textContent = '{ … }';
}

// ── JSON tree renderer ─────────────────────────────────────────

/**
 * Recursively render a JS value as a collapsible DOM tree.
 * Returns a DocumentFragment or Element.
 */
function renderJsonTree(value, key, isLast) {
  const frag = document.createDocumentFragment();

  const row  = document.createElement('div');
  row.className = 'jt-row';

  if (value !== null && typeof value === 'object') {
    const isArray    = Array.isArray(value);
    const entries    = isArray ? value : Object.entries(value);
    const isEmpty    = isArray ? value.length === 0 : entries.length === 0;
    const openBrace  = isArray ? '[' : '{';
    const closeBrace = isArray ? ']' : '}';
    const count      = isArray ? value.length : entries.length;

    const toggle = document.createElement('span');
    toggle.className = 'jt-toggle open';
    toggle.textContent = '▶';

    const keySpan = document.createElement('span');
    if (key !== undefined) {
      keySpan.innerHTML =
        '<span class="jt-key">' + escapeHtml(String(key)) + '</span>' +
        '<span class="jt-colon">: </span>';
    }

    const openSpan = document.createElement('span');
    openSpan.className = 'jt-brace';
    openSpan.textContent = openBrace;

    const summarySpan = document.createElement('span');
    summarySpan.className = 'jt-summary';
    summarySpan.textContent = isEmpty
      ? ''
      : (isArray ? count + ' items' : count + ' keys');

    row.appendChild(toggle);
    row.appendChild(keySpan);
    row.appendChild(openSpan);
    row.appendChild(summarySpan);
    frag.appendChild(row);

    if (!isEmpty) {
      const children = document.createElement('div');
      children.className = 'jt-children';

      if (isArray) {
        value.forEach(function(item, idx) {
          children.appendChild(renderJsonTree(item, idx, idx === value.length - 1));
        });
      } else {
        entries.forEach(function([k, v], idx) {
          children.appendChild(renderJsonTree(v, k, idx === entries.length - 1));
        });
      }

      const closeRow = document.createElement('div');
      closeRow.className = 'jt-row';
      const closeSpan = document.createElement('span');
      closeSpan.className = 'jt-brace';
      closeSpan.textContent = closeBrace + (isLast === false ? ',' : '');
      closeRow.appendChild(closeSpan);

      frag.appendChild(children);
      frag.appendChild(closeRow);

      // Toggle collapse
      toggle.style.display = 'inline-block';
      toggle.addEventListener('click', function(e) {
        e.stopPropagation();
        const open = toggle.classList.contains('open');
        toggle.classList.toggle('open',   !open);
        toggle.classList.toggle('closed',  open);
        children.classList.toggle('hidden', open);
        summarySpan.style.display = open ? 'inline' : 'none';
        closeRow.style.display    = open ? 'none'   : '';
      });
    } else {
      toggle.style.visibility = 'hidden';
      const closeInline = document.createElement('span');
      closeInline.className = 'jt-brace';
      closeInline.textContent = closeBrace + (isLast === false ? ',' : '');
      row.appendChild(closeInline);
    }

  } else {
    // Primitive
    const toggle = document.createElement('span');
    toggle.className = 'jt-toggle';
    toggle.style.visibility = 'hidden';
    row.appendChild(toggle);

    if (key !== undefined) {
      const keySpan = document.createElement('span');
      keySpan.innerHTML =
        '<span class="jt-key">' + escapeHtml(String(key)) + '</span>' +
        '<span class="jt-colon">: </span>';
      row.appendChild(keySpan);
    }

    const valSpan = document.createElement('span');
    if (value === null) {
      valSpan.className   = 'jt-null';
      valSpan.textContent = 'null';
    } else if (typeof value === 'string') {
      valSpan.className   = 'jt-string';
      valSpan.textContent = '"' + value + '"';
    } else if (typeof value === 'number') {
      valSpan.className   = 'jt-number';
      valSpan.textContent = String(value);
    } else if (typeof value === 'boolean') {
      valSpan.className   = 'jt-boolean';
      valSpan.textContent = String(value);
    } else {
      valSpan.textContent = String(value);
    }

    if (isLast === false) {
      const comma = document.createElement('span');
      comma.className   = 'jt-comma';
      comma.textContent = ',';
      row.appendChild(valSpan);
      row.appendChild(comma);
    } else {
      row.appendChild(valSpan);
    }

    frag.appendChild(row);
  }

  return frag;
}

// ── Init ───────────────────────────────────────────────────────

// Ensure empty state is visible on load
emptyState.style.display = 'flex';
requestDetail.classList.add('hidden');
