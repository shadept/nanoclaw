---
name: pdf-reader
description: Read PDFs from URLs, attachments, or local paths. Uses curl + pdftotext (poppler-utils). Falls back to agent-browser for image-only/scanned PDFs.
---

# /pdf-reader — PDF Reading

Container has `pdftotext` and `pdfinfo` from `poppler-utils`. Combined with `curl`, you can ingest any text-based PDF reachable by URL or already on disk.

## When to use

- User shares a PDF URL
- User asks you to read a paper, manual, spec, or book chapter that's a PDF
- You're ingesting a source into a wiki and the source is a PDF

## How to use

### From a URL (download first, then extract)

Always download to a stable path so you can re-read it later if needed:

```bash
curl -sL -o /workspace/sources/<wiki>/<descriptive-name>.pdf "<url>"
pdftotext -layout /workspace/sources/<wiki>/<descriptive-name>.pdf -
```

`-layout` preserves columns/tables roughly. Drop it for prose-heavy docs if layout produces messy output.

`-` as the output path streams to stdout. Use a real filename if you want a `.txt` companion: `pdftotext -layout file.pdf file.txt`.

### From a local path (already downloaded or attached)

```bash
pdftotext -layout /path/to/file.pdf -
```

### Get metadata without extracting all text

```bash
pdfinfo /path/to/file.pdf
```

Useful for checking page count before deciding to read the whole thing.

### Extract a page range (long docs)

```bash
pdftotext -layout -f 1 -l 10 file.pdf -    # pages 1-10
```

## When extraction is empty or garbage

That means the PDF is image-based / scanned / DRM-protected. `pdftotext` only handles text-layer PDFs.

Fallback: open the PDF visually with `agent-browser` (it can render PDFs and you can read the rendered pages). Tell the user the PDF is scanned and you're switching to visual reading.

## Wiki ingest convention

When ingesting into a wiki, **keep the downloaded PDF**. Don't `rm` it after extraction — the source belongs in `sources/<wiki>/`. Future wiki updates may need to re-read the original.
