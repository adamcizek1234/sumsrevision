# Working on GEM Revision

The app is one web page: HTML, CSS and plain JavaScript, with no framework, no libraries and no npm. All the course content (notes, drugs and quiz questions) is embedded in the page as JSON. The page is published as a Claude artifact, and the Mac app shows the same page in a window.

In this repo the page is split into files you can edit. A small Python script (Python 3.8 or newer, nothing to install) puts it back together.

## What's where

| Path | What it is |
| --- | --- |
| `src/index.html` | The page's HTML. `{{ styles.css }}`, `{{ content }}` and `{{ app.js }}` mark where the build inserts the other parts. |
| `src/styles.css` | All the styles, including dark mode and the phone layout. |
| `src/app.js` | All the app code, as one script. Comments like `/* ---------------- Quiz ---------------- */` mark its sections. |
| `content/year1/`, `content/year2/` | One file per teaching week: its learning outcomes (LOs) and their notes. |
| `content/anatomy/` | One file per anatomy topic. |
| `content/drugs/` | One file per drug group. |
| `content/quiz/` | `short-answer.json`, `numbers.json` and `ladders.json` (put-in-order questions). |
| `mac/` | The Mac app's fonts, icon, `Info.plist` and the "How to open" note that goes in the DMG. |
| `tools/build.py` | Builds the page, and imports a newer published copy back into `src/` and `content/`. |
| `GEM_Revision.dmg` | The Mac app people download. It is built separately; see [The Mac app](#the-mac-app). |

## Build and try it

```sh
python3 tools/build.py
```

This writes three things into `build/`. Git ignores that folder.

- `build/preview.html`: open this in a browser to try the app. It's wrapped the same way claude.ai serves the artifact, so it looks the same.
- `build/artifact.html`: the page to publish as the Claude artifact.
- `build/mac/web/`: the Mac app's copy of the page. It uses the fonts in `mac/fonts/` so it works offline.

Run the build again after every change. It stops with a message if a content file is broken, for example invalid JSON or an LO missing a field.

## Editing content

Files in `content/` sort by their number prefix, which sets the order in the app. To add a week, give it the next number. To put it between two others, renumber the files after it. The rest of the file name is only there for people to read.

### Weeks and anatomy topics

A week file looks like this (the `//` comments are explanations, not part of the file):

```jsonc
{
  "id": "y1-102",          // unique; Year 1 = y1-<num>, Year 2 = y2-<num>, anatomy = a-<num>
  "num": "102",            // the week number shown in the app
  "title": "Diarrhoea",
  "los": [
    {
      "text": "Describe the main signs, …",   // the learning outcome as written
      "sessions": ["Clin 1: Case presentation"],
      "section": "Clinical",                   // Clinical, Lectures, BMS, Pathology, MHS, Anatomy, Practical, ICM, Radiology or Neuro SDL
      "n": 1,                                  // the LO's number within the week
      "html": "<div class=\"tbl kv\">…</div>"  // the notes; "" means no notes yet
    }
  ]
}
```

An LO is referred to everywhere as `<week id>-<n>`, for example `y1-102-1`. The quiz, the drug cards and the progress tracking all use that key. Renumbering an LO breaks those links, and it also drops people's saved ratings for it.

Year 2 weeks also have `lead`, `system` and `date` (the Monday the week starts, `YYYY-MM-DD`). The date decides which week the app shows as "now" and which weeks the Daily 10 has reached. `"partial": true` marks a week that so far only has its anatomy notes.

Anatomy topics have `system`. A topic that's taught inside a Year 2 week has `"link"` (that week's id) and `"pick"` (the LO numbers to show from it), and an empty `los` list.

The notes use a small set of HTML: `p`, `ul`/`ol`/`li`, `strong`, `em`, `sub`, `sup`, `h4`, tables, and these classes:

- `<div class="key">…</div>`: a highlighted key point.
- `<div class="tbl"><table>…</table></div>`: a table.
- `<div class="tbl kv">`: a two-column table with labels in the first column.
- `<ul class="cl">`: a compact list inside a table cell.
- `<span class="paren">`: a smaller, muted line under a label in a `kv` table.

The app's note editor removes any other tags and classes when someone edits a note there, so stick to this set.

### Drugs

Each group file has `id`, `title` and `items`. Each drug has:

- `name` and `ex`: the class name and example drugs.
- `how`: how it works.
- `uses`: a list of `{"t": what it's used for, "k": the LO key it links to}`.
- `se` and `sewhy`: main side effects, and one explanation of them.
- `ci`: contraindications and cautions, each `{"c", "k", "why", "cau": true for a caution, "x": [[wrong reason, why it's wrong], …]}`.
- `hx`: wrong descriptions of how it works, `[[wrong, why it's wrong], …]`. The quiz uses these as distractors.

### Quiz

Every question has an `id` (unique, never reused, because people's quiz history is stored against it), `lo` (the LO key it tests) and `lvl` (1 = Year 1, 2 = Year 2, 3 = Stretch).

- **Short answer** (`short-answer.json`): `q`, `model` (the answer shown), `hint`, `why`, and `acc`, which says which typed answers count. Alternatives are separated by ` / `, and ` + ` joins parts that must all be there. For example, `subcostal + l3 / 3` needs "subcostal" and either "L3" or "3". Small spelling slips are allowed.
- **Numbers** (`numbers.json`): `q`, `shown` (the answer as shown), `nums` (the numbers that count as right), `wrong` (three wrong options for multiple choice) and `why`.
- **Ladders** (`ladders.json`): `title`, `steps` (in the right order), `whys` (one per step) and `decoys` (wrong next steps).

### Generated fields

The page's data also contains `plain` and `search` on each LO, `search` on each drug, and `hasNotes` on each week. `tools/build.py` works these out from the content, so they aren't in `content/` and never need editing.

## How the app saves progress

Ratings, quiz history, edited notes and saved answers are stored in the browser's `localStorage`, under keys that start with `lorev:` (for example `lorev:conf` for ratings and `lorev:srs` for the quiz schedule). Nothing is sent anywhere.

When the page runs as a Claude artifact, `initSync()` in `app.js` also copies that progress to the viewer's Claude account, so it follows them between devices. Anywhere else, `window.claude` doesn't exist and that code does nothing. The Mac app sets `window.GEMREV_APP = true`, and a Windows build sets it to `"windows"`. The only effect is the wording on the quiz page: progress is saved "on this Mac" or "on this PC" instead of "in this browser".

## Taking in a newer version of the artifact

Changes made to the Claude artifact can be pulled back into these files. Get the artifact's current page as an HTML file (Claude can save it for you from the artifact's link), then run:

```sh
python3 tools/build.py import path/to/page.html
```

This rewrites `src/` and `content/` from that page, then rebuilds and checks that the result is identical to the page you gave it. Commit straight afterwards, so that `git diff` shows exactly what changed. To publish changes made here, update the artifact with `build/artifact.html`.

## The Mac app

`GEM Revision.app` is a small native wrapper around the page. It shows `Contents/Resources/web/index.html` in a web view, with the fonts beside it in `web/fonts/`. That folder is exactly what `build/mac/web/` contains.

The wrapper's source code and the script that makes the DMG aren't in this repo yet. Until they are, a new page can be put into an existing copy of the app on a Mac:

1. Copy **GEM Revision** out of `GEM_Revision.dmg`.
2. Replace its `Contents/Resources/web` folder with `build/mac/web`.
3. Re-sign it with `codesign --force --deep --sign - "GEM Revision.app"`.

## Fonts

The page uses Atkinson Hyperlegible, JetBrains Mono and Newsreader from Google Fonts. The copies in `mac/fonts/` are the same fonts. All three are licensed under the SIL Open Font License 1.1, which allows bundling them with the app.
