---
name: wiki
description: Maintain a persistent markdown wiki as long-term memory. Ingest sources, query the wiki, lint for health. Read this whenever the user adds a source or asks a wiki question.
---

# /wiki — Persistent Knowledge Base

This is the LLM Wiki pattern. The wiki is **markdown files in `wiki/`** that you own and maintain. Sources go in `sources/`. Knowledge compiles once, lives forever.

**Three layers:**
1. **Sources** (`sources/`) — raw, immutable docs. Read, never modify.
2. **Wiki** (`wiki/`) — your output. Summaries, entity pages, concept pages, syntheses.
3. **Schema** — your group's CLAUDE.md tells you which wikis exist, their domains, conventions. **Read it.**

**Two navigation files per wiki:**
- `index.md` — read this FIRST when answering any question. It's the catalog.
- `log.md` — append-only. Add an entry on every ingest, lint, or notable query.

---

## Operation: INGEST

Triggered when the user gives you a source (URL, PDF, image, file) and signals "add this", "read this", "remember this", "ingest this", or similar.

### The cardinal rule: one source at a time

**If the user provides multiple sources at once, process them sequentially.** For each source: read → discuss → fully update the wiki → only then move to the next. **Never** batch-read everything and then write summary pages — that produces shallow, generic output instead of deep integration.

If the user dumps 5 URLs, say something like: "I'll process these one at a time. Starting with #1." Then actually do it that way.

### Step 1: Get the full content

| Source type | How |
|---|---|
| URL (article/page) | `agent-browser` to render and extract — **not** `WebFetch`, which only gives a summary |
| URL (PDF) | `curl -sLo sources/<wiki>/<name>.pdf "<url>"` then `pdftotext -layout` (see `/pdf-reader`) |
| URL (raw text/markdown) | `curl -sL "<url>"` is fine |
| Local PDF | `pdftotext -layout` |
| Image | Read directly — vision is built in |
| Voice note | Use the transcription pipeline if installed |
| Plain text | Read it |

**Save raw sources** under `sources/<wiki>/<descriptive-name>.<ext>` so future passes can re-read. Don't `rm` after extraction.

### Step 2: Discuss with the user

Before writing anything, talk it through. What's the source about? What stood out? What entities/concepts are new? What contradicts or extends existing wiki content? **Get the user's takeaways too** — they often see the angle you missed.

This is also where you decide: which wiki does this belong to? If unclear, ask. If it spans multiple, default to the primary one and add cross-references.

### Step 3: Update the wiki (the bookkeeping pass)

A single ingest typically touches **5-15 pages**. Don't be shy. Specifically:

1. **Source page** — `wiki/<wiki>/sources/<name>.md` or `references/<name>.md` (depending on convention): a structured summary of this source. Title, author, date, URL, key claims, your takeaways.
2. **Entity pages** — for each person/place/thing/project mentioned and worth tracking: create or update its page. Add what this source contributed.
3. **Concept pages** — for each idea/term/theme worth tracking: create or update.
4. **Cross-references** — bidirectional. If page A now mentions page B, link both ways.
5. **Index** — add a line for any new page; update descriptions of changed pages.
6. **Log** — append `## [YYYY-MM-DD] ingest | <source title>` plus 1-3 lines on what changed.
7. **Contradictions** — if this source contradicts an existing wiki claim, **flag it explicitly** on both pages and in the log. Don't silently overwrite.

### Step 4: Report back

Tell the user, briefly: which pages you created/updated, anything contradicted, anything you flagged for follow-up. They might want to course-correct.

---

## Operation: QUERY

Triggered when the user asks a question that the wiki probably has the answer to, or asks you to synthesize across what you've ingested.

### Always read `index.md` first

It's the catalog. Skip it and you'll either miss relevant pages or grep through the whole wiki for nothing.

### Then drill into specific pages

Read the pages the index points to. Read related pages too — that's the point of cross-references.

### Synthesize, with citations

Cite which wiki pages your answer comes from. Format: `[concept name](path/to/page.md)`. If you used multiple sources within a page, say so.

### File good answers back

A long-form answer or comparison you produced is itself wiki-worthy. Offer to file it as a new page. **Don't auto-file** — the user decides what's worth keeping.

---

## Operation: LINT

Triggered manually ("run a lint pass on the wiki") or on a schedule.

Walk the wiki and check for:

- **Contradictions** — claims on different pages that conflict
- **Stale claims** — content superseded by a newer source you've since ingested
- **Orphan pages** — pages with no inbound links from elsewhere in the wiki
- **Missing concept/entity pages** — terms mentioned often across pages but never given their own page
- **Broken cross-references** — links pointing at non-existent pages
- **Index drift** — pages that exist but aren't in `index.md`, or index entries pointing at deleted pages
- **Empty/stub pages** — pages created but never filled in
- **Data gaps** — questions the wiki implicitly raises but doesn't answer (often opportunities to suggest a source to ingest)

**Output:** a report grouped by issue type. **Offer to fix** the mechanical issues automatically (orphans, broken links, index drift). **Surface the substantive ones** (contradictions, gaps) for the user to weigh in.

Append a `## [YYYY-MM-DD] lint | <one-line summary>` entry to each affected wiki's `log.md`.

---

## Conventions (general — group CLAUDE.md may add more)

- **Filenames**: `kebab-case.md`. No spaces.
- **Cross-references**: relative markdown links — `[Athena](../projects/athena.md)`. **Bidirectional**: if A links to B, B should link to A unless there's a reason not to.
- **Dates**: ISO-8601 (`2026-05-09`). Always.
- **Page top**: 1-2 sentence summary, then sections.
- **Citations**: link to the source page in `sources/` or `references/`, not raw URLs. Keeps citations stable when URLs rot.
- **Don't delete** without good reason. Mark pages stale or contradicted instead — history is data.
- **Don't bloat** — small, well-linked pages beat one giant page. Split when a page exceeds ~300 lines or covers multiple concepts.

---

## What NOT to do

- ❌ Don't summarize a URL with `WebFetch` and call that ingestion. You need the full text.
- ❌ Don't batch-process multiple sources in parallel. One at a time, fully integrated, every time.
- ❌ Don't write to `sources/` — it's read-only by convention.
- ❌ Don't skip the log entry. Future-you needs it.
- ❌ Don't auto-file query answers without asking.
- ❌ Don't silently overwrite contradicted content. Flag it.
