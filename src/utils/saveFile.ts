/**
 * Has the browser save a text as a file, the way a download link does: the
 * panel has no other way to write to disk.
 */
export function saveTextFile(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  // In the page for the click, as some browsers only follow a link that is
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Not at once: the browser reads the text after the click has returned
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
