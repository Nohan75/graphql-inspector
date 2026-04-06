chrome.devtools.panels.create(
  'GraphQL',
  '',
  chrome.runtime.getURL('panel.html'),
  (_panel) => {
    // Panel created
  }
);
