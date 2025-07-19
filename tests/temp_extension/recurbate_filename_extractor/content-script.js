(function() {
  function extractFilename() {
    const meta = document.querySelector('meta[name="description"]');
    if (!meta) return null;

    const content = meta.content;
    const metaMatch = content.match(/(.*?) show from.* on (\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/);

    if (!metaMatch) return null;

    const [_, username, date, hour, minute] = metaMatch;

    const filename = `${username}_${date}_${hour}-${minute}.mp4`;
    return filename;
  }

  const filename = extractFilename();
  if (filename) {
    console.log('[Recurbate Extractor] Expected filename:', filename);

    // Optional: expose to window if needed
    window.recurbateFilename = filename;

    // Or dispatch a custom event
    const event = new CustomEvent('RecurbateFilenameDetected', { detail: { filename } });
    window.dispatchEvent(event);
  }
})();