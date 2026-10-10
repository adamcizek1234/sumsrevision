#!/usr/bin/env python3
"""Build GEM LO Revision from src/ and content/, or import a published copy of the page back into them.

    python3 tools/build.py                build the page into build/
    python3 tools/build.py import FILE    split FILE (the page as published on claude.ai) into src/ and content/

Needs Python 3.8 or newer and nothing else.
"""
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, CONTENT, MAC, BUILD = ROOT / "src", ROOT / "content", ROOT / "mac", ROOT / "build"

# src/index.html is the page with these three placeholders; the build drops the files back in.
MARK_CSS, MARK_DATA, MARK_JS = "{{ styles.css }}", "{{ content }}", "{{ app.js }}"

# Top-level keys of the page's course data, in the order the page stores them, and the folder each lives in.
WEEK_SECTIONS = [("y1", "year1"), ("y2", "year2"), ("anat", "anatomy"), ("icm", "icm")]
SECTION_NAMES = {"y1": "Year 1 weeks", "y2": "Year 2 weeks", "anat": "anatomy topics", "icm": "ICM weeks"}
QUIZ_FILES = {  # the page stores each quiz question as an array; content/quiz/ names the fields
    "sa": ("short-answer.json", ["id", "lo", "q", "acc", "model", "lvl", "hint", "why"]),
    "num": ("numbers.json", ["id", "lo", "q", "shown", "nums", "wrong", "lvl", "why"]),
    "lad": ("ladders.json", ["id", "lo", "title", "steps", "lvl", "whys", "decoys"]),
}
AS_IS_FILES = [("icmSys", "icm-pages.json")]  # kept in content/ exactly as the page stores them
TOP_KEYS = [k for k, _ in WEEK_SECTIONS] + ["drugs", "quiz"] + [k for k, _ in AS_IS_FILES]

# claude.ai wraps the published page in this. build/preview.html adds the same wrapper, so a browser shows the page
# exactly as the artifact does.
HOST_HEAD = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,'
             'viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);'
             'padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;'
             'padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}'
             '[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
HOST_TAIL = "\n</body></html>"

# The Mac app works offline, so its copy of the page loads the fonts from mac/fonts/ instead of Google Fonts.
GOOGLE_FONTS = re.compile(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">\n'
                          r'<link rel="preconnect" href="https://fonts\.gstatic\.com" crossorigin>\n'
                          r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">')
MAC_FONTS = '<link rel="stylesheet" href="fonts/fonts.css">'


class BuildError(Exception):
    pass


# ---------- Generated fields ----------
# Search text and the "has notes" flags are worked out from the notes, so content/ leaves them out. These match the
# page's own textOf() and search strings (app.js), which it uses for notes you edit in the app.

def text_of(html):
    entities = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "nbsp": " ", "#39": "'"}
    text = re.sub(r"&(amp|lt|gt|quot|nbsp|#39);", lambda m: entities[m.group(1)], re.sub(r"<[^>]+>", " ", html))
    return re.sub(r"\s+", " ", text).strip()


def insert_after(obj, key, extra):
    """Copy of obj with the extra fields placed straight after key (the page's data keeps them there)."""
    out = {}
    for k, v in obj.items():
        out[k] = v
        if k == key:
            out.update(extra)
    return out


def drug_search(d):
    parts = [d["name"], d["ex"], d["how"], " ".join(d["se"]), " ".join(u["t"] for u in d["uses"]),
             " ".join(c["c"] + " " + c["why"] for c in d["ci"])]
    return " ".join(parts).lower()


def add_generated(data):
    for key, _ in WEEK_SECTIONS:
        weeks = []
        for w in data[key]:
            los = []
            for lo in w["los"]:
                plain = text_of(lo["html"])
                search = (lo["text"] + " " + " ".join(lo["sessions"]) + " " + plain).lower()
                los.append(insert_after(lo, "html", {"plain": plain, "search": search}))
            w = dict(w, los=los)
            weeks.append(insert_after(w, "los", {"hasNotes": any(lo["html"] for lo in los)}))
        data[key] = weeks
    for cat in data["drugs"]:
        cat["items"] = [insert_after(d, "ci", {"search": drug_search(d)}) for d in cat["items"]]
    return data


def strip_generated(data):
    for key, _ in WEEK_SECTIONS:
        for w in data[key]:
            w.pop("hasNotes", None)
            for lo in w["los"]:
                lo.pop("plain", None)
                lo.pop("search", None)
    for cat in data["drugs"]:
        for d in cat["items"]:
            d.pop("search", None)
    return data


# ---------- content/ <-> course data ----------

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40].strip("-")


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise BuildError(f"{path.relative_to(ROOT)} is not valid JSON: {e}") from None


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_content():
    data = {}
    for key, folder in WEEK_SECTIONS:
        files = sorted((CONTENT / folder).glob("*.json"))
        if not files:
            raise BuildError(f"no weeks found in content/{folder}/")
        data[key] = [read_json(f) for f in files]
    data["drugs"] = [read_json(f) for f in sorted((CONTENT / "drugs").glob("*.json"))]
    data["quiz"] = {}
    for key, (name, fields) in QUIZ_FILES.items():
        items = []
        for i, q in enumerate(read_json(CONTENT / "quiz" / name)):
            if set(q) != set(fields):
                raise BuildError(f"content/quiz/{name}, question {i + 1} ({q.get('id', 'no id')}): "
                                 f"expected the fields {', '.join(fields)}")
            items.append([q[f] for f in fields])
        data["quiz"][key] = items
    for key, name in AS_IS_FILES:
        data[key] = read_json(CONTENT / name)
    check_content(data)
    return add_generated(data)


def check_content(data):
    """Catch the mistakes that would otherwise only show up as a blank or broken page."""
    lo_keys, week_ids = set(), set()
    for key, folder in WEEK_SECTIONS:
        for w in data[key]:
            where = f"content/{folder}/ week {w.get('id', '?')}"
            for f in ("id", "num", "title", "los"):
                if f not in w:
                    raise BuildError(f"{where} has no \"{f}\"")
            if w["id"] in week_ids:
                raise BuildError(f"{where}: the id {w['id']} is used twice")
            week_ids.add(w["id"])
            for lo in w["los"]:
                for f in ("n", "text", "section", "sessions", "html"):
                    if f not in lo:
                        raise BuildError(f"{where}, LO {lo.get('n', '?')} has no \"{f}\"")
                lo_keys.add(f"{w['id']}-{lo['n']}")
    unknown = sorted({q[1] for qs in data["quiz"].values() for q in qs if q[1] not in lo_keys})
    if unknown:
        print(f"warning: quiz questions point at LOs that don't exist: {', '.join(unknown[:10])}"
              + (" …" if len(unknown) > 10 else ""))
    unknown = sorted({k for g in data["icmSys"]["groups"] for k in g["keys"] if k not in lo_keys})
    if unknown:
        print(f"warning: content/icm-pages.json lists LOs that don't exist: {', '.join(unknown[:10])}"
              + (" …" if len(unknown) > 10 else ""))


def save_content(data):
    data = strip_generated(data)
    for _, folder in WEEK_SECTIONS + [("", "drugs"), ("", "quiz")]:
        for old in (CONTENT / folder).glob("*.json"):
            old.unlink()
    for key, folder in WEEK_SECTIONS:
        for i, w in enumerate(data[key], 1):
            write_json(CONTENT / folder / f"{i:02d}-{slug(w['num'])}-{slug(w['title'])}.json", w)
    for i, cat in enumerate(data["drugs"], 1):
        write_json(CONTENT / "drugs" / f"{i:02d}-{slug(cat['title'])}.json", cat)
    for key, (name, fields) in QUIZ_FILES.items():
        for i, q in enumerate(data["quiz"][key]):
            if len(q) != len(fields):
                raise BuildError(f"quiz.{key} question {i + 1} has {len(q)} parts; the build expects {len(fields)}")
        write_json(CONTENT / "quiz" / name, [dict(zip(fields, q)) for q in data["quiz"][key]])
    for key, name in AS_IS_FILES:
        write_json(CONTENT / name, data[key])


def encode_data(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


# ---------- Page ----------

def drop_final_newline(text):
    return text[:-1] if text.endswith("\n") else text


def build_page():
    shell = (SRC / "index.html").read_text(encoding="utf-8")
    for mark in (MARK_CSS, MARK_DATA, MARK_JS):
        if shell.count(mark) != 1:
            raise BuildError(f"src/index.html must contain {mark} exactly once")
    css = drop_final_newline((SRC / "styles.css").read_text(encoding="utf-8"))
    js = drop_final_newline((SRC / "app.js").read_text(encoding="utf-8"))
    data = load_content()
    return shell.replace(MARK_CSS, css).replace(MARK_JS, js).replace(MARK_DATA, encode_data(data)), data


def mac_page(page):
    if len(GOOGLE_FONTS.findall(page)) != 1:
        raise BuildError("couldn't find the Google Fonts links in src/index.html to swap for the Mac app's fonts")
    return GOOGLE_FONTS.sub(lambda m: MAC_FONTS, page)


def build():
    page, data = build_page()
    if BUILD.exists():
        shutil.rmtree(BUILD)
    (BUILD / "mac" / "web").mkdir(parents=True)
    (BUILD / "artifact.html").write_text(page, encoding="utf-8")
    (BUILD / "preview.html").write_text(HOST_HEAD + page + HOST_TAIL, encoding="utf-8")
    (BUILD / "mac" / "web" / "index.html").write_text(mac_page(page), encoding="utf-8")
    shutil.copytree(MAC / "fonts", BUILD / "mac" / "web" / "fonts")
    weeks = ", ".join(f"{len(data[key])} {SECTION_NAMES[key]}" for key, _ in WEEK_SECTIONS)
    los = sum(len(w["los"]) for key, _ in WEEK_SECTIONS for w in data[key])
    print(f"Built {len(page.encode()) / 1e6:.1f} MB page: {weeks}, {los} LOs, "
          f"{sum(len(c['items']) for c in data['drugs'])} drugs, {sum(len(q) for q in data['quiz'].values())} quiz questions.")
    print("  build/artifact.html     the page to publish as the Claude artifact")
    print("  build/preview.html      open this in a browser to try the page")
    print("  build/mac/web/          goes into GEM Revision.app/Contents/Resources/web/")


# ---------- Import ----------

def unwrap(text):
    """The page as written, without the wrapper claude.ai adds when it serves it."""
    first, _, rest = text.partition("\n")
    if first.lower().startswith("<!doctype") and first.endswith("<body>"):
        text = rest
        if text.rstrip().endswith("</body></html>"):
            text = text.rstrip()[: -len("</body></html>")]
            text = drop_final_newline(text)
    if not text.startswith("<meta charset"):
        raise BuildError("that doesn't look like the GEM LO Revision page (it should start with <meta charset=\"utf-8\">)")
    return text


def take_one(text, pattern, what):
    found = list(re.finditer(pattern, text, re.S))
    if len(found) != 1:
        raise BuildError(f"expected exactly one {what} in the page, found {len(found)}")
    return found[0]


def import_page(path):
    raw = Path(path).read_text(encoding="utf-8")
    page = unwrap(raw)
    for mark in (MARK_CSS, MARK_DATA, MARK_JS):
        if mark in page:
            raise BuildError(f"the page already contains the placeholder {mark}")
    css = take_one(page, r"<style>\n(.*?)\n</style>", "<style> block")
    data = take_one(page, r'<script id="lo-data" type="application/json">(.*?)</script>', "course data block")
    js = take_one(page, r"<script>\n(.*?)\n</script>", "<script> block")
    spans = sorted([(css.span(1), MARK_CSS), (data.span(1), MARK_DATA), (js.span(1), MARK_JS)], reverse=True)
    shell = page
    for (start, end), mark in spans:
        shell = shell[:start] + mark + shell[end:]

    course = json.loads(data.group(1))
    if list(course) != TOP_KEYS:
        raise BuildError(f"the course data has the sections {list(course)}; tools/build.py knows {TOP_KEYS}. "
                         "Add the new ones to WEEK_SECTIONS or AS_IS_FILES first.")

    SRC.mkdir(exist_ok=True)
    (SRC / "index.html").write_text(shell, encoding="utf-8")
    (SRC / "styles.css").write_text(css.group(1) + "\n", encoding="utf-8")
    (SRC / "app.js").write_text(js.group(1) + "\n", encoding="utf-8")
    save_content(course)

    rebuilt, _ = build_page()
    if rebuilt != page:
        at = next((i for i, (a, b) in enumerate(zip(rebuilt, page)) if a != b), min(len(rebuilt), len(page)))
        raise BuildError(f"imported, but rebuilding doesn't give the same page back (first difference at character {at}: "
                         f"{page[max(0, at - 60):at + 60]!r}). Check the generated fields in tools/build.py.")
    print(f"Imported {path} into src/ and content/; rebuilding gives the identical page.")
    if HOST_HEAD + page + HOST_TAIL != raw and raw != page:
        print("note: claude.ai's wrapper has changed, so build/preview.html may look slightly different from the artifact.")


def main(argv):
    try:
        if len(argv) == 1:
            build()
        elif len(argv) == 3 and argv[1] == "import":
            import_page(argv[2])
        else:
            print(__doc__.strip())
            return 2
    except BuildError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
