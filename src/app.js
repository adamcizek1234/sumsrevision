(() => {
  const DATA = JSON.parse(document.getElementById("lo-data").textContent);
  const TODAY = new Date();
  const SECTION_ORDER = ["Clinical", "Lectures", "BMS", "Pathology", "MHS", "Anatomy", "Practical", "ICM", "Radiology", "Neuro SDL"];
  const SECTION_LABEL = { Clinical: "Clinical", Lectures: "Lectures", BMS: "BMS", Pathology: "Pathology", MHS: "MHS", Anatomy: "Anatomy", Practical: "Practical", ICM: "ICM skills", Radiology: "Radiology", "Neuro SDL": "Neuro SDL" };
  const SECTION_DOT = { Clinical: 1, Lectures: 1, BMS: 2, Pathology: 3, MHS: 4, Anatomy: 5, Practical: 6, ICM: 6, Radiology: 3, "Neuro SDL": 4 };
  const CONF_LABEL = { 1: "Not yet", 2: "Shaky", 3: "Confident" };
  // Note collections: the two years from the LO spreadsheets, plus Year 1 anatomy (Human Structure LOs) as its own tab.
  const YEARS = ["y1", "y2", "anat", "icm"];
  const YEAR_LABEL = { y1: "Year 1", y2: "Year 2", anat: "Anatomy", icm: "ICM" }, YEAR_SHORT = { y1: "Y1", y2: "Y2", anat: "Anat", icm: "ICM" };

  const store = {
    get(k, d) { try { const v = localStorage.getItem("lorev:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("lorev:" + k, JSON.stringify(v)); } catch {} }
  };
  // LO confidence, stored as {loKey: [value, time]} so it can merge across devices (value 0 = cleared).
  const nowS = () => Math.floor(Date.now() / 1000);
  let confT = {}, conf = {};
  { const raw = store.get("conf", {}); for (const k in raw) confT[k] = Array.isArray(raw[k]) ? raw[k] : [raw[k], 0]; }
  function rebuildConf() { conf = {}; for (const k in confT) if (confT[k][0]) conf[k] = confT[k][0]; }
  rebuildConf();
  const state = { year: "y2", week: null, cat: null, drug: null, filter: "All", hideNotes: store.get("hide", false), query: "", qscreen: "home", qnote: "" };

  const weeksById = {}, loByKey = {};
  for (const y of YEARS) for (const w of DATA[y] || []) { w.year = y; weeksById[w.id] = w; for (const lo of w.los) { lo.key = w.id + "-" + lo.n; loByKey[lo.key] = { w, lo }; } }
  // Linked weeks hold LOs of a Year 2 week (the same objects, keys unchanged). Year 2 anatomy weeks share them with the
  // Year 2 tab; Year 2 ICM weeks move them out of the learning week into the ICM tab. LINK[g] maps LO key → that week.
  // Year 1 anatomy and ICM weeks are "sep": their questions stay out of the main quiz modes.
  const LINK = { anat: {}, icm: {} };
  for (const g of ["anat", "icm"]) for (const w of DATA[g] || []) {
    if (!w.link) { w.sep = true; continue; }
    const src = weeksById[w.link], byN = new Map((src ? src.los : []).map(lo => [lo.n, lo]));
    w.los = w.pick.map(n => byN.get(n)).filter(Boolean); w.hasNotes = w.los.some(lo => lo.html); w.date = src && src.date;
    for (const lo of w.los) { LINK[g][lo.key] = w.id; if (g === "icm") loByKey[lo.key] = { w, lo }; }
  }
  for (const w of DATA.y2) if (w.los.some(lo => LINK.icm[lo.key])) { w.los = w.los.filter(lo => !LINK.icm[lo.key]); w.icmWeek = "i-" + w.num; w.hasNotes = w.los.some(lo => lo.html); }
  // The ICM tab shows one page per system for each year (icm_systems.txt, via build.py), LOs numbered from 1 on their page
  // (lo.dn). The ICM weeks above become hidden source weeks: they keep each LO's key, notes, questions, date and "sep", and
  // ICM_SRC maps LO key → that week. LINK.icm and loByKey now point at the page; old ICM week links open the page instead.
  const ICM_SRC = {}, ICM_SYS = {};
  {
    const S = DATA.icmSys || { systems: [], groups: [] };
    for (const [id, title, short, core] of S.systems) ICM_SYS[id] = { id, title, short, core };
    for (const w of DATA.icm || []) { w.hidden = true; for (const lo of w.los) ICM_SRC[lo.key] = w; }
    DATA.icm = S.groups.map(g => {
      const s = ICM_SYS[g.sys], los = g.keys.map(k => loByKey[k] && loByKey[k].lo).filter(Boolean);
      const p = { id: g.id, num: "Y" + g.yr, yr: g.yr, year: "icm", sys: g.sys, title: s.title, short: s.short, core: s.core, los, hasNotes: los.some(lo => lo.html) };
      p.links = new Set(los.map(lo => ICM_SRC[lo.key].link).filter(Boolean));  // Year 2 weeks its LOs come from
      los.forEach((lo, i) => { lo.dn = i + 1; loByKey[lo.key] = { w: p, lo }; LINK.icm[lo.key] = p.id; });
      weeksById[p.id] = p;
      return p;
    });
    for (const w of DATA.y2) if (w.icmWeek && weeksById[w.icmWeek]) w.icmPages = [...new Set(weeksById[w.icmWeek].los.map(lo => LINK.icm[lo.key]))];
  }
  const isLinked = w => !!(w && w.link);
  const yrOf = w => w.yr || (isLinked(w) ? 2 : 1);  // anatomy and ICM tabs: which year's list a week or page sits in
  const visibleWeek = id => { const w = weeksById[id]; return w && w.hidden && w.los.length ? loByKey[w.los[0].key].w : w; };  // an old ICM week → its first page
  const pageTag = w => w.year === "icm" && w.yr ? `ICM Y${w.yr} ${w.short}` : `${YEAR_SHORT[w.year]} ${w.num}`;
  const loTagOf = h => `${pageTag(h.w)} · LO ${h.lo.dn || h.lo.n}`;
  const srcWeekOf = k => ICM_SRC[k] ? ICM_SRC[k].id : weekOf(k);  // the week behind an LO (dates, "sep" for the quiz)
  const DRUGS = DATA.drugs || [], catById = {}, drugById = {};
  for (const c of DRUGS) { catById[c.id] = c; for (const d of c.items) { d.cat = c.id; drugById[d.id] = d; } }

  function currentY2Week() {
    let cur = null;
    for (const w of DATA.y2) { if (!w.date) continue; const d = new Date(w.date + "T00:00:00"); if (d <= TODAY) cur = w; }
    if (cur) { const end = new Date(cur.date + "T00:00:00"); end.setDate(end.getDate() + 7); if (TODAY >= end) return null; }
    return cur;
  }
  const NOW = currentY2Week();

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtDate = iso => { const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const verbify = t => { const m = t.match(/^(\(?[A-Z0-9]+\)?\s)?([A-Z][a-z]+)(\b.*)$/s); if (!m || m[1]) return esc(t); return `<span class="verb">${esc(m[2])}</span>${esc(m[3])}`; };

  const ring = w => prog("ring", "week:" + w.id);

  function renderNav() {
    for (const b of document.querySelectorAll(".years button")) b.setAttribute("aria-pressed", b.dataset.year === state.year);
    const ul = $("#weeks");
    $("#go-home").setAttribute("aria-pressed", state.year === "home" && !state.query.trim());
    $("#go-mastered").setAttribute("aria-pressed", state.year === "mastered" && !state.query.trim());
    if (state.year === "quiz") {
      const s = stats(), cur = state.query.trim() ? "" : state.qscreen === "session" ? (QS ? QS.mode : "") : state.qscreen;
      const sel = GMODE[cur] ? GMODE[cur][0] : cur === "custom" && state.qscreen === "custom" && qcfg.scope === "search" ? "search" : cur;
      const modes = [["home", "Quiz home", ""], ["daily", "Daily 10", s.doneToday ? "✓" : "10"], ["cont", "Continue learning", ""], "Practise", ["due", "Review due", s.due], ["shaky", "Drill shaky LOs", shakyLos().size], ["sprint", "60-second sprint", "60s"], "Choose your own", ["custom", "Custom quiz", ""], ["search", "Search quiz", ""], ["hist", "Quiz history", histList().length || ""], "By subject", ["anat", "Anatomy quiz", gStats("anat").doneToday ? "✓" : ""], ["icm", "ICM quiz", gStats("icm").doneToday ? "✓" : ""]];
      ul.innerHTML = modes.map(m => typeof m === "string" ? `<li class="wk-group">${m}</li>` : `<li><button role="tab" data-qmode="${m[0]}" aria-selected="${sel === m[0]}"><span class="wk-num">${m[2]}</span><span class="wk-title">${m[1]}</span></button></li>`).join("");
      return;
    }
    if (state.year === "mastered") {
      const m = masteredData(), sel = state.query.trim() ? "" : state.mtab || "los";
      ul.innerHTML = [["los", "Learning outcomes", m.los.length], ["drugs", "Drugs", m.drugs.length], ["qs", "Quiz questions", m.qs.length]].map(([id, label, n]) => `<li><button role="tab" data-mtab="${id}" aria-selected="${sel === id}"><span class="wk-num">${n}</span><span class="wk-title">${label}</span></button></li>`).join("");
      return;
    }
    if (state.year === "home") {
      const hw = homeWeek(), s = stats();
      const items = [["home", "Home", ""], hw && ["week:" + hw.w.id, hw.when + ": " + hw.w.title, hw.w.num], ["daily", "Daily 10", s.doneToday ? "✓" : "10"], ["due", "Review due", s.due], ["hist", "Quiz history", histList().length || ""], ["progress", "Progress", pct(progressOf("total").score)], ["mastered", "Mastered", ""]].filter(Boolean);
      ul.innerHTML = items.map(([id, label, b]) => `<li><button role="tab" data-hnav="${id}" aria-selected="${id === "home" && !state.query.trim()}"><span class="wk-num">${b}</span><span class="wk-title">${esc(label)}</span></button></li>`).join("");
      return;
    }
    if (state.year === "progress") {
      ul.innerHTML = [["total", "Overall"], ["y1", "Year 1"], ["y2", "Year 2"], ["anat", "Anatomy"], ["icm", "ICM"], ["drugs", "Drugs"], ["quiz", "Quiz"]].map(([id, label]) => `<li><button role="tab" data-psec="${id}" aria-selected="false"><span class="wk-num">${pct(progressOf(id).score)}</span><span class="wk-title">${label}</span></button></li>`).join("")
        + `<li><button role="tab" data-hnav="mastered" aria-selected="false"><span class="wk-num">★</span><span class="wk-title">What I've mastered</span></button></li>`;
      return;
    }
    if (state.year === "drugs") {
      ul.innerHTML = DRUGS.map(c => `<li><button role="tab" data-cat="${c.id}" aria-selected="${c.id === state.cat && !state.query}"><span class="wk-num">${c.items.length}</span><span class="wk-title">${esc(c.title)}</span>${prog("ring", "dcat:" + c.id)}</button></li>`).join("");
      const s2 = ul.querySelector('[aria-selected="true"]'); if (s2) s2.scrollIntoView({ block: "nearest", inline: "center" });
      return;
    }
    const isNow = w => NOW && (NOW.id === w.id || NOW.id === w.link || (w.links && w.links.has(NOW.id)));
    const gname = w => `Year ${yrOf(w)}${w.yr ? (w.core ? " · core skills" : " · systems") : ""}`;
    const group = (w, i, all) => (state.year === "anat" || state.year === "icm") && (i === 0 || gname(w) !== gname(all[i - 1])) ? `<li class="wk-group">${gname(w)}</li>` : "";
    ul.innerHTML = DATA[state.year].map((w, i, all) => `${group(w, i, all)}<li><button role="tab" id="tab-${w.id}" data-week="${w.id}" class="${w.hasNotes ? "" : "pending"}" aria-selected="${w.id === state.week && !state.query}" title="${esc(w.yr ? `Year ${w.yr} ${w.title}: ${w.los.length} LOs` : w.num + " " + w.title)}"><span class="wk-num">${w.yr ? w.los.length : w.num}</span><span class="wk-title">${esc(w.title)}${isNow(w) ? '<span class="wk-now">now</span>' : ""}${!w.hasNotes ? '<span class="wk-soon">soon</span>' : w.partial ? '<span class="wk-soon">anatomy</span>' : ""}</span>${ring(w)}</button></li>`).join("");
    const sel = ul.querySelector('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function renderWeek() {
    const w = weeksById[state.week], page = w.year === "icm" && w.yr;
    // Filter chips: session types, or on an ICM system page the skill types (an LO can have more than one).
    const kinds = page ? CATS.icm.map((c, i) => ({ id: c.id, label: c.title, dot: i % 6 + 1, has: lo => c.keys.has(lo.key) }))
      : SECTION_ORDER.map(sec => ({ id: sec, label: SECTION_LABEL[sec], dot: SECTION_DOT[sec], has: lo => lo.section === sec }));
    const counts = {}; for (const k of kinds) counts[k.id] = w.los.filter(k.has).length;
    const secs = kinds.filter(k => counts[k.id]);
    if (state.filter !== "All" && !counts[state.filter]) state.filter = "All";
    const n = w.los.length, kind = kinds.find(k => k.id === state.filter);
    const meta = [];
    if (w.date) meta.push(`<span>w/c <b>${fmtDate(w.date)}</b></span>`);
    if (isLinked(w)) meta.push(`<span>Shared with <button class="linkbtn" data-goweek="${w.link}">Year 2 week ${w.num}: ${esc(weeksById[w.link].title)}</button></span>`);
    if (page) {
      const from = [...new Set(w.los.map(lo => ICM_SRC[lo.key].num))], other = weeksById[`i${3 - w.yr}-${w.sys}`];
      meta.push(`<span>${w.yr === 1 ? "What you need by the end of Year 1" : "What Year 2 adds, for the end of Year 2"}</span>`);
      meta.push(`<span>From ${w.yr === 2 ? "Year 2 " : "ICM "}week${from.length > 1 ? "s" : ""} ${from.length > 6 ? from.slice(0, 5).join(", ") + " and " + (from.length - 5) + " more" : from.length > 1 ? from.slice(0, -1).join(", ") + " and " + from[from.length - 1] : from[0]}</span>`);
      if (other) meta.push(`<span>See also <button class="linkbtn" data-goweek="${other.id}">Year ${other.yr} ${esc(other.title)}</button></span>`);
    }
    if (w.system) meta.push(`<span>${esc(w.system)}</span>`);
    if (w.lead) meta.push(`<span>Lead: ${esc(w.lead)}</span>`);
    meta.push(`<span><b>${n}</b> learning outcomes</span>`);
    const shown = w.los.filter(lo => !kind || kind.has(lo));
    const pages = (w.icmPages || []).map(id => weeksById[id]).filter(Boolean);
    $("#view").innerHTML = `
      <header class="week-head">
        ${histBackLink({ v: "week", week: w.id }, ["quiz", "drugs", "search"])}
        <div class="eyebrow">${YEAR_LABEL[state.year]}${page ? ` · Year ${w.yr} · ${w.core ? "core skills" : "systems"}` : isLinked(w) ? " · Year 2" : state.year === "anat" || state.year === "icm" ? " · Year 1" : ""}${page ? "" : ` · Week ${w.num}`}${NOW && (NOW.id === w.id || NOW.id === w.link || (w.links && w.links.has(NOW.id))) ? (page ? " · has this week's LOs" : " · this week") : ""}</div>
        <h2>${esc(w.title)}</h2>
        <div class="meta">${meta.join("")}</div>
        <div class="prows">${prog("row", "week:" + w.id, "Your ratings")}${WEEK_N[w.id] ? prog("row", "qweek:" + w.id, "Quiz questions") : ""}</div>
      </header>
      <div class="toolbar">
        <div class="chips" role="group" aria-label="${page ? "Filter by skill type" : "Filter by session type"}">
          <button class="chip" data-filter="All" aria-pressed="${state.filter === "All"}">All <span class="ct">${n}</span></button>
          ${secs.map(k => `<button class="chip" data-filter="${k.id}" aria-pressed="${state.filter === k.id}"><span class="dot" style="background:var(--dot-${k.dot})"></span>${esc(k.label)} <span class="ct">${counts[k.id]}</span></button>`).join("")}
        </div>
        <div class="tools">${WEEK_N[w.id] ? `<button class="tool" id="quiz-week">Quiz · ${WEEK_N[w.id]}</button>` : ""}<button class="tool" id="hide-notes" aria-pressed="${state.hideNotes}">Self-test</button><button class="tool" id="open-all">Expand all</button></div>
      </div>
      ${pages.length ? `<p class="pending-note">This week's ICM learning outcomes are in the ICM tab, sorted by system: ${pages.map(pg => `<button class="linkbtn" data-goweek="${pg.id}">Year 2 ${esc(pg.title)}</button>`).join(", ")}</p>` : ""}
      ${w.partial ? '<p class="pending-note">Only the anatomy LOs of this week have notes so far (they are also in the Anatomy tab); the rest are still to be written.</p>' : ""}
      ${w.hasNotes ? "" : '<p class="pending-note">Revision notes for this week are still to be written. The learning outcomes are listed below so you can see what the week covers, and you can write your own with <b>Add notes</b> on any of them.</p>'}
      <section class="los">${shown.map(loCard).join("")}</section>
      <p class="foot-note">LO wording is from ${page && w.yr === 2 ? "the Year 2 LO spreadsheet (ICM section); they moved here from the learning weeks, keeping your notes, edits and ratings" : isLinked(w) ? "the Year 2 Human Structure learning outcomes, which are also in the Year 2 week, so notes, edits and ratings here are the same ones" : state.year === "anat" ? "the Year 1 Human Structure learning outcomes" : state.year === "icm" ? "the ICM learning outcomes (2025–26)" : "the GEM spreadsheet" + (state.year === "y1" ? " (2025–26)" : " (2026–27)")}${page ? ". Each card shows the teaching week and session it came from" : ""}. Notes are condensed revision summaries; check doses and current guidance against the BNF, NICE and your lecture slides.</p>`;
    $("#main").scrollTop = 0;
    if (window.innerWidth <= 860) window.scrollTo(0, 0);
    logView();
  }

  function loCard(lo) {
    const v = conf[lo.key] || 0, editing = ED.key === lo.key;
    if (editing && ED.timer) saveEdit();  // a re-render must start from the latest text
    const closed = state.hideNotes && !editing, src = ICM_SRC[lo.key];  // ICM LOs show the week they were taught in
    const body = editing
      ? `<div class="ed-bar" role="toolbar" aria-label="Formatting">${edBarHTML()}</div><div class="lo-body" contenteditable="true" lang="en-GB" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Notes for LO ${lo.dn || lo.n}">${lo.html || "<p><br></p>"}</div><p class="ed-tip">Saves as you type. Tab makes a sub-bullet or moves between table cells. Esc or ⌘↵ when finished.</p>`
      : lo.mine ? `<div class="lo-body">${lo.html || '<p class="empty">You cleared this note.</p>'}</div>${lo.html0 ? `<div class="lo-body orig">${lo.html0}</div>` : ""}${mineBar(lo)}`
      : `<div class="lo-body">${lo.html || (lo.section === "Practical" ? '<p class="empty prac"><b>Practical: spotting only.</b> Revise this with specimens, models or images; there are no written notes or quiz questions for it.</p>' : '<p class="empty">Notes coming soon.</p>')}</div>`;
    const pen = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L5 14H2v-3z"/></svg>';
    return `<article class="lo${closed ? " closed reveal-hint" : ""}${editing ? " editing" : ""}" id="lo-${lo.key}">
      <button class="lo-head" aria-expanded="${!closed}" data-toggle>
        <div class="lo-tags"><span class="lo-n">LO ${lo.dn || lo.n}</span>${src ? `<span class="lo-sec" title="${esc(`From ${src.link ? "Year 2" : "ICM"} week ${src.num}: ${src.title}`)}">${src.link ? "Year 2 week" : "Week"} ${src.num}</span>` : `<span class="lo-sec"><span class="dot" style="background:var(--dot-${SECTION_DOT[lo.section]})"></span>${SECTION_LABEL[lo.section]}</span>`}${lo.mine ? `<span class="lo-mine">${lo.html0 ? "Edited" : "My notes"}</span>` : ""}<span class="lo-sess">${esc(lo.sessions.join(" · "))}</span></div>
        <div class="lo-text"><span>${verbify(lo.text)}</span><svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></div>
      </button>
      ${body}
      <div class="lo-foot"><span>Can I answer this?</span>${[1, 2, 3].map(k => `<button class="conf" data-key="${lo.key}" data-v="${k}" aria-pressed="${v === k}">${CONF_LABEL[k]}</button>`).join("")}${fromQuiz(lo.key) ? QRATED : ""}${BY_LO[lo.key] ? `<button class="qlo" data-quizlo="${lo.key}">Quiz me · ${BY_LO[lo.key].length}</button>` : ""}${editing ? "" : `<button class="edit-btn" data-edit="${lo.key}" title="Edit these notes">${pen}${lo.html ? "Edit" : "Add notes"}</button>`}</div>
    </article>`;
  }

  function loLink(text, key, cls = "lolink") {
    const hit = key && loByKey[key];
    if (!hit) return `<span class="${cls === "lolink" ? "" : cls}">${esc(text)}</span>`;
    const tag = loTagOf(hit);
    return `<a class="${cls}" href="#${hit.w.id}" data-golo="${key}" title="${esc(tag + ": " + hit.lo.text)}">${esc(text)}<span class="lotag">${tag}</span></a>`;
  }

  const myAdds = id => { const l = mine(id).filter(x => x[1] === "drug"); return l.length ? `<p class="mine-add"><span class="lbl">Your additions</span>${l.map(x => esc(x[0])).join("; ")}</p>` : ""; };
  function drugCard(d) {
    const ci = d.ci.filter(c => !c.cau), cau = d.ci.filter(c => c.cau);
    const row = c => `<tr><th scope="row"><span class="pill ${c.cau ? "cau" : "no"}">${c.cau ? "Caution" : "Avoid"}</span>${loLink(c.c, c.k)}</th><td>${esc(c.why)}</td></tr>`;
    return `<article class="drug" id="drug-${d.id}">
      <div class="drug-head"><h3>${esc(d.name)}</h3>${d.ex ? `<span class="ex">${esc(d.ex)}</span>` : ""}</div>
      ${d.uses.length ? `<div><span class="lbl">Used for</span><div class="uses">${d.uses.map(u => u.k ? loLink(u.t, u.k, "u lolink") : `<span class="u">${esc(u.t)}</span>`).join("")}</div></div>` : ""}
      ${d.how ? `<p class="drug-how"><span class="lbl">How it works</span>${esc(d.how)}</p>` : ""}
      ${d.se.length ? `<div><span class="lbl">Main side effects</span><ul class="se">${d.se.map(s => `<li>${esc(s)}</li>`).join("")}</ul>${myAdds("d:" + d.id + ":s")}${d.sewhy ? `<p class="sewhy">${esc(d.sewhy)}</p>` : ""}</div>` : ""}
      ${d.ci.length ? `<div><span class="lbl">${ci.length ? "Contraindications" : ""}${ci.length && cau.length ? " & cautions" : cau.length ? "Cautions" : ""}: tap one to open its LO</span><div class="tbl kv ci"><table><tbody>${[...ci, ...cau].map(row).join("")}</tbody></table></div>${myAdds("d:" + d.id + ":c")}</div>` : ""}
      <div class="drug-foot"><span>Know this drug?</span>${[1, 2, 3].map(k => `<button class="conf" data-key="drug:${d.id}" data-v="${k}" aria-pressed="${conf["drug:" + d.id] === k}">${CONF_LABEL[k]}</button>`).join("")}${fromQuiz("drug:" + d.id) ? QRATED : ""}<button class="qlo" data-quizdrug="${d.id}">Quiz me · ${progressOf("qdrug:" + d.id).n}</button></div>
    </article>`;
  }

  function renderDrugs(drugId) {
    const c = catById[state.cat] || DRUGS[0]; state.cat = c.id;
    $("#view").innerHTML = `
      <header class="week-head">
        ${histBackLink({ v: "drugs", cat: c.id }, ["quiz", "search"])}
        <div class="eyebrow">Drugs · ${c.items.length} entries</div>
        <h2>${esc(c.title)}</h2>
        <div class="meta"><span>Drugs from your LOs, with main side effects. <b>Avoid</b> = contraindicated, <b>Caution</b> = use carefully. Tap a condition to open the LO it's about.</span></div>
        <div class="prows">${prog("row", "dcat:" + c.id, "Your ratings")}${prog("row", "qdcat:" + c.id, "Quiz questions")}</div>
      </header>
      <nav class="drug-index" aria-label="Drugs in this group">${c.items.map(d => `<a href="#drugs-${c.id}" data-drug="${d.id}">${esc(d.name)}</a>`).join("")}</nav>
      <section class="drugs">${c.items.map(drugCard).join("")}</section>
      <p class="foot-note">A revision summary, not a prescribing reference. Always check the BNF and local guidelines before prescribing.</p>`;
    $("#main").scrollTop = 0;
    if (window.innerWidth <= 860) window.scrollTo(0, 0);
    logView();
    if (drugId) { const el = document.getElementById("drug-" + drugId); if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); } }
  }

  function openDrugs(catId, drugId) {
    state.year = "drugs"; state.cat = catById[catId] ? catId : (store.get("last-drugs", null) in catById ? store.get("last-drugs", null) : DRUGS[0].id);
    state.query = ""; state.drug = drugId || null; $("#q").value = "";
    store.set("last-drugs", state.cat);
    if (location.hash !== "#drugs-" + state.cat) history.replaceState(null, "", "#drugs-" + state.cat);
    renderNav(); renderDrugs(drugId);
  }

  function renderSearch() {
    const q = state.query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const hits = [];
    for (const y of YEARS) for (const w of DATA[y]) if (!(w.link && y === "anat")) for (const lo of w.los) {
      const hay = lo.search;
      if (terms.every(t => hay.includes(t))) hits.push({ w, lo });
    }
    const mark = s => { let out = esc(s); for (const t of terms) { const re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"); out = out.replace(re, "<mark>$1</mark>"); } return out; };
    const snippet = lo => { const p = lo.plain, i = p.toLowerCase().indexOf(terms[0]); if (i < 0) return ""; const s = Math.max(0, i - 60); return (s ? "…" : "") + p.slice(s, i + 110) + "…"; };
    const groups = {};
    for (const h of hits) (groups[h.w.id] ||= []).push(h);
    const drugHits = [];
    for (const c of DRUGS) for (const d of c.items) if (terms.every(t => d.search.includes(t))) drugHits.push(d);
    const drugGroup = drugHits.length ? `<div class="res-group"><h3>Drugs</h3>${drugHits.slice(0, 15).map(d => `<button class="res" data-opendrug="${d.id}"><b>${mark(d.name)}${d.ex ? ` <span style="font-weight:400;color:var(--muted)">${mark(d.ex)}</span>` : ""}</b><small>${esc(catById[d.cat].title)}</small></button>`).join("")}</div>` : "";
    const total = hits.length + drugHits.length;
    $("#view").innerHTML = `<header class="week-head"><div class="eyebrow">Search</div><h2>${total} match${total === 1 ? "" : "es"} for “${esc(state.query.trim())}”</h2></header>
      <div class="results">${drugGroup}${hits.length ? Object.values(groups).slice(0, 60).map(g => `<div class="res-group"><h3>${YEAR_LABEL[g[0].w.year]} · ${g[0].w.num} ${esc(g[0].w.title)}</h3>${g.slice(0, 12).map(({ w, lo }) => `<button class="res" data-goto="${lo.key}" data-week="${w.id}"><b>${mark(lo.text)}</b><small>${mark(snippet(lo))}</small></button>`).join("")}</div>`).join("") : (drugHits.length ? "" : '<p class="empty">Nothing matches. Try a shorter term, a drug class or an eponym.</p>')}</div>`;
    $("#main").scrollTop = 0;
    logView();
  }

  function render() { renderNav(); state.query.trim() ? renderSearch() : state.year === "drugs" ? renderDrugs() : state.year === "quiz" ? renderQuiz() : state.year === "progress" ? renderProgress() : state.year === "home" ? renderHome() : state.year === "mastered" ? renderMastered() : renderWeek(); }

  function openWeek(id, loKey) {
    const w = weeksById[id]; if (!w) return;
    if (w.hidden) { const pg = visibleWeek(id); return pg && pg !== w ? openWeek(pg.id, loKey) : undefined; }  // an old ICM week link
    state.year = w.year; state.week = id; state.query = ""; $("#q").value = "";
    if (loKey) state.filter = "All";
    store.set("last", id); noteSeen(id);
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    render();
    if (loKey) { const el = document.getElementById("lo-" + loKey); if (el) { el.classList.remove("closed", "reveal-hint"); el.scrollIntoView({ block: "start" }); el.classList.add("flash"); } }
  }

  /* ---------------- Editable notes ---------------- */
  // Your edits to any LO's notes: {loKey: [html | null, time, hash of the built-in note when edited]}; null = back to
  // the built-in note. Saved locally as you type; when synced, each edited note is its own private db document
  // ("note-<key>") and the state document carries an index {loKey: [time, hasText]} so other devices know what to fetch.
  let notesT = store.get("notes", {});
  const ED = { key: null, body: null, prev: null, changed: false, timer: null, range: null };
  for (const k in loByKey) { const lo = loByKey[k].lo; lo.html0 = lo.html; lo.plain0 = lo.plain; }
  const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const unesc = s => s.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'" }[k]));
  const textOf = h => unesc(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  function applyNote(key) {
    const h = loByKey[key]; if (!h) return;
    const lo = h.lo, e = notesT[key];
    lo.mine = !!e && e[0] != null;
    lo.html = lo.mine ? e[0] : lo.html0;
    lo.plain = lo.mine ? textOf(lo.html) : lo.plain0;
    lo.search = (lo.text + " " + lo.sessions.join(" ") + " " + lo.plain).toLowerCase();
  }
  for (const k in notesT) applyNote(k);
  function persistNote(key) { store.set("notes", notesT); applyNote(key); queueNotePush(key); }
  function noteIndex() { const o = {}; for (const k in notesT) o[k] = [notesT[k][1], notesT[k][0] == null ? 0 : 1]; return o; }
  function mineBar(lo) {
    const e = notesT[lo.key], stale = lo.html0 && e[2] !== hashStr(lo.html0);
    const msg = stale ? `<span class="stale">${e[2] === hashStr("") ? "Built-in notes have been added since you wrote yours." : "The built-in note has been updated since you edited it."}</span>` : `<span>${lo.html0 ? "Your edited version." : "Your own notes."}</span>`;
    return `<div class="mine">${msg}${lo.html0 ? `<button class="linkbtn" data-origtoggle>Show original</button>` : ""}<button class="linkbtn" data-restore="${lo.key}">${lo.html0 ? "Restore original" : "Delete my notes"}</button></div>`;
  }

  // Only the note markup the app itself uses survives a save or paste; anything else is unwrapped to its text.
  const ED_TAGS = { P: "p", BR: "br", UL: "ul", OL: "ol", LI: "li", STRONG: "strong", B: "strong", EM: "em", I: "em", SUB: "sub", SUP: "sup",
    H1: "h4", H2: "h4", H3: "h4", H4: "h4", H5: "h4", H6: "h4", TABLE: "table", THEAD: "thead", TBODY: "tbody", TFOOT: "tbody", TR: "tr", TH: "th", TD: "td", DIV: "div", SPAN: "span" };
  const ED_DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|IMG|PICTURE|VIDEO|AUDIO|CANVAS|META|LINK|TITLE|HEAD|TEMPLATE|NOSCRIPT|INPUT|BUTTON|SELECT|TEXTAREA|FORM|COLGROUP|COL|CAPTION)$/;
  const ED_CLASSES = { div: ["key", "tbl", "kv", "steps"], ul: ["cl"], span: ["paren"] };
  const ED_INLINE = new Set(["#text", "STRONG", "EM", "BR", "SUB", "SUP", "SPAN"]);
  function cleanNote(src) {
    const tpl = document.createElement("template"); tpl.innerHTML = src;
    const out = document.createElement("div");
    const brk = to => { if (to.lastChild && to.lastChild.nodeName !== "BR") to.appendChild(document.createElement("br")); };
    const walk = (from, to) => {
      for (const n of from.childNodes) {
        if (n.nodeType === 3) { if (!(/^(TABLE|THEAD|TBODY|TR|UL|OL)$/.test(to.nodeName) && !n.nodeValue.trim())) to.appendChild(document.createTextNode(n.nodeValue.replace(/\u00a0/g, " "))); continue; }
        if (n.nodeType !== 1 || ED_DROP.test(n.tagName)) continue;
        let tag = ED_TAGS[n.tagName];
        const st = n.style || {}, cls = (ED_CLASSES[tag] || []).filter(c => n.classList.contains(c));
        if (tag === "strong" && /^(normal|[1-5]00)$/.test(st.fontWeight)) tag = null;  // Google Docs wraps pastes in <b style="font-weight:normal">
        if (tag === "span" && !cls.length) {  // keep bold and italic that pastes set with inline styles
          let into = to;
          if (/^(bold|[6-9]00)$/.test(st.fontWeight)) into = into.appendChild(document.createElement("strong"));
          if (st.fontStyle === "italic") into = into.appendChild(document.createElement("em"));
          walk(n, into); continue;
        }
        if ((tag === "div" && !cls.length) || tag === "p") {  // paragraphs at the top level; line breaks inside cells, bullets and key points
          if (to !== out) { brk(to); walk(n, to); continue; }
          if (tag === "div" && [...n.children].some(c => /^(P|DIV|UL|OL|TABLE|H[1-6]|BLOCKQUOTE)$/.test(c.tagName))) { walk(n, to); continue; }
          tag = "p";
        }
        if (!tag) { walk(n, to); continue; }
        const el = document.createElement(tag);
        if (cls.length) el.className = cls.join(" ");
        if (tag === "th" && n.getAttribute("scope") === "row") el.setAttribute("scope", "row");
        if (tag === "td" || tag === "th") for (const a of ["colspan", "rowspan"]) { const v = parseInt(n.getAttribute(a), 10); if (v > 1 && v < 50) el.setAttribute(a, v); }
        walk(n, el); to.appendChild(el);
      }
    };
    walk(tpl.content, out);
    let p = null;  // loose text and inline runs at the top level go into paragraphs
    for (const n of [...out.childNodes]) {
      if (!ED_INLINE.has(n.nodeName)) { p = null; continue; }
      if (!p && n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); continue; }
      if (!p) { p = document.createElement("p"); n.before(p); }
      p.appendChild(n);
    }
    for (const t of out.querySelectorAll("table")) {
      const w = t.parentElement;
      if (!w.classList.contains("tbl")) { const d = document.createElement("div"); d.className = "tbl"; t.before(d); d.appendChild(t); }
      else for (const c of [...w.childNodes].reverse()) if (c !== t) w.after(c);
    }
    for (const l of out.querySelectorAll("ul > ul, ul > ol, ol > ul, ol > ol")) { const li = l.previousElementSibling; if (li && li.tagName === "LI") li.appendChild(l); }
    for (const x of [...out.querySelectorAll("p, li, h4, td, th, div.key")]) while (x.lastChild && x.lastChild.nodeName === "BR" && x.childNodes.length > 1) x.lastChild.remove();
    for (const x of [...out.querySelectorAll("strong, em, sub, sup, li, h4, p, div.key")].reverse()) if (!x.textContent.trim()) x.remove();
    for (const x of [...out.querySelectorAll("ul, ol, tr")].reverse()) if (!x.children.length) x.remove();
    for (const x of [...out.querySelectorAll("div.tbl")]) if (!x.querySelector("td, th")) x.remove();
    return out.innerHTML.trim();
  }
  function textToHTML(t) {
    const bullet = /^\s*[-•*–]\s+/;
    return t.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
      const runs = [];  // consecutive bullet lines become a list, other lines a paragraph
      for (const l of b.split("\n")) { const isB = bullet.test(l), last = runs[runs.length - 1]; if (last && last.b === isB) last.lines.push(l); else runs.push({ b: isB, lines: [l] }); }
      return runs.map(r => r.b ? "<ul>" + r.lines.map(l => "<li>" + esc(l.replace(bullet, "")) + "</li>").join("") + "</ul>" : "<p>" + r.lines.map(esc).join("<br>") + "</p>").join("");
    }).join("");
  }

  const ED_BTNS = [["bold", "<b>B</b>", "Bold (⌘B)"], ["italic", "<i>I</i>", "Italic (⌘I)"], ["list", "• List", "Bullet list"], ["h4", "Heading", "Subheading"], ["key", "Key point", "Highlighted key point"],
    ["table", "Table", "Insert a table"], ["row+", "+ Row", "Add a row below"], ["row-", "− Row", "Delete this row"], ["col+", "+ Column", "Add a column to the right"], ["col-", "− Column", "Delete this column"]];
  const ED_TOGGLES = new Set(["bold", "italic", "list", "h4", "key"]);
  function edBarHTML() {
    return ED_BTNS.map(([c, label, t]) => `<button type="button" data-ec="${c}" title="${t}" aria-label="${t}"${ED_TOGGLES.has(c) ? ' aria-pressed="false"' : ""}${/^(row|col)/.test(c) ? " hidden" : ""}>${label}</button>`).join("")
      + `<span class="ed-gap"></span><span class="ed-status" aria-live="polite"></span><button type="button" data-ec="cancel" title="Undo everything since you pressed Edit">Cancel</button><button type="button" data-ec="done" class="ed-done">Done</button>`;
  }
  const edEl = () => { const a = ED.key && document.getElementById("lo-" + ED.key); return a && a.querySelector(".lo-body[contenteditable]"); };
  const closestIn = (n, sel, root) => { const el = n && (n.nodeType === 1 ? n : n.parentElement), hit = el && el.closest(sel); return hit && hit !== root && root.contains(hit) ? hit : null; };
  function caretAt(el, end = true) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(!end); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function edStatus(t) { const s = ED.body && ED.body.parentElement && ED.body.parentElement.querySelector(".ed-status"); if (s) s.textContent = t; }
  function setEdBarTop() { const tb = $(".toolbar"); document.documentElement.style.setProperty("--edtop", (window.innerWidth > 860 && tb ? tb.offsetHeight : 0) + "px"); }
  function redrawCard(key, open) {
    const el = document.getElementById("lo-" + key), h = loByKey[key]; if (!el || !h) return null;
    const m = $("#main").scrollTop, y = window.scrollY, tmp = document.createElement("div");
    tmp.innerHTML = loCard(h.lo); const card = tmp.firstElementChild; el.replaceWith(card);
    if (open) { card.classList.remove("closed", "reveal-hint"); card.querySelector("[data-toggle]").setAttribute("aria-expanded", true); }
    $("#main").scrollTop = m; window.scrollTo(0, y);
    return card;
  }

  function startEdit(key) {
    if (ED.key === key && ED.body) { ED.body.focus(); return; }
    if (ED.key) finishEdit(false);
    if (!loByKey[key]) return;
    Object.assign(ED, { key, prev: notesT[key] ? notesT[key].slice() : null, changed: false, range: null, timer: null });
    redrawCard(key);
    const body = edEl(); if (!body) { ED.key = null; return; }
    ED.body = body;
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch {}
    let end = body.lastElementChild;  // start typing in a fresh line after a final table or key point
    if (!end || !/^(P|H4|UL|OL)$/.test(end.tagName)) { end = document.createElement("p"); end.innerHTML = "<br>"; body.appendChild(end); }
    body.focus({ preventScroll: true }); caretAt(end);
    setEdBarTop(); edState();
  }
  function saveEdit() {
    clearTimeout(ED.timer); ED.timer = null;
    if (!ED.key || !ED.body) return;
    const key = ED.key, lo = loByKey[key].lo, html = cleanNote(ED.body.innerHTML);
    if (html.length > 200000) { edStatus("Too long to save: trim it down"); return; }
    const next = html === (lo.html0 ? cleanNote(lo.html0) : "") ? null : html;  // back to the built-in text = no personal copy
    const cur = notesT[key];
    if ((cur ? cur[0] : null) !== next) { notesT[key] = [next, nowS(), hashStr(lo.html0 || "")]; ED.changed = true; persistNote(key); }
    edStatus("Saved");
  }
  function finishEdit(cancel) {
    if (!ED.key) return;
    const key = ED.key, lo = loByKey[key].lo;
    if (!cancel) saveEdit();
    else {
      clearTimeout(ED.timer); ED.timer = null;
      if (ED.changed) { const p = ED.prev; notesT[key] = [p ? p[0] : null, nowS(), p ? p[2] : hashStr(lo.html0 || "")]; persistNote(key); }
    }
    Object.assign(ED, { key: null, body: null, prev: null, range: null });
    const card = redrawCard(key, true);
    if (card) card.querySelector(".edit-btn").focus({ preventScroll: true });
  }
  // After any render: keep editing if the card is still on screen, otherwise save and stop.
  function edCheck() {
    if (!ED.key) return;
    const b = edEl();
    if (b) { ED.body = b; setEdBarTop(); edState(); return; }
    if (ED.timer) saveEdit();
    Object.assign(ED, { key: null, body: null, prev: null, range: null });
  }
  function edInput() { clearTimeout(ED.timer); ED.timer = setTimeout(saveEdit, 300); edStatus("Saving…"); }
  function edState() {
    const body = ED.body, bar = body && body.previousElementSibling; if (!bar || !bar.classList.contains("ed-bar")) return;
    const s = getSelection(), n = s.rangeCount && body.contains(s.anchorNode) ? s.anchorNode : null;
    const inT = !!closestIn(n, "td, th", body);
    let bold = false, italic = false; try { bold = !!n && document.queryCommandState("bold"); italic = !!n && document.queryCommandState("italic"); } catch {}
    const on = { bold, italic, list: !!closestIn(n, "li", body), h4: !!closestIn(n, "h4", body), key: !!closestIn(n, ".key", body) };
    for (const b of bar.querySelectorAll("[data-ec]")) {
      const c = b.dataset.ec;
      if (c in on) b.setAttribute("aria-pressed", on[c]);
      if (c === "table") b.hidden = inT; else if (/^(row|col)/.test(c)) b.hidden = !inT;
    }
  }
  // The top-level block (direct child of the editor) holding the caret; loose text gets wrapped in a paragraph first.
  function topBlock(body) {
    const s = getSelection(); if (!s.rangeCount || !body.contains(s.anchorNode)) return null;
    let n = s.anchorNode; if (n === body) n = body.childNodes[Math.min(s.anchorOffset, body.childNodes.length - 1)] || null;
    while (n && n.parentNode !== body) n = n.parentNode;
    if (n && (n.nodeType === 3 || ED_INLINE.has(n.nodeName))) { const p = document.createElement("p"); n.before(p); p.appendChild(n); return p; }
    return n;
  }
  // Block changes move the existing text nodes, so the caret can stay where it was.
  function keepCaret(fn) {
    const s = getSelection(), node = s.rangeCount ? s.anchorNode : null, off = s.anchorOffset;
    fn();
    if (node && node.isConnected && ED.body.contains(node) && node !== ED.body) { const r = document.createRange(); r.setStart(node, Math.min(off, node.nodeType === 3 ? node.length : node.childNodes.length)); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
  }
  const fill = el => { if (!el.textContent && !el.querySelector("br")) el.innerHTML = "<br>"; return el; };
  function toggleKey(body) {
    const s = getSelection(), k = s.rangeCount && closestIn(s.anchorNode, ".key", body);
    if (k) {
      if ([...k.children].some(c => /^(UL|OL|P|TABLE)$/.test(c.tagName))) { const last = k.lastElementChild; k.replaceWith(...k.childNodes); if (last) caretAt(last); return; }
      const p = document.createElement("p"); p.append(...k.childNodes); k.replaceWith(fill(p)); caretAt(p); return;
    }
    const blk = topBlock(body), d = document.createElement("div"); d.className = "key";
    if (blk && /^(P|H4)$/.test(blk.tagName)) { d.append(...blk.childNodes); blk.replaceWith(fill(d)); }
    else { fill(d); if (blk) blk.after(d); else body.appendChild(d); }
    caretAt(d);
  }
  function toggleHeading(body) {
    const h = closestIn(getSelection().anchorNode, "h4", body), blk = h || topBlock(body);
    if (!blk || (!h && blk.tagName !== "P")) return;
    const el = document.createElement(h ? "p" : "h4"); el.append(...blk.childNodes); blk.replaceWith(fill(el)); caretAt(el);
  }
  function toggleList(body) {
    const n = getSelection().anchorNode, li = closestIn(n, "li", body);
    if (li) {  // back to a paragraph, splitting the list around it
      const list = li.parentElement, items = [...list.children], subs = [...li.children].filter(c => /^(UL|OL)$/.test(c.tagName));
      subs.forEach(c => c.remove());
      const p = document.createElement("p"); p.append(...li.childNodes); fill(p);
      const rest = document.createElement(list.tagName); if (list.className) rest.className = list.className;
      subs.forEach(c => rest.append(...c.children)); rest.append(...items.slice(items.indexOf(li) + 1));
      li.remove(); list.after(p); if (rest.children.length) p.after(rest); if (!list.children.length) list.remove();
      caretAt(p); return;
    }
    const box = closestIn(n, "td, th, .key", body);
    if (box) {  // each line of a cell or key point becomes a bullet
      const lines = [[]]; for (const c of [...box.childNodes]) { if (c.nodeName === "BR") lines.push([]); else lines[lines.length - 1].push(c); }
      const ul = document.createElement("ul"); ul.className = "cl";
      for (const l of lines) if (l.some(c => c.textContent.trim())) { const it = document.createElement("li"); it.append(...l); ul.appendChild(it); }
      if (!ul.children.length) ul.innerHTML = "<li><br></li>";
      box.replaceChildren(ul); caretAt(ul.lastElementChild); return;
    }
    const blk = topBlock(body); if (!blk) return;
    let ul = document.createElement("ul"); const it = document.createElement("li");
    if (/^(P|H4)$/.test(blk.tagName)) { it.append(...blk.childNodes); blk.replaceWith(ul); } else blk.after(ul);
    ul.appendChild(fill(it));
    const prev = ul.previousElementSibling, next = ul.nextElementSibling;
    if (prev && prev.tagName === "UL") { prev.append(...ul.children); ul.remove(); ul = prev; }
    if (next && next.tagName === "UL") { ul.append(...next.children); next.remove(); }
    caretAt(it);
  }
  function indentItem(li, out) {
    if (!out) {
      const prev = li.previousElementSibling; if (!prev) return;
      let sub = prev.lastElementChild; if (!sub || !/^(UL|OL)$/.test(sub.tagName)) sub = prev.appendChild(document.createElement(li.parentElement.tagName));
      sub.appendChild(li); return;
    }
    const list = li.parentElement, parent = list.parentElement.closest("li"); if (!parent || !ED.body.contains(parent)) return;
    const after = [...list.children].slice([...list.children].indexOf(li) + 1);
    if (after.length) { const sub = document.createElement(list.tagName); sub.append(...after); li.appendChild(sub); }
    parent.after(li); if (!list.children.length) list.remove();
  }
  function insertTable(body) {
    const blk = topBlock(body), w = document.createElement("div"); w.className = "tbl";
    const row = tag => `<tr><${tag}><br></${tag}><${tag}><br></${tag}></tr>`;
    w.innerHTML = `<table><thead>${row("th")}</thead><tbody>${row("td")}${row("td")}</tbody></table>`;
    if (blk && blk.nodeName === "P" && !blk.textContent.trim()) blk.replaceWith(w); else if (blk) blk.after(w); else body.appendChild(w);
    if (!w.nextElementSibling) { const p = document.createElement("p"); p.innerHTML = "<br>"; w.after(p); }  // somewhere to keep typing below
    caretAt(w.querySelector("th"));
  }
  const colOf = cell => { let i = 0; for (const c of cell.parentElement.cells) { if (c === cell) return i; i += c.colSpan; } return i; };
  const cellAt = (tr, i) => { let a = 0; for (const c of tr.cells) { if (i < a + c.colSpan) return c; a += c.colSpan; } return tr.cells[tr.cells.length - 1]; };
  function tableEdit(cmd, body) {
    const s = getSelection(), cell = s.rangeCount && closestIn(s.anchorNode, "td, th", body); if (!cell) return;
    const tr = cell.parentElement, table = cell.closest("table"), wrap = table.closest(".tbl") || table, ci = colOf(cell);
    const empty = () => { const after = wrap.nextElementSibling || wrap.previousElementSibling; wrap.remove(); if (after) caretAt(after); else { body.innerHTML = "<p><br></p>"; caretAt(body.firstChild); } };
    if (cmd === "row+") {
      const head = tr.parentElement.tagName === "THEAD", r = document.createElement("tr");
      for (const c of tr.cells) { const n = document.createElement(head ? "td" : c.tagName); if (!head && c.getAttribute("scope")) n.setAttribute("scope", "row"); if (c.colSpan > 1) n.colSpan = c.colSpan; n.innerHTML = "<br>"; r.appendChild(n); }
      if (head) { let tb = table.tBodies[0]; if (!tb) tb = table.appendChild(document.createElement("tbody")); tb.prepend(r); } else tr.after(r);
      caretAt(r.cells[0]);
    } else if (cmd === "row-") {
      const next = tr.nextElementSibling || tr.previousElementSibling; tr.remove();
      if (!table.querySelector("td, th")) return empty();
      caretAt((next || table.querySelector("tr")).cells[0] || table.querySelector("td, th"));
    } else if (cmd === "col+") {
      for (const r of table.rows) {
        const c = cellAt(r, ci); if (!c) continue;
        if (c.colSpan > 1) { c.colSpan++; continue; }
        const n = document.createElement(r.parentElement.tagName === "THEAD" ? "th" : "td"); n.innerHTML = "<br>"; c.after(n);
      }
      const n = cellAt(tr, ci + 1); if (n) caretAt(n);
    } else if (cmd === "col-") {
      for (const r of [...table.rows]) {
        const c = cellAt(r, ci); if (!c) continue;
        if (c.colSpan > 1) c.colSpan--; else c.remove();
        if (!r.cells.length) r.remove();
      }
      if (!table.querySelector("td, th")) return empty();
      const n = cellAt(tr.isConnected ? tr : table.rows[0], Math.max(0, ci - 1)); if (n) caretAt(n);
    }
  }
  function edCmd(cmd) {
    const body = ED.body; if (!body) return;
    if (cmd === "done") return finishEdit(false);
    if (cmd === "cancel") return finishEdit(true);
    if (document.activeElement !== body) { body.focus({ preventScroll: true }); if (ED.range && body.contains(ED.range.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(ED.range); } else caretAt(body); }
    if (cmd === "bold" || cmd === "italic") document.execCommand(cmd);
    else if (cmd === "list") keepCaret(() => toggleList(body));
    else if (cmd === "h4") keepCaret(() => toggleHeading(body));
    else if (cmd === "key") keepCaret(() => toggleKey(body));
    else if (cmd === "table") insertTable(body);
    else tableEdit(cmd, body);
    edInput(); edState();
  }
  function edKey(e) {
    const body = ED.body, s = getSelection(), n = s.rangeCount ? s.anchorNode : null, mod = (e.metaKey || e.ctrlKey) && !e.altKey;
    if (e.key === "Escape" || (mod && e.key === "Enter")) { e.preventDefault(); finishEdit(false); return; }
    if (mod && /^[bis]$/i.test(e.key)) {
      e.preventDefault();
      if (/s/i.test(e.key)) saveEdit(); else { document.execCommand(/b/i.test(e.key) ? "bold" : "italic"); edInput(); edState(); }
      return;
    }
    if (e.key === "Tab") {
      const cell = closestIn(n, "td, th", body);
      if (cell) {
        e.preventDefault();
        const cells = [...cell.closest("table").querySelectorAll("th, td")], i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
        if (i >= cells.length) { tableEdit("row+", body); edInput(); } else if (i >= 0) caretAt(cells[i]);
        return;
      }
      const li = closestIn(n, "li", body);
      if (li) { e.preventDefault(); keepCaret(() => indentItem(li, e.shiftKey)); edInput(); edState(); }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {  // Enter on an empty bullet steps out a level; on an empty key point it leaves it
      const li = closestIn(n, "li", body);
      if (li && !li.textContent.trim() && ![...li.children].some(c => /^(UL|OL)$/.test(c.tagName))) {
        e.preventDefault();
        const parent = li.parentElement.parentElement.closest("li");
        if (parent && body.contains(parent)) keepCaret(() => indentItem(li, true)); else toggleList(body);
        edInput(); edState(); return;
      }
      const k = closestIn(n, ".key", body);
      if (k && !k.textContent.trim() && !closestIn(n, "li", body)) { e.preventDefault(); const p = document.createElement("p"); p.innerHTML = "<br>"; k.replaceWith(p); caretAt(p); edInput(); edState(); }
    }
  }
  function edPaste(e) {
    const cd = e.clipboardData; if (!cd) return;
    e.preventDefault();
    const h = cd.getData("text/html");
    let html = h ? cleanNote(h) : textToHTML(cd.getData("text/plain") || "");
    if (!html) return;
    const one = html.match(/^<p>((?:(?!<\/?p>).)*)<\/p>$/s); if (one) html = one[1];  // a single line pastes inline
    document.execCommand("insertHTML", false, html);
    edInput();
  }
  function restoreClick(b) {
    const k = b.dataset.restore;
    if (b.classList.contains("armed")) { notesT[k] = [null, nowS(), hashStr(loByKey[k].lo.html0 || "")]; persistNote(k); redrawCard(k, true); return; }
    const label = b.textContent; b.classList.add("armed"); b.textContent = "Tap again to confirm";
    setTimeout(() => { if (b.isConnected) { b.classList.remove("armed"); b.textContent = label; } }, 3500);
  }
  function editClick(e) {
    const ed = e.target.closest("[data-edit]"); if (ed) { startEdit(ed.dataset.edit); return true; }
    const ec = e.target.closest("[data-ec]"); if (ec) { edCmd(ec.dataset.ec); return true; }
    const ot = e.target.closest("[data-origtoggle]"); if (ot) { const on = ot.closest(".lo").classList.toggle("show-orig"); ot.textContent = on ? "Show mine" : "Show original"; return true; }
    const rs = e.target.closest("[data-restore]"); if (rs) { restoreClick(rs); return true; }
    return false;
  }
  const inEditor = e => ED.body && ED.body.contains(e.target);
  document.addEventListener("mousedown", e => { if (e.target.closest(".ed-bar button")) e.preventDefault(); });  // keep the caret in the note
  document.addEventListener("input", e => { if (inEditor(e)) edInput(); });
  document.addEventListener("keydown", e => { if (inEditor(e)) edKey(e); });
  document.addEventListener("paste", e => { if (inEditor(e)) edPaste(e); });
  document.addEventListener("selectionchange", () => {
    if (!ED.body) return;
    const s = getSelection(); if (s.rangeCount && ED.body.contains(s.anchorNode)) { ED.range = s.getRangeAt(0).cloneRange(); edState(); }
  });
  window.addEventListener("pagehide", () => { if (ED.timer) saveEdit(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && ED.timer) saveEdit(); });
  window.addEventListener("resize", () => { if (ED.key) setEdBarTop(); });

  /* ---------------- Quiz ---------------- */
  // Question pool: authored short answers, key numbers and ladders from DATA.quiz, plus drug drills generated
  // from the drug list. Progress is a Leitner schedule per question (srs), stored locally and, when the page
  // runs inside claude.ai, mirrored to the viewer's private db documents (merge by per-entry timestamp).
  const QZ = DATA.quiz || { sa: [], num: [], lad: [] };
  const INTERVALS = [0, 1, 3, 7, 16, 35];
  const dayNum = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pickN = (a, n) => shuffle(a.slice()).slice(0, Math.max(0, n));
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const lc1 = s => s.replace(/^([A-Z])(?=[a-z]+\b(?!['’]))/, c => c.toLowerCase());  // keeps eponyms (Parkinson's)

  let srs = store.get("srs", {});
  let meta = Object.assign({ daily: { last: 0, streak: 0, best: 0 }, adaily: { last: 0, streak: 0, best: 0 }, idaily: { last: 0, streak: 0, best: 0 }, sprintBest: 0, t: 0 }, store.get("qmeta", {}));
  let qcfg = Object.assign({ scope: "all", weeks: [], systems: [], cats: [], fams: ["sa", "num", "list", "lad", "drug"], n: 20, dueN: 20 }, store.get("qcfg", {}));
  let acfg = Object.assign({ scope: "all", weeks: [], cats: [], fams: ["sa", "num", "list", "lad"], n: 20 }, store.get("acfg", {}));
  if (acfg.regions && !acfg.cats.length) acfg.cats = acfg.regions; if (acfg.scope === "regions") acfg.scope = "cats";
  let icfg = Object.assign({ scope: "all", weeks: [], cats: [], fams: ["sa", "num", "list", "lad"], n: 20 }, store.get("icfg", {}));
  for (const c of [qcfg, icfg]) c.weeks = c.weeks.filter(id => weeksById[id] && !weeksById[id].hidden);  // saved ICM weeks (now system pages) drop out
  for (const c of [qcfg, acfg, icfg]) if (!c.listV) { if (!c.fams.includes("list")) c.fams.push("list"); c.listV = 1; }  // full-list questions came later
  for (const c of [qcfg, acfg, icfg]) { if (!Array.isArray(c.status)) c.status = c.learning ? ["learning"] : []; delete c.learning; }  // review filter (was "Learning only")
  const GCFG = { anat: acfg, icm: icfg };
  let xcfg = Object.assign({ exams: [], fams: ["sa", "num", "list", "lad"], n: 20, status: [] }, store.get("xcfg", {}));
  function saveSrs() { store.set("srs", srs); schedulePush("srs"); updateProgressUI(); }
  function saveMeta() { meta.t = nowS(); store.set("qmeta", meta); schedulePush("state"); }

  /* ----- Account sync (db + user capabilities) ----- */
  const sync = { db: null, uid: null, mode: "local", busy: {}, again: {}, timers: {}, lastPull: 0, retried: false, noteQ: new Set() };
  function queueNotePush(key) { if (sync.mode !== "synced") return; sync.noteQ.add(key); schedulePush("notes"); }
  const docRef = name => sync.db.doc("data/users/" + sync.uid + "/" + name);
  function mergeMap(local, remote, ti) {
    let localChanged = false, remoteBehind = false;
    for (const k in remote) { const r = remote[k]; if (!Array.isArray(r)) continue; if (!local[k] || r[ti] > local[k][ti]) { local[k] = r.slice(); localChanged = true; } }
    for (const k in local) if (!remote[k] || local[k][ti] > remote[k][ti]) remoteBehind = true;
    return { localChanged, remoteBehind };
  }
  async function pull() {
    sync.lastPull = Date.now();
    const [s, r] = await Promise.all([docRef("state").get(), docRef("srs").get()]);
    const sd = s.exists ? s.data() : {}, rd = r.exists ? r.data() : {};
    const a = mergeMap(confT, sd.conf || {}, 1), b = mergeMap(srs, rd.items || {}, 4);
    let metaChanged = false, metaBehind = !sd.meta;
    if (sd.meta) {
      const rm = sd.meta, rt = rm.t || 0;
      if (rt > meta.t) { meta.daily = Object.assign({}, meta.daily, rm.daily || {}); meta.adaily = Object.assign({}, meta.adaily, rm.adaily || {}); meta.idaily = Object.assign({}, meta.idaily, rm.idaily || {}); meta.t = rt; metaChanged = true; }
      else if (meta.t > rt) metaBehind = true;
      const best = Math.max(meta.sprintBest || 0, rm.sprintBest || 0);
      if (best > (meta.sprintBest || 0)) { meta.sprintBest = best; metaChanged = true; }
      if (best > (rm.sprintBest || 0)) metaBehind = true;
    }
    const ni = sd.notes || {}, want = Object.keys(ni).filter(k => loByKey[k] && Array.isArray(ni[k]) && k !== ED.key && (!notesT[k] || ni[k][0] > notesT[k][1]));
    let notesChanged = false;
    for (let i = 0; i < want.length; i += 8) await Promise.all(want.slice(i, i + 8).map(async k => {
      const r = ni[k];
      if (!r[1]) { notesT[k] = [null, r[0], notesT[k] ? notesT[k][2] : ""]; notesChanged = true; return; }
      const d = await docRef("note-" + k).get(); if (!d.exists) return;
      const x = d.data() || {};
      if (typeof x.html === "string" && (!notesT[k] || x.t > notesT[k][1])) { notesT[k] = [cleanNote(x.html), x.t, x.base || ""]; notesChanged = true; }
    }));
    for (const k in notesT) if (!ni[k] || notesT[k][1] > ni[k][0]) sync.noteQ.add(k);
    if (notesChanged) { store.set("notes", notesT); for (const k of want) applyNote(k); }
    if (sync.noteQ.size) schedulePush("notes", 300);
    const ac = mergeMap(accT, sd.acc || {}, 1);
    if (ac.localChanged) store.set("accepted", accT);
    if (ac.remoteBehind) schedulePush("state", 300);
    const pk = mergeMap(pickT, sd.picks || {}, 1);
    if (pk.localChanged) store.set("picks", pickT);
    if (pk.remoteBehind) schedulePush("state", 300);
    if (a.localChanged) { rebuildConf(); store.set("conf", confT); }
    if (b.localChanged) store.set("srs", srs);
    if (metaChanged) store.set("qmeta", meta);
    if (a.remoteBehind || metaBehind) schedulePush("state", 300);
    if (b.remoteBehind) schedulePush("srs", 300);
    return a.localChanged || b.localChanged || metaChanged || notesChanged || ac.localChanged;
  }
  function schedulePush(name, delay = 1500) {
    if (sync.mode !== "synced") return;
    clearTimeout(sync.timers[name]);
    sync.timers[name] = setTimeout(() => push(name), delay);
  }
  async function push(name, retry) {
    if (sync.busy[name]) { sync.again[name] = true; return; }
    sync.busy[name] = true;
    try {
      if (name === "notes") {  // each edited note is its own document; the index in the state document follows
        for (const k of [...sync.noteQ]) { const e = notesT[k]; if (e) await docRef("note-" + k).set({ v: 1, html: e[0], t: e[1], base: e[2] }); sync.noteQ.delete(k); }
        schedulePush("state", 200);
      } else await docRef(name).set(name === "srs" ? { v: 1, items: srs } : { v: 1, conf: confT, meta, notes: noteIndex(), acc: accT, picks: pickT });
    }
    catch (e) {
      const code = e && e.code;
      if (code === "unavailable" && !retry) { sync.busy[name] = false; setTimeout(() => push(name, true), 1500 + Math.random() * 2000); return; }
      if (code !== "unavailable") { sync.mode = code === "quota_exceeded" ? "full" : "local"; updateSyncNote(); }
    }
    sync.busy[name] = false;
    if (sync.again[name]) { sync.again[name] = false; schedulePush(name, 400); }
  }
  async function initSync() {
    if (!(window.claude && typeof window.claude.use === "function")) { autoRateAll(); return; }
    sync.mode = "connecting"; updateSyncNote();
    try {
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      const uid = user ? await user.id() : null;
      if (!db || !uid) { sync.mode = "local"; updateSyncNote(); autoRateAll(); return; }
      sync.db = db; sync.uid = uid; sync.mode = "synced";
      const pulled = await pull();
      if (autoRateAll().length || pulled) refreshAfterSync();
    } catch (e) {
      sync.mode = "local"; autoRateAll();
      if (!sync.retried) { sync.retried = true; setTimeout(initSync, 3000); }
    }
    updateSyncNote();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || sync.mode !== "synced" || Date.now() - sync.lastPull < 30000) return;
    pull().then(c => { if (autoRateAll().length || c) refreshAfterSync(); }).catch(() => {});
  });
  function refreshAfterSync() {
    updateProgressUI();
    if (state.query.trim() || state.year === "drugs" || ED.key) return;
    if (state.year === "quiz") { renderNav(); if (state.qscreen !== "session" || !QS || QS.done) renderQuiz(); return; }
    const m = $("#main").scrollTop, y = window.scrollY; render(); $("#main").scrollTop = m; window.scrollTo(0, y);
  }
  function syncNote() {
    const m = sync.mode;
    const txt = { synced: "Progress syncs to your Claude account, so it follows you between devices.", connecting: "Connecting to your account…", local: window.GEMREV_APP === "windows" ? "Progress is saved on this PC." : window.GEMREV_APP ? "Progress is saved on this Mac." : "Progress is saved in this browser.", full: "Sync paused: account storage is full. Progress is still saved in this browser." }[m];
    return `<p class="sync${m === "synced" ? " on" : ""}" id="sync-note"><i></i>${txt}</p>`;
  }
  function updateSyncNote() { const el = $("#sync-note"); if (el) el.outerHTML = syncNote(); }

  /* ----- Answer matching ----- */
  const GREEK = { "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "κ": "kappa", "μ": "micro" };
  const SMALL = "₀₁₂₃₄₅₆₇₈₉", SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  // Lower-case, strip accents and punctuation, fold British/American spellings (both sides get the same treatment).
  function norm(s) {
    s = String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/[αβγδκμ]/g, c => GREEK[c]).replace(/[₀-₉]/g, c => SMALL.indexOf(c)).replace(/[⁰¹²³⁴-⁹]/g, c => SUP.indexOf(c));
    s = s.replace(/[⁺⁻]/g, "").replace(/&/g, " and ").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/['’`]/g, "");
    s = s.replace(/[^a-z0-9.]+/g, " ").replace(/\.(?!\d)|(?<!\d)\./g, " ");
    s = s.replace(/ae/g, "e").replace(/oe/g, "e").replace(/sulph/g, "sulf").replace(/tumour/g, "tumor");
    s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, w => WORDNUM[w]);
    return s.replace(/\s+/g, " ").trim();
  }
  const joinLD = s => s.replace(/([a-z]) (?=\d)/g, "$1");  // "beta 2" ↔ "beta2"
  function parseAns(a) { const s = norm(a); return { s, toks: s ? s.split(" ") : [], nums: (s.match(/\d+(?:\.\d+)?/g) || []).map(Number) }; }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = []; for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let lo = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < lo) lo = cur[j]; }
      if (lo > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // Close spelling: same first three letters (so abduction/adduction, afferent/efferent never match), no hypo/hyper or
  // intra/inter swap, and 1 edit from 7 letters or 2 from 10.
  function near(a, b) {
    if (a === b) return true;
    const n = Math.min(a.length, b.length), tol = n >= 10 ? 2 : n >= 7 ? 1 : 0;
    if (!tol || a.slice(0, 3) !== b.slice(0, 3)) return false;
    const sw = (x, y, p, q) => (x.startsWith(p) && y.startsWith(q)) || (x.startsWith(q) && y.startsWith(p));
    if (sw(a, b, "hypo", "hyper") || sw(a, b, "intra", "inter")) return false;
    return lev(a, b, tol) <= tol;
  }
  function altMatch(alt, A) {
    if (!alt) return false;
    if (/^\d+(\.\d+)?$/.test(alt)) return A.nums.includes(Number(alt));
    const pad = " " + A.s + " ";
    if (pad.includes(" " + alt + " ")) return true;
    if (alt.length <= 3) return /^[a-z]{2,3}$/.test(alt) && pad.includes(" " + alt + "s ");  // short ones: whole word, or its plural
    if (pad.includes(" " + alt) || (alt.length >= 8 && A.s.includes(alt))) return true;
    const k = alt.split(" ").length;
    for (let i = 0; i + k <= A.toks.length; i++) {
      const win = A.toks.slice(i, i + k).join(" ");
      if (near(alt, win) || (win.length > alt.length && near(alt, win.slice(0, alt.length)))) return true;
    }
    return false;
  }
  // "a / b + c" = (a or b) and c
  const gradeSA = (ans, acc) => {
    const A = parseAns(ans), AJ = parseAns(joinLD(A.s));
    return !!A.s && acc.split(" + ").every(g => g.split(" / ").some(alt => { const n = norm(alt); return altMatch(n, A) || altMatch(joinLD(n), AJ); }));
  };
  const gradeNum = (ans, nums) => { const A = parseAns(ans); return nums.every(n => A.nums.includes(Number(n))); };

  // Drug answers are matched on key words after mapping synonyms to one token (spellings already folded by norm).
  const CANON = [
    [/\b(heart|cardiac) failure\b|\bhfref\b|\bhfpef\b|\bccf\b/g, "hf"], [/\b(heart|av|atrioventricular) block\b/g, "heartblock"],
    [/\b(face|facial|lip|lips|tongue|throat) swell\w*/g, "angioedema"],
    [/\b(renal|kidney|kidneys|nephro\w*|aki|ckd|egfr|crcl|creatinine)\b/g, "kidney"], [/\b(liver|hepatic|hepato\w*|hepatitis|cirrhosis)\b/g, "liver"],
    [/\b(low|reduced) (blood pressure|bp)\b|\bhypotensi\w*/g, "hypotension"], [/\b(high|raised|increased) (blood pressure|bp)\b|\bhypertensi\w*/g, "hypertension"],
    [/\b(high|raised|increased) (potassium|k)\b|\bhyperkal\w*/g, "hyperkalemia"], [/\b(low|reduced) (potassium|k)\b|\bhypokal\w*/g, "hypokalemia"],
    [/\b(low|reduced) (sodium|na)\b|\bhyponat\w*/g, "hyponatremia"],
    [/\b(low|reduced) (blood )?(sugar|glucose)\b|\bhypoglyc\w*/g, "hypoglycemia"], [/\b(high|raised) (blood )?(sugar|glucose)\b|\bhyperglyc\w*/g, "hyperglycemia"],
    [/\b(low|reduced) calcium\b|\bhypocalc\w*/g, "hypocalcemia"], [/\b(high|raised) calcium\b|\bhypercalc\w*/g, "hypercalcemia"],
    [/\b(low|reduced) magnesium\b|\bhypomag\w*/g, "hypomagnesemia"],
    [/\b(slow|low) (heart rate|heart|pulse|hr)\b|\bbradycard\w*/g, "bradycardia"], [/\b(fast|racing) (heart rate|heart|pulse)\b|\btachycard\w*/g, "tachycardia"],
    [/\bbleed\w*|\bhemorrhag\w*/g, "bleeding"], [/\bpregnan\w*|\bteratogen\w*|\bfetotox\w*|\bbirth defects?\b/g, "pregnancy"],
    [/\bbreast ?feed\w*|\blactat(ion|ing)\b/g, "breastfeeding"], [/\basthma\w*|\bbronchospasm\w*/g, "asthma"], [/\bemphysema\b|\bchronic bronchitis\b/g, "copd"],
    [/\bepilep\w*|\bseizures?\b|\bfits?\b|\bconvuls\w*/g, "seizure"], [/\bstomach\b|\bgastric\b|\bgastro ?intestinal\b|\bgut\b/g, "gi"], [/\bpeptic\b|\bulcers?\b|\bulceration\b/g, "ulcer"],
    [/\b(low|reduced) platelets?\b|\bthrombocytopeni\w*/g, "thrombocytopenia"],
    [/\b(low|reduced) (white cells?|white blood cells?|white count|neutrophils?|wcc)\b|\bneutropeni\w*|\bagranulocyt\w*|\bleu[ck]openi\w*/g, "neutropenia"],
    [/\b(bone )?marrow (suppression|failure)\b|\bmyelosuppress\w*|\bpancytopeni\w*|\baplastic\b/g, "marrow"],
    [/\b(long|prolonged) qtc?\b|\bqtc? prolong\w*|\bqtc\b/g, "qt"], [/\bweight gain\b/g, "weightgain"], [/\bweight loss\b/g, "weightloss"],
    [/\bstevens johnson\b|\bsjs\b|\btoxic epidermal\b/g, "sjs"], [/\bc diff\w*|\bclostridi\w*/g, "cdiff"],
    [/\b(ankle )?swelling\b|\bswollen ankles?\b|\bedema\b/g, "edema"], [/\bheadaches?\b/g, "headache"],
    [/\bnausea\w*|\bvomit\w*|\bfeeling sick\b|\bsickness\b/g, "nausea"], [/\bdiarrh\w*|\bloose stools?\b/g, "diarrhea"], [/\bconstipat\w*/g, "constipation"],
    [/\bdrows\w*|\bsedat\w*|\bsleep(y|iness)\b|\bsomnolen\w*/g, "sedation"], [/\bdizz\w*|\blight ?headed\w*/g, "dizziness"], [/\brash\w*/g, "rash"],
    [/\bphotosensitiv\w*|\bsun ?(sensitiv\w*|burn\w*)/g, "photosensitivity"], [/\bototox\w*|\bdeaf\w*|\bhearing loss\b|\btinnitus\b/g, "ototoxicity"],
    [/\btend[oi]n\w*/g, "tendon"], [/\bconfus\w*|\bdelirium\b/g, "confusion"], [/\bhyperthyroid\w*|\bthyrotox\w*/g, "hyperthyroid"], [/\bhypothyroid\w*/g, "hypothyroid"],
    [/\bmyasthen\w*/g, "myasthenia"], [/\b(urinary )?retention\b/g, "retention"], [/\bneuropath\w*/g, "neuropathy"], [/\blactic acidosis\b/g, "lacticacidosis"],
    [/\bketoacidosis\b|\bdka\b/g, "dka"], [/\bpancreatit\w*/g, "pancreatitis"], [/\bhypersensitiv\w*|\ballerg\w*|\banaphyla\w*/g, "allergy"],
    [/\bfalls?\b/g, "falls"], [/\bcough\w*/g, "cough"], [/\bgout\w*/g, "gout"], [/\bporphyri\w*/g, "porphyria"], [/\bglaucoma\w*/g, "glaucoma"],
    [/\bosteoporo\w*|\bbone (loss|thinning|density)\b/g, "osteoporosis"], [/\bfractures?\b/g, "fracture"], [/\binfections?\b|\binfective\b/g, "infection"],
    [/\bdehydrat\w*|\bhypovolem\w*|\bvolume deplet\w*/g, "dehydration"], [/\belderly\b|\bolder (people|adults|patients)\b|\bold age\b/g, "elderly"],
    [/\b(under|younger than|below|less than) (16|18|25)s?\b|\byoung (people|adults?|person)\b|\badolescen\w*|\bteenage\w*/g, "young"],
    [/\bchildren\b|\bchild\b|\bpediatric\b/g, "children"]
  ];
  const STOP = new Set("the and for from with without into than then that this these those its are was were been not any all can may might will also via due use used using cause causes caused risk history previous prior known severe acute chronic disease diseases disorder disorders failure impairment dysfunction problem problems condition conditions syndrome high low raised reduced increased decreased rare common mild moderate significant active current recent patient patients people person under over age aged years year drug drugs medicine medicines therapy treatment effect effects side main other others type some such who which when where what why how both each only even must should level levels function more less very".split(" "));
  const SHORT_OK = new Set(["gi", "hf", "mi", "ra", "af", "qt", "pe", "tb", "ms", "uc"]);
  function keyToks(s) {
    let t = " " + norm(s) + " ";
    for (const [re, rep] of CANON) t = t.replace(re, " " + rep + " ");
    return [...new Set(t.split(" ").filter(w => w && !STOP.has(w) && (w.length >= 3 || SHORT_OK.has(w))))];
  }
  const overlap = (a, b) => { for (const x of a) for (const y of b) if (near(x, y)) return true; return false; };
  function gradeList(ans, items) {
    const A = keyToks(ans); let best = -1, score = 0;
    items.forEach((it, i) => { const sc = A.filter(a => keyToks(it).some(b => near(a, b))).length; if (sc > score) { score = sc; best = i; } });
    return { ok: best >= 0, hit: best };
  }

  /* ----- Question pool ----- */
  // A use is only asked as "which drug is used for…" if it doesn't name the drug: bracketed examples that do are dropped,
  // and a use whose own words match the drug's name ("Iron-deficiency anaemia" for oral iron) isn't asked at all.
  const GENERIC = new Set("drops with only methods acid inhibitors agonists receptor blockers oral long short acting inhaled systemic controlled".split(" "));
  const stem6 = w => w.toLowerCase().slice(0, 6);
  function nameToks(d) { return d._names ||= new Set((d.name + " " + d.ex).match(/[A-Za-z]{4,}/g).filter(w => !GENERIC.has(w.toLowerCase())).map(stem6)); }
  const leaks = (d, text) => (text.match(/[A-Za-z]{4,}/g) || []).some(w => { const lw = w.toLowerCase(); for (const n of nameToks(d)) if (lw.includes(n)) return true; return false; });
  const askText = (d, u) => u.t.replace(/\s*\(([^()]*)\)/g, (m, inner) => leaks(d, inner) ? "" : m).trim();
  const askable = d => d.uses.filter(u => !leaks(d, askText(d, u)));
  const FAM = { sa: "sa", num: "num", list: "list", order: "lad", next: "lad", duse: "drug", dhow: "drug", dse: "drug", dci: "drug", dwhy: "drug" };
  const FAM_LABEL = { sa: "Short answer", num: "Numbers", list: "Full lists", lad: "Ladders", drug: "Drug drills" };
  const MCQ = new Set(["num", "next", "duse", "dhow", "dwhy"]);
  const weekOf = k => { const h = k && loByKey[k]; return h ? h.w.id : null; };
  const gweekOf = (g, k) => LINK[g][k] || weekOf(k);
  const POOL = [], ITEM = {}, BY_LO = {}, WEEK_N = {}, FAMN = { sa: 0, num: 0, list: 0, lad: 0, drug: 0 };
  function addItem(it) {
    it.fam = FAM[it.t];
    it.los = it.lo ? [it.lo] : (it.los || []);
    it.weeks = [...new Set(it.los.map(srcWeekOf).filter(Boolean))];  // teaching weeks (an ICM LO's hidden week, not its page)
    it.sep = it.weeks.length > 0 && it.weeks.every(w => weeksById[w] && weeksById[w].sep);  // Year 1 anatomy/ICM: kept out of the main modes
    // gw[g]: the anatomy or ICM weeks a question belongs to (Year 2 ones stay in the main quiz too); drug drills never.
    it.gw = {};
    for (const g of ["anat", "icm"]) it.gw[g] = it.drug ? [] : [...new Set(it.los.map(k => LINK[g][k] || (loByKey[k] && loByKey[k].w.year === g ? loByKey[k].w.id : null)).filter(Boolean))];
    POOL.push(it); ITEM[it.id] = it; FAMN[it.fam]++;
    for (const k of it.los) (BY_LO[k] ||= []).push(it);
    for (const w of new Set([...it.weeks, ...it.gw.anat, ...it.gw.icm])) WEEK_N[w] = (WEEK_N[w] || 0) + 1;
  }
  for (const [id, lo, q, acc, model, lvl, hint, why] of QZ.sa) addItem({ id, t: "sa", lo, q, acc, model, grp: id, lvl, hint, why });
  for (const [id, lo, q, shown, nums, wrong, lvl, why] of QZ.num) addItem({ id, t: "num", lo, q, shown, nums, wrong, grp: id, lvl, why });
  for (const [id, lo, title, items, ordered, lvl, hint, why, also, labels] of QZ.list || []) addItem({ id, t: "list", lo, title, items, ordered, grp: id, lvl, hint, why, also, labels });
  for (const [id, lo, title, steps, lvl, whys, decoys] of QZ.lad) { addItem({ id: id + ":o", t: "order", lo, title, steps, whys, grp: id, lvl }); addItem({ id: id + ":x", t: "next", lo, title, steps, whys, decoys: decoys || [], grp: id, lvl }); }
  const yearOf = keys => keys.length ? Math.min(...keys.map(k => k.startsWith("y1-") ? 1 : 2)) : 2;  // drug questions: earliest linked LO
  for (const c of DRUGS) for (const d of c.items) {
    const useK = [...new Set(d.uses.map(u => u.k).filter(Boolean))], ciK = [...new Set(d.ci.filter(x => x.why).map(x => x.k).filter(Boolean))];
    const base = { drug: d, cat: c.id, grp: d.id, lvl: yearOf(useK) };
    if (askable(d).length) addItem({ ...base, id: "d:" + d.id + ":u", t: "duse", los: useK });
    if (d.how && d.hx && d.hx.length === 3) addItem({ ...base, id: "d:" + d.id + ":h", t: "dhow", los: useK });
    if (d.se.length) addItem({ ...base, id: "d:" + d.id + ":s", t: "dse", los: useK });
    if (d.ci.length) addItem({ ...base, id: "d:" + d.id + ":c", t: "dci", los: useK });
    if (d.ci.some(x => x.why && x.x && x.x.length === 3)) addItem({ ...base, id: "d:" + d.id + ":w", t: "dwhy", los: ciK, lvl: yearOf(ciK) });
  }

  /* ----- Levels: the year of knowledge each question expects ----- */
  const LEVEL_LABEL = { 1: "Year 1", 2: "Year 2", 3: "Stretch" };
  const LEVEL_HINT = "Year 1 and Year 2: expected by the end of that year · Stretch: finals-level detail";
  if (!Array.isArray(qcfg.levels) || !qcfg.levels.length) qcfg.levels = [1, 2, 3];
  const inLevel = it => qcfg.levels.includes(it.lvl);
  function levelPicker(counts) {
    return `<div class="levels"><div class="chips" role="group" aria-label="Level">${[1, 2, 3].map(l => `<button class="chip" data-qlevel="${l}" aria-pressed="${qcfg.levels.includes(l)}">${LEVEL_LABEL[l]} <span class="ct">${counts[l]}</span></button>`).join("")}</div><span class="lvhint">${LEVEL_HINT}</span></div>`;
  }
  const levelCounts = items => { const c = { 1: 0, 2: 0, 3: 0 }; for (const it of items) c[it.lvl]++; return c; };
  const SYSTEMS = [
    ["cardio", "Heart & vessels", "y1-105 y1-108 y1-134 y1-140 y1-147 y2-210 y2-211", "cardio"],
    ["resp", "Respiratory", "y1-103 y1-106 y1-128 y1-146 y2-204 y2-207 y2-213", "resp"],
    ["blood", "Blood & clotting", "y1-138 y2-213 y2-226", "haem"],
    ["gi", "Gut & liver", "y1-102 y1-104 y1-132 y1-145 y2-206 y2-229", "gi"],
    ["renal", "Kidney & fluids", "y1-111 y1-135 y2-220", "fluids"],
    ["endo", "Endocrine & metabolism", "y1-112 y1-126 y1-139 y2-238", "endo"],
    ["neuro", "Brain, nerves & senses", "y1-109 y1-133 y1-142 y2-208 y2-209 y2-219 y2-221 y2-230 y2-231", "neuro eye pain"],
    ["mental", "Mental health", "y1-119 y1-127 y2-239", "neuro"],
    ["msk", "Bones, joints & skin", "y1-107 y1-113 y1-115 y1-125 y1-133 y2-210 y2-227 y2-237", "msk"],
    ["repro", "Women, children & reproduction", "y1-110 y1-114 y1-136 y1-141 y2-201 y2-202 y2-203 y2-212 y2-222 y2-228 y2-240", "women"],
    ["infection", "Infection & immunity", "y1-116 y1-130 y1-131 y2-201 y2-205 y2-221", "infection"]
  ].map(([id, title, weeks, cats]) => ({ id, title, weeks: new Set(weeks.split(" ")), cats: new Set(cats.split(" ")) }));
  const inSystem = (it, s) => it.weeks.some(w => s.weeks.has(w)) || (it.cat && s.cats.has(it.cat));

  // Wrong "used for" options are other drugs from the same body system (then neighbouring systems) that aren't used for
  // that condition. Wrong mechanisms and contraindication reasons are hand-written per drug in drugs.md.
  let drugIx = null;
  function drugIndex() {
    if (drugIx) return drugIx;
    const all = [];
    for (const c of DRUGS) for (const d of c.items) { d._use = d.uses.flatMap(u => keyToks(u.t)); d._useK = new Set(d.uses.map(u => u.k).filter(Boolean)); all.push(d); }
    return (drugIx = { all });
  }
  const NEAR_CATS = { cardio: "haem fluids endo", haem: "cardio fluids", resp: "infection cardio", gi: "endo infection", endo: "gi women cardio", pain: "neuro msk",
    infection: "resp gi", neuro: "pain msk", msk: "gi endo", women: "endo infection", eye: "cardio neuro", fluids: "cardio endo" };
  const BROAD = new Set(["systemic-corticosteroids", "nsaids", "paracetamol", "weak-opioids", "strong-opioids", "oxygen-controlled", "sodium-chloride-0-9", "glucose-5"]);
  function useDistractors(d, u) {
    const { all } = drugIndex(), ut = keyToks(u.t), near = new Set((NEAR_CATS[d.cat] || "").split(" "));
    const ok = x => x !== d && !BROAD.has(x.id) && !(u.k && x._useK.has(u.k)) && !overlap(ut, x._use) && x.uses.length;
    let c = pickN(all.filter(x => x.cat === d.cat && ok(x)), 3);
    if (c.length < 3) c = c.concat(pickN(all.filter(x => near.has(x.cat) && ok(x)), 3 - c.length));
    if (c.length < 3) c = c.concat(pickN(all.filter(x => x.cat !== d.cat && !near.has(x.cat) && ok(x)), 3 - c.length));
    return c;
  }
  const xNotes = list => list.map(x => `— ${esc(x[1])}`);

  /* ----- Turning an item into a question ----- */
  const isPl = d => { const n = d.name.replace(/\s*\(.*?\)/g, "").split(/ for | in /)[0].trim(); return / and | \+ /.test(n) || /s$/.test(n); };
  const dname = d => esc(lc1(d.name));
  const exSmall = d => d.ex ? `<small>e.g. ${esc(d.ex)}</small>` : "";
  const firstK = d => (d.uses.find(x => x.k) || {}).k || null;
  const loTag = k => { const h = loByKey[k]; return h ? loTagOf(h) : ""; };
  const pickFocused = (list, S) => { const hits = S.focus ? list.filter(x => x.k && S.focus(x.k)) : []; return rand(hits.length ? hits : list); };
  const FIFTY = { fifty: true, text: "Two wrong answers are crossed out." };
  // notes[i] explains wrong option i (what it actually is), shown after answering.
  function mcq(base, right, wrong, notes = []) {
    const opts = shuffle([right, ...wrong].map((h, i) => ({ h, ok: i === 0, note: i ? notes[i - 1] || "" : "" })));
    return { hint: FIFTY, ...base, kind: "mcq", opts: opts.map(o => o.h), notes: opts.map(o => o.note), right: opts.findIndex(o => o.ok) };
  }
  const works = d => `${dname(d)} ${isPl(d) ? "work" : "works"}`;
  function inst(it, S) {
    const d = it.drug, src = it.lo ? loTag(it.lo) : d ? catById[it.cat].title : "";
    switch (it.t) {
      case "sa": return { kind: "typed", tag: "Short answer", src, prompt: esc(it.q), lo: it.lo, answerText: it.model, answerHTML: () => esc(it.model) + mineHTML(it.id), why: esc(it.why || ""),
        grade: a => { if (gradeSA(a, it.acc)) return { ok: true }; const m = mineMatch(it, a); return { ok: m >= 0, mine: m }; },
        hint: { text: it.hint || `It starts with “${it.model.replace(/[^A-Za-z0-9]/g, "").slice(0, 2)}…”.` } };
      case "num": {
        const base = { tag: "Key number", src, prompt: esc(it.q), lo: it.lo, answerText: it.shown, why: esc(it.why || "") };
        if (S.mcq) {  // numeric options read best in ascending order
          const v = s => parseFloat((s.match(/\d+(\.\d+)?/) || [0])[0]), opts = [it.shown, ...it.wrong].sort((a, b) => v(a) - v(b));
          return { ...base, kind: "mcq", opts: opts.map(esc), right: opts.indexOf(it.shown), hint: FIFTY };
        }
        return { ...base, kind: "typed", placeholder: "Type the number", answerHTML: () => esc(it.shown) + mineHTML(it.id),
          grade: a => { if (gradeNum(a, it.nums)) return { ok: true }; const m = mineMatch(it, a); return { ok: m >= 0, mine: m }; },
          hint: { text: `It's one of these: ${shuffle([it.shown, rand(it.wrong)]).join("  or  ")}` } };
      }
      case "list": {
        const parts = listParts(it), items = parts.map(x => x.shown), n = items.length, first = items.map(x => (x.replace(/^[^A-Za-z0-9]+/, "")[0] || "?").toUpperCase());
        return { kind: "list", tag: it.labels ? "Acronym" : it.ordered ? (/routine|steps|structure|survey|life support|choking|how do you|stages/i.test(it.title) ? "Full routine" : "Sequence") : "Full list", src, prompt: `${esc(it.title)}<small>${n} ${it.ordered ? "steps: each goes into its place" : "to find"}</small>`, lo: it.lo, items,
          acc: parts.map(x => x.acc), notes: parts.map(x => x.note), keys: parts.map(x => x.key), own: parts.map(x => !!x.own), labels: it.labels ? parts.map(x => x.label || "+") : null, also: it.also || "", ordered: !!it.ordered, answerText: items.join(it.ordered ? " → " : "; "), why: esc(it.why || ""),
          hint: { text: it.labels ? it.hint || "Think what each letter stands for." : `${it.hint ? it.hint + " " : ""}${it.ordered ? "In order, they" : "They"} start with ${(it.ordered ? first : first.slice().sort()).join(", ")}.` } };
      }
      case "order": {
        let perm; do { perm = shuffle(it.steps.map((_, i) => i)); } while (perm.every((v, i) => v === i));
        return { kind: "order", tag: "Ladder", src, prompt: `Put in order: <b>${esc(it.title)}</b>`, steps: it.steps, whys: it.whys || [], perm, lo: it.lo, answerText: it.steps.join(" → "), hint: { first: true, text: "The first step is in place for you." } };
      }
      case "next": {
        const i = Math.floor(Math.random() * it.steps.length) - 1, right = it.steps[i + 1];
        const n = it.steps.length, wi = pickN(it.steps.map((_, j) => j).filter(j => j !== i && j !== i + 1), 3);
        let wrong = wi.map(j => it.steps[j]), notes = wi.map(j => `is step ${j + 1} of ${n}, so it comes ${j < i + 1 ? "earlier" : "later"}.`);
        if (wrong.length < 3) { const extra = pickN(it.decoys, 3 - wrong.length); wrong = wrong.concat(extra.map(e => e[0])); notes = notes.concat(extra.map(e => `isn't a step here: ${esc(e[1])}`)); }
        const prompt = i < 0 ? `<b>${esc(it.title)}</b>: what comes first?` : `<b>${esc(it.title)}</b>: what comes after “${esc(it.steps[i])}”?`;
        const whys = it.whys || [], explain = `<ol class="ladder">${it.steps.map((s, j) => `<li class="${j === i + 1 ? "hl" : ""}">${esc(s)}${j === i + 1 && whys[j] ? `<span class="lw">${esc(whys[j])}</span>` : ""}</li>`).join("")}</ol>`;
        return mcq({ tag: "Ladder", src, prompt, lo: it.lo, explain, answerText: right, why: whys[i + 1] ? esc(whys[i + 1]) : "" }, esc(right), wrong.map(esc), notes);
      }
      case "duse": {
        const u = pickFocused(askable(d), S), opt = x => `<b>${esc(x.name)}</b>${x.ex ? `<small>${esc(x.ex)}</small>` : ""}`;
        return mcq({ tag: "Drug uses", src, prompt: `Which drug is used for: <b>${esc(askText(d, u))}</b>?`, lo: u.k, drug: d, answerText: d.name,
          explain: `<b>${esc(d.name)}</b> ${isPl(d) ? "are" : "is"} used for: ${esc(d.uses.map(x => x.t).join("; "))}`, why: d.how ? `How ${works(d)}: ${esc(d.how)}.` : "" },
          opt(d), ...(() => { const ws = useDistractors(d, u); return [ws.map(opt), ws.map(x => `${isPl(x) ? "are" : "is"} used for ${esc(x.uses.slice(0, 2).map(y => lc1(y.t)).join("; ") || "other conditions")}.`)]; })());
      }
      case "dhow":
        return mcq({ tag: "Mechanism", src, prompt: `How ${isPl(d) ? "do" : "does"} <b>${dname(d)}</b> work?${exSmall(d)}`, lo: firstK(d), drug: d, answerText: d.how,
          why: d.uses.length ? `That mechanism is why ${dname(d)} ${isPl(d) ? "are" : "is"} used for ${esc(d.uses.slice(0, 3).map(u => lc1(u.t)).join("; "))}.` : "" },
          esc(d.how), d.hx.map(x => esc(x[0])), xNotes(d.hx));
      case "dse":
        return { kind: "typed", tag: "Side effects", src, prompt: `Name a main side effect of <b>${dname(d)}</b>.${exSmall(d)}`, lo: firstK(d), drug: d, answerText: d.se.join("; "),
          hint: { text: d.how ? `Think about how it works: ${d.how}` : `${d.se.length} are listed, starting with ${d.se.map(s => s.replace(/^[^A-Za-z]+/, "")[0]).join(", ")}.` },
          why: esc(d.sewhy || ""), grade: a => { const r = gradeList(a, d.se); if (r.ok) return r; const m = mineMatch(it, a); return { ok: m >= 0, hit: -1, mine: m }; },
          answerHTML: hit => `<span class="lbl">Main side effects</span><ul>${d.se.map((s, i) => `<li class="${i === hit ? "hit" : ""}">${esc(s)}</li>`).join("")}</ul>${mineHTML(it.id)}` };
      case "dci":
        return { kind: "typed", tag: "Contraindications", src, prompt: `Name a condition where <b>${dname(d)}</b> ${isPl(d) ? "are" : "is"} avoided or used with caution.${exSmall(d)}`, lo: null, drug: d, answerText: d.ci.map(x => x.c).join("; "),
          grade: a => { const r = gradeList(a, d.ci.map(x => x.c)); if (r.ok) return r; const m = mineMatch(it, a); return { ok: m >= 0, hit: -1, mine: m }; }, why: d.how ? `The reasons above follow from how ${works(d)}: ${esc(d.how)}.` : "",
          hint: { text: `${d.ci.length} listed, starting with ${d.ci.map(x => x.c.replace(/^[^A-Za-z]+/, "")[0].toUpperCase()).join(", ")}.` },
          answerHTML: hit => `<div class="tbl kv ci"><table><tbody>${d.ci.map((x, i) => `<tr class="${i === hit ? "hit" : ""}"><th scope="row"><span class="pill ${x.cau ? "cau" : "no"}">${x.cau ? "Caution" : "Avoid"}</span>${loLink(x.c, x.k)}</th><td>${esc(x.why)}</td></tr>`).join("")}</tbody></table></div>${mineHTML(it.id)}` };
      case "dwhy": {
        const ci = pickFocused(d.ci.filter(x => x.why && x.x && x.x.length), S);
        return mcq({ tag: ci.cau ? "Cautions" : "Contraindications", src, prompt: `Why ${isPl(d) ? "are" : "is"} <b>${dname(d)}</b> ${ci.cau ? "used with caution" : "avoided"} in <b>${esc(lc1(ci.c))}</b>?`, lo: ci.k, drug: d, answerText: ci.why,
            why: d.how ? `How ${works(d)}: ${esc(d.how)}.` : "" },
          esc(ci.why), ci.x.map(x => esc(x[0])), xNotes(ci.x));
      }
    }
  }

  /* ----- Full-list questions ----- */
  // Typed one at a time into numbered slots. c.log keeps every entry in order as {t: text, i: item index, -1 if it isn't
  // on the list, or -2 if it's a fair answer that isn't one of the items (the list's "also" answers)}; one entry
  // can name several items (separated by commas, semicolons, "and" or "+"). c.matches maps a "not on the list" entry (its
  // log index) to the missed item it meant; that wording is then accepted for the item (saved like "I was right" answers).
  // Every item is needed for the question to count as right, and routines must also be in order.
  // After answering, an entry that wasn't on the list can be saved, like "I was right" on other questions: as the same as
  // an item you missed (it counts now: c.matches), as another way of saying one you found (c.alias), or as a right answer
  // that isn't one of the items (c.xtra: saved under the list's own id and added to your notes; next time it's
  // acknowledged as fair, never flagged). Saved wordings for an item live under "<list id>#<item>".
  const listKey = (c, i) => (c.q.keys && c.q.keys[i]) || c.it.id + "#" + i;
  const ownKey = (it, t) => it.id + "#+" + hashStr(norm(t));
  // Items you've added to a list (Add to the list): unordered ones go at the end; a routine's step goes after the step
  // you chose. Their accepted wording is the text you typed (plus any wordings you save for them later).
  function listParts(it) {
    const out = it.items.map((x, i) => ({ shown: x[0], acc: x[1], note: x[2] || "", key: it.id + "#" + i, label: it.labels ? it.labels[i] : "" }));
    for (const [t, after] of mine(it.id + "#+")) {
      const o = { shown: t, acc: norm(t) || t, note: "Added by you", key: ownKey(it, t), own: true };
      const j = out.findIndex(x => x.key === after), at = !it.ordered ? out.length : after === "^" ? 0 : j < 0 ? out.length : j + 1;
      out.splice(at, 0, o);
    }
    return out;
  }
  // Rebuild a card's list after adding or removing an item of your own, keeping every entry on the item it named.
  function relist(c) {
    const old = c.q.keys || [], q = inst(c.it, QS || {}), at = i => i >= 0 ? q.keys.indexOf(old[i]) : i;
    for (const e of c.log || []) if (e.i >= 0) e.i = at(e.i);
    for (const m of [c.matches, c.alias]) if (m) for (const k in m) { const v = at(m[k]); if (v < 0) delete m[k]; else m[k] = v; }
    c.q = q;
  }
  // The notes side of saving an answer: add it to the LO's notes under "My additions" unless they already cover it.
  function noteIn(c, t) {
    const lo = c.it.lo, h = loByKey[lo], x = { note: false };
    if (!h || coveredBy(t, h.lo.plain)) return x;
    x.prevNote = notesT[lo] ? notesT[lo].slice() : null;
    notesT[lo] = [appendMine(h.lo.html, `<strong>${esc(t)}</strong>: ${esc(c.it.title)}`), nowS(), notesT[lo] ? notesT[lo][2] : hashStr(h.lo.html0 || "")];
    persistNote(lo); x.note = true; return x;
  }
  function noteOut(c, x) {
    if (!x || !x.note) return;
    const lo = c.it.lo, prev = x.prevNote;
    notesT[lo] = [prev ? prev[0] : null, nowS(), prev ? prev[2] : hashStr(loByKey[lo].lo.html0 || "")]; persistNote(lo);
    x.note = false; delete x.prevNote;
  }
  const listMine = (c, t) => mineMatch({ id: c.it.id, t: "list" }, t) >= 0;
  const listItemOf = (c, e, k) => e.i >= 0 ? e.i : c.matches && c.matches[k] != null ? c.matches[k] : -1;
  // How specifically an answer matches an accepted pattern: 0 = no match, else the length of the longest matching
  // alternative in each " + " group, added up. An entry goes to the item it matches most specifically.
  function accScore(ans, acc) {
    const A = parseAns(ans), AJ = parseAns(joinLD(A.s)); if (!A.s) return 0;
    let total = 0;
    for (const g of acc.split(" + ")) {
      let best = 0;
      for (const alt of g.split(" / ")) { const n = norm(alt); if (n.length > best && (altMatch(n, A) || altMatch(joinLD(n), AJ))) best = n.length; }
      if (!best) return 0; total += best;
    }
    return total;
  }
  const listScore = (c, text, i) => mineMatch({ id: listKey(c, i) }, text) >= 0 ? 1000 : accScore(text, c.q.acc[i]);
  function listHit(c, text, taken) {
    const q = c.q; let best = -1, score = 0;
    for (let i = 0; i < q.items.length; i++) {
      if (taken.has(i)) continue;
      const sc = listScore(c, text, i);
      if (sc > score) { score = sc; best = i; }
    }
    return best;
  }
  function listSeq(c) { return (c.log || []).map((e, k) => listItemOf(c, e, k)).filter(i => i >= 0); }
  function listAdd(c, raw) {
    c.log = c.log || [];
    const out = { got: [], dup: [], no: [], extra: [] };
    // Split on commas and semicolons; split a chunk on "and", "&" or "+" only if every part is an item by itself
    // ("clubbing and splinters"), so an item that contains "and" ("group and save") stays whole.
    const parts = [];
    for (const chunk of String(raw).split(/[,;\n]/).map(x => x.trim()).filter(Boolean)) {
      const bits = chunk.split(/\band\b|&|\+/i).map(x => x.trim()).filter(Boolean);
      const ps = bits.length > 1 && bits.every(x => listHit(c, x, new Set()) >= 0) ? bits : [chunk];
      parts.push(...(c.q.labels ? ps.flatMap(x => listWords(c, x)) : ps));
    }
    // An entry goes to the item it names most specifically. If that item is already found it's a repeat, unless it
    // names an unfound item just as well (two items worded alike).
    for (const t of parts) {
      const i = listHit(c, t, new Set(listSeq(c))), d = listHit(c, t, new Set());
      if (i >= 0 && (i === d || listScore(c, t, i) >= listScore(c, t, d))) { c.log.push({ t, i }); out.got.push(i); continue; }
      if (d >= 0) { if (!out.got.includes(d) && !out.dup.includes(d)) out.dup.push(d); continue; }
      if (listMine(c, t) || (c.q.also && accScore(t, c.q.also) > 0)) { if (!c.log.some(e => e.i < 0 && norm(e.t) === norm(t))) c.log.push({ t, i: -2 }); out.extra.push(t); continue; }
      if (!c.log.some(e => e.i < 0 && norm(e.t) === norm(t))) c.log.push({ t, i: -1 });
      out.no.push(t);
    }
    return out;
  }
  // An acronym's expansion typed as one phrase ("national early warning score"): one word per letter, if every word
  // (apart from little words like "of") names an item and they name more than one.
  function listWords(c, p) {
    const ws = p.split(/\s+/).filter(w => w && !/^(of|the|and|or|a|an|to|for|in|with|on|by)$/i.test(w));
    if (ws.length < 2) return [p];
    const whole = listHit(c, p, new Set());  // a phrase that is itself an item's wording ("pus on the tonsils") stays whole
    if (whole >= 0 && listScore(c, p, whole) >= norm(p).length * 0.7) return [p];
    const hits = ws.map(w => listHit(c, w, new Set()));
    return hits.every(h => h >= 0) && new Set(hits).size >= 2 ? ws : [p];
  }
  // Positions of the longest run already in the right order; anything else in a routine is out of order.
  function listInOrder(seq) {
    const n = seq.length, len = Array(n).fill(1), prev = Array(n).fill(-1);
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (seq[j] < seq[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    let best = -1; for (let i = 0; i < n; i++) if (best < 0 || len[i] > len[best]) best = i;
    const keep = new Set(); for (let i = best; i >= 0; i = prev[i]) keep.add(i);
    return keep;
  }
  // Right = every item found. In a routine or path each step drops into its own place however you type them; a step given
  // after a later one is flagged out of sequence (amber ↕, "you gave it after step N") but isn't marked wrong.
  function listOk(c) { return listSeq(c).length === c.q.items.length; }
  function listOos(c) {  // item → the later step it was given after (steps typed this time; carried-over ones don't count)
    const out = new Map(); if (!c.q.ordered) return out;
    let top = -1;
    (c.log || []).forEach((e, k) => { if (e.pre) return; const i = listItemOf(c, e, k); if (i < 0) return; if (top > i && !out.has(i)) out.set(i, top); top = Math.max(top, i); });
    return out;
  }
  // A full list missed on the first try comes back this round with what you got already filled in.
  function listCarry(c) {
    const prev = QS.past.slice().reverse().find(x => x.it.id === c.it.id && x.answered && x.q.kind === "list");
    if (!prev) return;
    let keep = [];
    (prev.log || []).forEach((e, k) => { const i = listItemOf(prev, e, k); if (i >= 0) keep.push({ t: e.t, i }); });
    c.log = keep.map(x => ({ t: x.t, i: x.i, pre: 1 }));
  }
  const listCanEdit = c => c.answered && c.q.kind === "list" && !laterTries(c).length;
  function listTopHTML(c) {
    const q = c.q, log = c.log || [], got = log.filter(e => e.i >= 0), no = log.filter(e => e.i === -1), pre = log.filter(e => e.pre).length;
    const fresh = new Set(got.slice(got.length - (c.fresh || 0)).map(e => e.i));
    const byStep = !!q.labels || q.ordered;  // an acronym, routine or path: each item in its own place
    const lab = k => q.labels ? esc(q.labels[k]) : k + 1, oos = listOos(c);
    const slot = (e, k) => e ? `<li class="${oos.has(e.i) ? "ooo" : "got"}${fresh.has(e.i) && !e.pre ? " fresh" : ""}"><span class="n">${lab(k)}</span><span><span class="mk">${oos.has(e.i) ? "↕" : "✓"}</span>${esc(q.items[e.i])}${e.pre ? `<small>from your first try</small>` : norm(e.t) !== norm(q.items[e.i]) ? `<small>you wrote “${esc(e.t)}”</small>` : ""}${oos.has(e.i) ? `<small>you gave it after step ${oos.get(e.i) + 1}</small>` : ""}</span></li>` : `<li><span class="n">${lab(k)}</span><span>${pre ? `<small class="tofind">still to find</small>` : ""}</span></li>`;
    const slots = q.items.map((_, k) => slot(byStep ? got.find(e => e.i === k) : got[k], k)).join("");
    return `${pre ? `<p class="lnote">Second try: the ${pre} you got last time ${pre === 1 ? "is" : "are"} filled in${byStep ? " in their places" : ""}. Find the rest.</p>` : ""}<p class="lmsg${c.msgCls ? " " + c.msgCls : ""}" aria-live="polite">${c.msg || ""}</p>${no.length ? `<p class="lnote">Not on the list so far: ${no.map(e => `“${esc(e.t)}”`).join(", ")}</p>` : ""}<ol class="lslots live${q.labels ? " letters" : ""}">${slots}</ol>`;
  }
  function listLiveHTML(c) {
    const q = c.q, got = listSeq(c).length;
    return `<form class="qinput" id="qlistform" autocomplete="off"><input id="qlist" type="text" enterkeyhint="enter" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${got ? "Next one…" : q.ordered ? "Type a step and press Enter" : "Type one and press Enter"}" aria-label="Add an item"><button class="btn" type="submit">Add</button><button class="btn pri" type="button" id="q-listdone">${got ? "Done" : "Show the list"}</button><button class="btn ghost hintbtn" type="button" id="q-hint"${c.hinted ? " disabled" : ""}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2v.6h4v-.6c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5z"/></svg>Hint</button><span class="lcount" id="qlistcount">${got} of ${q.items.length}</span></form>
      <div id="qlistlive">${listTopHTML(c)}</div>`;
  }
  function listEnter() {
    const c = QS && QS.cur, inp = $("#qlist"); if (!c || c.answered || c.q.kind !== "list" || !inp) return;
    const v = inp.value.trim(); if (!v) return;
    const r = listAdd(c, v), q = c.q, name = i => esc(q.items[i]);
    c.msg = [r.got.length ? `✓ ${r.got.map(name).join(", ")}` : "", r.dup.length ? `Already have ${r.dup.map(name).join(", ")}` : "", r.extra.length ? `${r.extra.map(t => `“${esc(t)}”`).join(", ")}: fair, but not one of the ${q.items.length} here` : "", r.no.length ? `✗ ${r.no.map(t => `“${esc(t)}”`).join(", ")}: not on the list` : ""].filter(Boolean).join(" · ");
    c.msgCls = r.no.length && !r.got.length ? "no" : r.got.length ? "ok" : ""; c.fresh = r.got.length;
    inp.value = "";
    if (listSeq(c).length === q.items.length) return submit({ list: true });
    $("#qlistlive").innerHTML = listTopHTML(c); c.fresh = 0;
    const got = listSeq(c).length, cnt = $("#qlistcount"), done = $("#q-listdone");
    if (cnt) cnt.textContent = `${got} of ${q.items.length}`; if (done) done.textContent = got ? "Done" : "Show the list";
    inp.placeholder = "Next one…"; inp.focus(); saveRound();
  }
  function listResultHTML(c) {
    const q = c.q, edit = listCanEdit(c), seqE = [];
    (c.log || []).forEach((e, k) => { const i = listItemOf(c, e, k); if (i >= 0) seqE.push({ i, t: e.t, m: e.i < 0, pre: !!e.pre }); });
    const oos = listOos(c);
    for (const x of seqE) x.ooo = !x.pre && oos.has(x.i);
    const have = new Set(seqE.map(x => x.i)), missed = q.items.map((_, i) => i).filter(i => !have.has(i));
    const byStep = !!q.labels || q.ordered, lab = i => q.labels ? esc(q.labels[i]) : i + 1;
    const row = (cls, num, mark, i, extra) => `<li class="${cls}${q.own && q.own[i] ? " own" : ""}"><span class="n">${num}</span><span><span class="mk">${mark}</span>${esc(q.items[i])}${extra}${q.notes[i] ? `<span class="ln">${esc(q.notes[i])}</span>` : ""}</span></li>`;
    const found = (x, num) => row(x.ooo ? "ooo" : "got", num, x.ooo ? "↕" : "✓", x.i, (x.pre ? `<small>from your first try</small>` : x.m ? `<small>you wrote “${esc(x.t)}” and matched it</small>` : norm(x.t) !== norm(q.items[x.i]) ? `<small>you wrote “${esc(x.t)}”</small>` : "") + (x.ooo ? `<small>out of sequence: you gave it after step ${oos.get(x.i) + 1}</small>` : ""));
    const rows = byStep
      ? q.items.map((_, i) => { const x = seqE.find(y => y.i === i); return x ? found(x, lab(i)) : row("lmiss", lab(i), "✗", i, ""); })
      : seqE.map((x, p) => found(x, p + 1)).concat(missed.map((i, p) => row("lmiss", seqE.length + p + 1, "✗", i, q.ordered ? `<small>step ${i + 1}</small>` : "")));
    const wrong = (c.log || []).map((e, k) => ({ e, k })).filter(x => x.e.i < 0), extra = wrong.filter(x => x.e.i === -2);
    const foundSorted = [...have].sort((a, b) => a - b);
    const lw1 = ({ e, k }) => {
      const m = c.matches && c.matches[k], al = c.alias && c.alias[k], xs = c.xtra && c.xtra[k], ad = c.added && c.added[k];
      const undo = what => edit ? `<button class="linkbtn" data-${what}="${k}">Undo</button>` : "";
      if (m != null) return `<div class="lw1"><b>“${esc(e.t)}”</b><span>counted as ${esc(q.items[m])}, and saved</span>${edit ? `<button class="linkbtn" data-lmatch="${k}:${m}">Undo</button>` : ""}</div>`;
      if (al != null) return `<div class="lw1"><b>“${esc(e.t)}”</b><span>saved as another way of saying ${esc(q.items[al])}</span>${undo("lalias-undo")}</div>`;
      if (ad) return `<div class="lw1"><b>“${esc(e.t)}”</b><span>added to the list${q.ordered ? ` as step ${e.i + 1}` : ""}: it has its own slot from now on${ad.note ? `, and it's in ${loLink("your notes", c.it.lo)} under <b>My additions</b>` : ""}</span>${edit && ad.note ? `<button class="linkbtn" data-laddnote="${k}">Take it out of my notes</button>` : ""}${undo("ladd")}</div>`;
      if (xs) return `<div class="lw1"><b>“${esc(e.t)}”</b><span>saved as a right answer too${xs.note ? `, and added to ${loLink("your notes", c.it.lo)} under <b>My additions</b>` : ""}</span>${edit && xs.note ? `<button class="linkbtn" data-lxnote="${k}">Take it out of my notes</button>` : ""}${undo("lxtra")}</div>`;
      if (!edit) return `<div class="lw1"><b>“${esc(e.t)}”</b></div>`;
      // a few missed items as one-tap chips; otherwise one "Same as…" menu (missed items count, found ones save the wording)
      const chips = missed.length && missed.length <= 3 ? `<span>same as:</span>${missed.map(i => `<button class="chip" data-lmatch="${k}:${i}">${esc(q.items[i])}</button>`).join("")}` : "";
      const opt = (v, i) => `<option value="${v}${i}">${esc(q.items[i].length > 48 ? q.items[i].slice(0, 46) + "…" : q.items[i])}</option>`;
      const menu = (missed.length > 3 ? `<optgroup label="Items you missed (it counts)">${missed.map(i => opt("m", i)).join("")}</optgroup>` : "") + (foundSorted.length ? `<optgroup label="Items you found (saves the wording)">${foundSorted.map(i => opt("f", i)).join("")}</optgroup>` : "");
      const add = q.ordered
        ? `<select class="lsel ladd" data-laddat="${k}" aria-label="Add it to the routine"><option value="">Add it to the routine…</option><option value="^">as the first step</option>${q.items.map((x, i) => `<option value="${esc(q.keys[i])}">after ${i + 1}. ${esc(x.length > 40 ? x.slice(0, 38) + "…" : x)}</option>`).join("")}</select>`
        : `<button class="chip ladd" data-ladd="${k}">Add it to the list</button>`;
      const right = e.i === -1 ? `<button class="chip lright" data-lxtra="${k}">Right, but not needed</button>` : "";
      const sel = menu ? `<select class="lsel" data-lsame="${k}" aria-label="Same as an item on the list"><option value="">${chips ? "or same as one you found…" : "Same as…"}</option>${menu}</select>` : "";
      return `<div class="lw1"><b>“${esc(e.t)}”</b>${add}${right}${chips}${sel}</div>`;
    };
    const added = Object.keys(c.added || {}).map(Number), wrong2 = wrong.concat(added.filter(k => c.log[k] && c.log[k].i >= 0).map(k => ({ e: c.log[k], k })));
    const no = wrong2.filter(x => x.e.i === -1 || (c.added && c.added[x.k])), open = wrong.some(({ k }) => !(c.matches && c.matches[k] != null) && !(c.alias && c.alias[k] != null) && !(c.xtra && c.xtra[k]));
    const wrongHTML = wrong2.length ? `<div class="lwrong">${no.length ? `<span class="lbl">Not on the list</span>${no.map(lw1).join("")}` : ""}${extra.length ? `<span class="lbl">Fair, but not needed here</span>${extra.map(lw1).join("")}` : ""}${edit && open ? `<span class="lnote">Should it be on the list? Add it: it gets its own slot from now on and goes in your notes. Meant an item that's already on it? Choose it under Same as: ${missed.length ? "one you missed counts now, and " : ""}your wording is accepted from now on.</span>` : ""}</div>` : "";
    const saved = [];
    mine(c.it.id + "#+").forEach((x, j) => saved.push(`<li><b>“${esc(x[0])}”</b><span>added to the list by you</span><button class="linkbtn" data-lunsave="+:${j}">Remove</button></li>`));
    q.items.forEach((name, i) => mine(listKey(c, i)).forEach((x, j) => saved.push(`<li><b>“${esc(x[0])}”</b><span>= ${esc(name)}</span><button class="linkbtn" data-lunsave="${i}:${j}">Remove</button></li>`)));
    mine(c.it.id).forEach((x, j) => saved.push(`<li><b>“${esc(x[0])}”</b><span>right too (not one of the items)</span><button class="linkbtn" data-lunsave="x:${j}">Remove</button></li>`));
    const savedHTML = saved.length ? `<details class="lsaved"><summary>Your saved answers for this list (${saved.length})</summary><ul>${saved.join("")}</ul></details>` : "";
    const order = "";
    return `<div class="model"><ol class="lslots${q.labels ? " letters" : ""}">${rows.join("")}</ol></div>${wrongHTML}${order}${savedHTML}`;
  }
  function listVerdict(c) {
    const n = c.q.items.length, got = listSeq(c).length, pre = (c.log || []).filter(e => e.pre).length, full = listOk(c), oo = listOos(c).size;
    const also = [pre ? `${pre} from your first try` : "", oo ? `${oo} out of sequence` : ""].filter(Boolean).join(", ");
    if (c.ok && !full) return `Marked right: ${got} of ${n} found`;
    if (!c.ok && full) return `Marked wrong`;
    if (c.ok) return `${c.matches && Object.keys(c.matches).length ? "Right, with your matches" : c.hinted ? "Right, with a hint" : "Right"}: all ${n}${also ? ` (${also})` : ""}`;
    if (!got) return "Here's the list";
    return `Not quite: ${got} of ${n}`;
  }
  // Another way of saying an item you've already found: save the wording (or undo). The score doesn't change.
  function listAlias(k, i) {
    const c = shownCard(); if (!c || !listCanEdit(c)) return;
    const e = c.log && c.log[k]; if (!e || e.i >= 0 || !(i >= 0 && i < c.q.items.length)) return;
    c.alias = c.alias || {};
    const key = listKey(c, i);
    if (c.alias[k] === i) { delete c.alias[k]; saveAcc(key, mine(key).filter(x => x[0] !== e.t)); }
    else { c.alias[k] = i; if (mineMatch({ id: key }, e.t) < 0) saveAcc(key, mine(key).concat([[e.t, "list", nowS()]])); }
    renderQuiz();
  }
  const listAliasUndo = k => { const c = shownCard(); if (c && c.alias && c.alias[k] != null) listAlias(k, c.alias[k]); };
  // A right answer that isn't one of the items: accepted from now on (as fair, not needed) and, unless the notes already
  // cover it, added to the LO's notes under "My additions", as "I was right" does on other questions. Tapping again undoes.
  function listXtra(k) {
    const c = shownCard(); if (!c || !listCanEdit(c)) return;
    const e = c.log && c.log[k]; if (!e || e.i !== -1) return;
    c.xtra = c.xtra || {};
    const id = c.it.id;
    if (c.xtra[k]) { listXnote(k, true); delete c.xtra[k]; saveAcc(id, mine(id).filter(x => x[0] !== e.t)); return renderQuiz(); }
    if (!listMine(c, e.t)) saveAcc(id, mine(id).concat([[e.t, "", nowS()]]));
    const x = noteIn(c, e.t); if (x.note) setWhere(id, e.t, "notes");
    c.xtra[k] = x; renderQuiz();
  }
  function listXnote(k, quiet) {  // take a saved right-too answer back out of the notes
    const c = shownCard(), x = c && c.xtra && c.xtra[k]; if (!x || !x.note) return;
    noteOut(c, x); setWhere(c.it.id, c.log[k].t, "");
    if (!quiet) renderQuiz();
  }
  // Add an entry that wasn't on the list to the list: it becomes one of the items (its own slot, needed from now on),
  // counts as found now, and goes in the notes under "My additions". In a routine, "after" is the key of the step it
  // follows ("^" = first). Tapping Undo takes it back off.
  function listOwn(k, after) {
    const c = shownCard(); if (!c || !listCanEdit(c)) return;
    const e = c.log && c.log[k]; if (!e) return;
    const store = c.it.id + "#+", t = e.t.trim(), same = x => norm(x[0]) === norm(t);
    c.added = c.added || {};
    if (c.added[k]) {
      const A = c.added[k]; noteOut(c, A);
      saveAcc(store, mine(store).filter(x => !same(x)));
      relist(c); e.i = A.was; delete c.added[k];
    } else {
      if (e.i >= 0) return;
      if (!mine(store).some(same)) saveAcc(store, mine(store).concat([[t, c.q.ordered ? after || "" : "", nowS()]]));
      if (mine(c.it.id).some(same)) saveAcc(c.it.id, mine(c.it.id).filter(x => !same(x)));  // no longer just "right too"
      const was = e.i; relist(c);
      e.i = c.q.keys.indexOf(ownKey(c.it, t));
      c.added[k] = { was, ...noteIn(c, t) };
    }
    const ok = listOk(c);
    if (ok !== c.ok && !(c.manual && c.ok)) setResult(c, ok);
    renderQuiz();
  }
  function listOwnNote(k) { const c = shownCard(), A = c && c.added && c.added[k]; if (A) { noteOut(c, A); renderQuiz(); } }
  // Remove a saved answer for this list (an item's wording, or a right-too answer).
  function listUnsave(which, j) {
    const c = shownCard(); if (!c || c.q.kind !== "list") return;
    const key = which === "x" ? c.it.id : which === "+" ? c.it.id + "#+" : listKey(c, +which), list = mine(key).slice();
    if (!list[j]) return;
    list.splice(j, 1); saveAcc(key, list);
    if (which === "+") { relist(c); for (const k in c.added || {}) if (!(c.log[k] && c.log[k].i >= 0)) { c.log[k].i = c.added[k].was; delete c.added[k]; } const ok = listOk(c); if (ok !== c.ok && !(c.manual && c.ok)) setResult(c, ok); }
    renderQuiz();
  }
  // A "not on the list" entry that meant the same as a missed item: count it (or undo), save the wording, and rescore.
  function listMatch(k, i) {
    const c = shownCard(); if (!c || !listCanEdit(c)) return;
    const e = c.log && c.log[k]; if (!e || e.i >= 0 || i < 0 || i >= c.q.items.length) return;
    c.matches = c.matches || {};
    const key = listKey(c, i);
    if (c.matches[k] === i) { delete c.matches[k]; saveAcc(key, mine(key).filter(x => x[0] !== e.t)); }
    else { if (listSeq(c).includes(i)) return; c.matches[k] = i; if (mineMatch({ id: key }, e.t) < 0) saveAcc(key, mine(key).concat([[e.t, "list", nowS()]])); }
    const ok = listOk(c);
    if (ok !== c.ok && !(c.manual && c.ok)) setResult(c, ok);
    renderQuiz();
  }

  /* ----- Scheduling ----- */
  // Leitner boxes with intervals 0/1/3/7/16/35 days. Wrong: back to box 0, due today. Right: up a box.
  // Right with a hint: no promotion (capped below mastery at box 3) and half the interval; a new question stays due today.
  // A second try in the same round can't promote past the first attempt's result.
  function record(id, ok, hinted = false, retry = false) {
    const e = srs[id] || [0, 0, 0, 0, 0, 0], T = dayNum();
    let box, due;
    if (!ok) { box = 0; due = T; }
    else if (retry) { box = Math.max(1, hinted ? Math.min(e[0], 3) : e[0]); due = Math.max(e[1], T + (hinted ? 0 : 1)); }
    else if (hinted) { box = Math.min(Math.max(e[0], 1), 3); due = T + (e[0] ? Math.max(1, Math.round(INTERVALS[box] / 2)) : 0); }
    else { box = Math.min(5, e[0] + 1); due = T + INTERVALS[box]; }
    srs[id] = [box, due, e[2] + 1, e[3] + (ok ? 1 : 0), nowS(), (e[5] || 0) + (hinted ? 1 : 0)];
    saveSrs();
    const it = ITEM[id]; if (it) noteRated(autoRate([it.lo, it.drug && "drug:" + it.drug.id].filter(Boolean)));
  }

  /* ----- Ratings from the quiz ----- */
  // An LO's own questions (or a drug's drills) set its rating once there's enough evidence: Confident when ≥80% of them
  // are mastered and none is currently wrong, Not yet when they keep coming out wrong, otherwise Shaky. Each rating keeps
  // the verdict it came from (conf entry [value, time, verdict, fromQuiz]), so a rating you set yourself stays until the
  // quiz verdict changes, and the verdict syncs with the rating.
  const RATE_ITEMS = {};
  for (const it of POOL) { if (it.lo) (RATE_ITEMS[it.lo] ||= []).push(it); if (it.drug) (RATE_ITEMS["drug:" + it.drug.id] ||= []).push(it); }
  function quizVerdict(items) {
    let a = 0, seen = 0, right = 0, mastered = 0, wrong = 0;
    for (const it of items) { const e = srs[it.id]; if (!e) continue; a++; seen += e[2]; right += e[3]; if (e[0] >= 4) mastered++; if (e[0] === 0) wrong++; }
    const n = items.length;
    if (!a || a < Math.min(3, n)) return 0;  // not enough evidence yet
    if (mastered >= Math.ceil(n * 0.8) && !wrong) return 3;
    if ((wrong >= 2 && wrong * 2 >= a) || (wrong && seen >= 3 && right / seen < 0.5) || (a === n && wrong === a && seen >= 2)) return 1;
    return 2;
  }
  function autoRate(keys) {
    const changed = []; let wrote = false;
    for (const k of keys) {
      const items = RATE_ITEMS[k], v = items ? quizVerdict(items) : 0, e = confT[k];
      if (!v || (e && e[2] === v)) continue;  // no verdict, or the same verdict as last time: leave the rating alone
      const before = conf[k] || 0;
      confT[k] = [v, nowS(), v, 1]; wrote = true;
      if (before !== v) changed.push([k, before, v]);
    }
    if (wrote) { rebuildConf(); store.set("conf", confT); schedulePush("state"); }
    return changed;
  }
  function autoRateAll() { const ch = autoRate(Object.keys(RATE_ITEMS)); if (ch.length) updateProgressUI(); return ch; }
  function noteRated(changes) {
    if (!changes.length || !QS) return;
    QS.rated ||= {};
    for (const [k, from, to] of changes) QS.rated[k] = [k in QS.rated ? QS.rated[k][0] : from, to];
  }
  const fromQuiz = k => !!(confT[k] && confT[k][3] && confT[k][0]);

  /* ----- Answers you've marked right ----- */
  // "I was right" saves your answer for that question (accT: {itemId: [[answer, where, time], …], time]}), so it's accepted
  // from then on. A spelling or word-order variant of an accepted answer is only saved; a new point also goes into the
  // LO's notes under "My additions" (where = "notes"), or onto the drug card for drug questions (where = "drug").
  let accT = store.get("accepted", {});
  const mine = id => (accT[id] && accT[id][0]) || [];
  function saveAcc(id, list) { accT[id] = [list, nowS()]; store.set("accepted", accT); schedulePush("state"); }
  // "Apart from" questions: on a question with several right answers ("Name a…", a drug's side effects or
  // contraindications), the answer each right try used is remembered (pickT: id → [[[key, your words], … last 3], time],
  // synced). If one answer was used in 2 of the last 3 right tries, the question next asks for one apart from it; giving
  // that one again just asks for another (no penalty).
  let pickT = store.get("picks", {});
  const MULTI_RE = /^(Name|Give|State|Suggest|List) (a|an|one|any)\b/i;
  function multiAlts(it) {
    if (it.t === "sa") return MULTI_RE.test(it.q) && !it.acc.includes(" + ") && it.acc.split(" / ").length >= 3 ? it.acc.split(" / ") : null;
    if (it.t === "dse") return it.drug.se.length >= 2 ? it.drug.se : null;
    if (it.t === "dci") return it.drug.ci.length >= 2 ? it.drug.ci.map(x => x.c) : null;
    return null;
  }
  function pickKey(it, ans) {  // which accepted answer a right answer used
    if (it.t === "sa") { let best = null, len = 0; for (const alt of it.acc.split(" / ")) { const n = norm(alt); if (n.length > len && gradeSA(ans, alt)) { best = alt; len = n.length; } } return best; }
    if (it.t === "dse" || it.t === "dci") { const r = gradeList(ans, multiAlts(it) || []); return r.ok ? "#" + r.hit : null; }
    return null;
  }
  function notePick(it, ans) {
    if (!multiAlts(it)) return;
    const key = pickKey(it, ans); if (!key) return;
    const list = ((pickT[it.id] && pickT[it.id][0]) || []).concat([[key, String(ans).trim().slice(0, 60)]]).slice(-3);
    pickT[it.id] = [list, nowS()]; store.set("picks", pickT); schedulePush("state");
  }
  function usualPick(it) {  // {key, label} of the answer used in 2 of the last 3 right tries, if any
    const alts = multiAlts(it), list = (pickT[it.id] && pickT[it.id][0]) || [];
    if (!alts || list.length < 2) return null;
    const counts = {}; for (const [k] of list) counts[k] = (counts[k] || 0) + 1;
    const key = Object.keys(counts).find(k => counts[k] >= 2); if (!key) return null;
    const label = key.startsWith("#") ? alts[+key.slice(1)] : list.filter(x => x[0] === key).pop()[1];
    return label ? { key, label } : null;
  }
  function excludedHit(it, key, ans) {  // does this answer give the excluded one, and no other accepted answer?
    if (key.startsWith("#")) return pickKey(it, ans) === key;
    if (!gradeSA(ans, key)) return false;
    const others = it.acc.split(" / ").filter(a => a !== key).join(" / ");
    return !others || !gradeSA(ans, others);
  }
  function mineMatch(it, ans) {  // index of the saved answer this one matches, or -1
    if (it.t === "num") return mine(it.id).findIndex(([alt]) => { const n = parseAns(alt).nums; return n.length > 0 && gradeNum(ans, n); });
    const A = keyToks(ans);
    return mine(it.id).findIndex(([alt]) => {
      if (gradeSA(ans, alt)) return true;
      const K = keyToks(alt);
      return K.length >= 2 && K.filter(k => A.some(a => near(a, k))).length / K.length >= 0.75;
    });
  }
  // Looser than grading (the grader has already said no): one slip from 5 letters, two from 9, same first letter, and never
  // a hypo/hyper, intra/inter or ab/ad swap.
  function looseNear(a, b) {
    if (a === b) return true;
    if (!a || !b || a[0] !== b[0]) return false;
    const sw = (p, q) => (a.startsWith(p) && b.startsWith(q)) || (a.startsWith(q) && b.startsWith(p));
    if (sw("hypo", "hyper") || sw("intra", "inter") || sw("ab", "ad")) return false;
    const n = Math.max(a.length, b.length), tol = n >= 9 ? 2 : n >= 5 ? 1 : 0;
    return tol > 0 && lev(a, b, tol) <= tol;
  }
  function sameIdea(x, y) {
    const a = norm(x), b = norm(y); if (!a || !b) return false;
    const A = a.split(" "), B = b.split(" ");
    if (A.length === B.length && A.every((t, i) => looseNear(t, B[i]))) return true;
    if (looseNear(a.replace(/ /g, ""), b.replace(/ /g, ""))) return true;
    const KA = keyToks(x), KB = keyToks(y);
    return KA.length > 0 && KB.length > 0 && KA.every(t => KB.some(u => looseNear(t, u))) && KB.every(u => KA.some(t => looseNear(t, u)));
  }
  function isVariant(it, a) {
    const alts = it.t === "sa" ? [it.model, ...it.acc.split(" + ").flatMap(g => g.split(" / "))] : it.t === "dse" ? it.drug.se : it.drug.ci.map(x => x.c);
    return alts.concat(mine(it.id).map(x => x[0])).some(alt => sameIdea(a, alt));
  }
  function coveredBy(a, text) { const K = keyToks(a), T = keyToks(text || ""); return K.length > 0 && K.every(k => T.some(t => looseNear(k, t))); }
  function appendMine(html, li) {
    const tpl = document.createElement("template"); tpl.innerHTML = html || "";
    const f = tpl.content;
    let h = [...f.querySelectorAll("h4")].find(x => x.textContent.trim() === "My additions"), ul = h && h.nextElementSibling;
    if (!h) { h = document.createElement("h4"); h.textContent = "My additions"; f.appendChild(h); }
    if (!ul || ul.tagName !== "UL") { ul = document.createElement("ul"); h.after(ul); }
    const item = document.createElement("li"); item.innerHTML = li; ul.appendChild(item);
    const box = document.createElement("div"); box.appendChild(f); return cleanNote(box.innerHTML);
  }
  function setWhere(id, a, where) { const list = mine(id).map(x => x.slice()), x = list.find(y => y[0] === a); if (x) { x[1] = where; saveAcc(id, list); } }
  function learnAnswer(c) {
    const it = c.it, a = String(c.given || "").trim(); if (!a || c.q.kind !== "typed") return;
    if (mine(it.id).some(x => norm(x[0]) === norm(a))) { c.learned = { a, dup: true }; return; }
    const kind = it.t === "num" ? "num" : it.t === "sa" ? "sa" : "drug", variant = kind === "num" || isVariant(it, a);
    c.learned = { a, kind, variant, prevAcc: mine(it.id).map(x => x.slice()), where: "" };
    saveAcc(it.id, [...mine(it.id), [a, "", nowS()]]);
    if (!variant) addPoint(c);
  }
  function addPoint(c) {  // put the saved answer into the LO's notes or onto the drug card
    const L = c.learned, it = c.it;
    if (L.kind === "sa") {
      const h = loByKey[it.lo]; if (!h) return;
      if (coveredBy(L.a, h.lo.plain)) { L.covered = true; return; }
      L.prevNote = notesT[it.lo] ? notesT[it.lo].slice() : null;
      notesT[it.lo] = [appendMine(h.lo.html, `<strong>${esc(L.a)}</strong>: ${esc(it.q)}`), nowS(), notesT[it.lo] ? notesT[it.lo][2] : hashStr(h.lo.html0 || "")];
      persistNote(it.lo); L.where = "notes";
    } else if (L.kind === "drug") {
      if (coveredBy(L.a, it.drug.search)) { L.covered = true; return; }
      L.where = "drug";
    }
    if (L.where) setWhere(it.id, L.a, L.where);
  }
  function removePoint(c) {
    const L = c.learned, it = c.it;
    if (L.where === "notes") { const p = L.prevNote; notesT[it.lo] = [p ? p[0] : null, nowS(), p ? p[2] : hashStr(loByKey[it.lo].lo.html0 || "")]; persistNote(it.lo); }
    if (L.where) setWhere(it.id, L.a, "");
    L.where = ""; L.covered = false;
  }
  function undoLearn(c) {
    const L = c.learned; if (!L || L.dup || L.undone) return;
    removePoint(c); saveAcc(c.it.id, L.prevAcc || []); L.undone = true;
  }
  function learnAction(what) {
    const c = shownCard(), L = c && c.learned; if (!L || L.dup || L.undone) return;
    if (what === "undo") undoLearn(c);
    else if (what === "point") { L.variant = false; addPoint(c); }
    else if (what === "spelling") { removePoint(c); L.variant = true; }
    renderQuiz();
  }
  function learnedHTML(c) {
    const L = c.learned, it = c.it;
    if (c.unlearned) return `<div class="learned">Removed “${esc(c.unlearned)}” from your accepted answers.</div>`;
    if (!L || L.undone) return L && L.undone ? `<div class="learned">Not saved. Marked right for this round only.</div>` : "";
    if (L.dup) return `<div class="learned">You'd already saved this answer.</div>`;
    const a = `“${esc(L.a)}”`, link = (w, label) => `<button class="linkbtn" data-learn="${w}">${label}</button>`;
    let msg;
    if (L.kind === "num") msg = `Saved: ${a} now counts as right for this question.`;
    else if (L.variant) msg = `Saved ${a} as another way of writing the answer.`;
    else if (L.where === "notes") msg = `Saved ${a}: it now counts as right and is in ${loLink("your notes for this LO", it.lo)} under <b>My additions</b>.`;
    else if (L.where === "drug") msg = `Saved ${a}: it now counts as right and is on the drug card under <b>Your additions</b>.`;
    else msg = `Saved ${a}: it now counts as right. ${L.kind === "drug" ? "The drug card" : "Your notes"} already cover it.`;
    const toggle = L.kind === "num" ? "" : L.variant ? link("point", L.kind === "drug" ? "It's a new point: add it to the drug card" : "It's a new point: add it to my notes") : L.where ? link("spelling", "It's just another spelling: take it out") : "";
    return `<div class="learned">${msg} ${toggle}${link("undo", "Undo")}</div>`;
  }
  const mineHTML = id => { const l = mine(id); return l.length ? `<div class="mine-acc">Also accepted (yours): ${l.map(x => esc(x[0])).join("; ")}</div>` : ""; };
  const QRATED = '<span class="qrated" title="Set automatically from your quiz answers. Tap a rating to change it; the quiz updates it again when your results change.">from quiz</span>';
  // Due reviews first (lowest box, most overdue), then unseen, then the rest; at most perGroup per drug/ladder.
  // Review filter for the custom quizzes, by progress as on the progress bars: learning = right before but not mastered
  // (box 1–3), to redo = wrong last time (box 0), not tried = never answered. None picked = every question. cfg.learning is
  // how rounds saved before this filter asked for learning questions.
  const STATUS = [["learning", "Learning", "warn"], ["redo", "To redo", "bad"], ["new", "Not tried", "muted"]];
  const statusOf = it => { const e = srs[it.id]; return !e ? "new" : e[0] >= 4 ? "mastered" : e[0] > 0 ? "learning" : "redo"; };
  const statusPick = cfg => cfg.status && cfg.status.length ? cfg.status : cfg.learning ? ["learning"] : [];
  const byStatus = (items, cfg) => { const st = statusPick(cfg); return st.length ? items.filter(it => st.includes(statusOf(it))) : items; };
  const statusTitle = cfg => { const st = statusPick(cfg); return st.length ? ": " + STATUS.filter(x => st.includes(x[0])).map(x => x[1].toLowerCase()).join(" + ") : ""; };
  const noStatus = cfg => ({ ...cfg, status: [], learning: false });
  // Search quiz: a question matches when every word of the term starts a word in its text (question, answers, hint,
  // explanation, ladder steps; for drug drills the drug card) or in its learning outcome. A plural "s" is dropped from the
  // term ("nerves" finds "nerve"), and accents and punctuation are ignored.
  const fold = x => " " + String(x).replace(/β/g, " beta ").replace(/α/g, " alpha ").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/<[^>]+>/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  function hayOf(it) {
    if (it.hay) return it.hay;
    const parts = [it.q, it.acc, it.model, it.hint, it.why, it.shown, it.title, ...(it.steps || []), ...(it.whys || []), ...(it.items || []).map(x => x[0] + " " + (x[2] || ""))];
    if (it.drug) { const d = it.drug; parts.push(d.name, d.ex, d.how, ...d.se, ...d.uses.map(u => u.t), ...d.ci.map(c => c.c + " " + c.why)); }
    for (const k of it.los) { const h = loByKey[k]; if (h && !it.drug) parts.push(h.lo.text); }
    return it.hay = fold(parts.filter(x => typeof x === "string").join(" "));
  }
  // Umbrella terms also find questions that only name a member (searching "statins" finds atorvastatin).
  const SEARCH_ALSO = {
    "cranial nerve": "olfactory|optic nerve|oculomotor|trochlear|trigeminal|abducens|facial nerve|facial palsy|bell palsy|vestibulocochlear|glossopharyngeal|vagus|accessory nerve|hypoglossal",
    "rotator cuff": "supraspinatus|infraspinatus|teres minor|subscapularis",
    "brachial plexus": "musculocutaneous|axillary nerve|radial nerve|median nerve|ulnar nerve|erb palsy|klumpke",
    "anticoagulant": "warfarin|heparin|enoxaparin|doac|apixaban|rivaroxaban|edoxaban|dabigatran",
    "antiplatelet": "aspirin|clopidogrel|ticagrelor|prasugrel",
    "diuretic": "furosemide|bumetanide|bendroflumethiazide|indapamide|spironolactone|eplerenone|amiloride|thiazide",
    "opioid": "morphine|oxycodone|codeine|fentanyl|tramadol|diamorphine|buprenorphine|methadone|naloxone",
    "statin": "atorvastatin|simvastatin|rosuvastatin|pravastatin",
    "beta blocker": "bisoprolol|atenolol|propranolol|metoprolol|carvedilol|labetalol|sotalol",
    "ace inhibitor": "ramipril|lisinopril|enalapril|perindopril",
    "nsaid": "ibuprofen|naproxen|diclofenac|celecoxib|indometacin",
    "ssri": "sertraline|citalopram|escitalopram|fluoxetine|paroxetine"
  };
  const termWords = q => fold(q || "").trim().split(" ").filter(Boolean).map(w => w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);
  const searchAlso = term => (SEARCH_ALSO[termWords(term).join(" ")] || "").split("|").filter(Boolean);
  function termTest(term) {
    const main = termWords(term); if (!main.length) return null;
    const alts = [main, ...searchAlso(term).map(termWords)];
    return it => { const h = hayOf(it); return alts.some(ws => ws.every(w => h.includes(" " + w))); };
  }
  function statusHTML(cfg, countFor, attrs) {
    const st = statusPick(cfg);
    return `<div class="review"><h3>Review</h3><div class="levels"><div class="chips" role="group" aria-label="Review by progress">${STATUS.map(([id, label, col]) => `<button class="chip" ${attrs(id)} aria-pressed="${st.includes(id)}"><span class="dot" style="background:var(--${col})"></span>${label} <span class="ct">${countFor(id)}</span></button>`).join("")}</div><span class="lvhint">Learning: right before, not yet mastered · To redo: wrong last time · Not tried: never answered. Leave all off for every question.</span></div></div>`;
  }
  function choose(items, n, perGroup = 1) {
    const T = dayNum(), due = [], fresh = [], rest = [];
    for (const it of items) { const e = srs[it.id]; (!e ? fresh : e[1] <= T ? due : rest).push(it); }
    due.sort((a, b) => srs[a.id][0] - srs[b.id][0] || srs[a.id][1] - srs[b.id][1]);
    rest.sort((a, b) => srs[a.id][1] - srs[b.id][1]);
    const order = [...due, ...shuffle(fresh), ...rest], out = [], per = {}, taken = new Set();
    for (const it of order) { if (out.length >= n) break; if ((per[it.grp] || 0) >= perGroup) continue; per[it.grp] = (per[it.grp] || 0) + 1; out.push(it); taken.add(it); }
    for (const it of order) { if (out.length >= n) break; if (!taken.has(it)) { out.push(it); taken.add(it); } }
    return shuffle(out);
  }
  function stats() {
    const T = dayNum(); let seen = 0, right = 0, due = 0, mastered = 0;
    for (const id in srs) { const it = ITEM[id]; if (!it) continue; const e = srs[id]; seen += e[2]; right += e[3]; if (e[1] <= T && inLevel(it)) due++; if (e[0] >= 4) mastered++; }
    const d = meta.daily;
    return { seen, right, due, mastered, streak: d.last >= T - 1 ? d.streak : 0, doneToday: d.last === T };
  }
  function shakyLos() {
    const set = new Set(Object.keys(conf).filter(k => conf[k] <= 2 && loByKey[k])), agg = {};
    for (const id in srs) { const it = ITEM[id]; if (!it || !it.lo) continue; const a = agg[it.lo] ||= [0, 0]; a[0] += srs[id][2]; a[1] += srs[id][3]; }
    for (const k in agg) if (agg[k][0] >= 2 && agg[k][1] / agg[k][0] < 0.6) set.add(k);
    return set;
  }
  // Teaching weeks reached so far: all of Year 1, and each Year 2 week from its Monday. Checked against today's date each
  // time, so new weeks join Daily 10, "10 more" and the sprint on their own. A drug question counts once any linked week does.
  const weekReached = w => !!w && ((w.year !== "y2" && !w.link) || !w.date || new Date(w.date + "T00:00:00") <= new Date());
  const covered = it => !it.weeks.length || it.weeks.some(id => weekReached(weeksById[id]));
  function reachedNote() {
    const ws = DATA.y2.filter(weekReached), last = ws[ws.length - 1], next = DATA.y2.find(w => !weekReached(w));
    const nextTxt = next && next.date ? ` Week ${next.num} joins on ${new Date(next.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}.` : "";
    return last ? `Covers Year 1 and Year 2 up to week ${last.num}.${nextTxt}` : `Covers Year 1 only for now.${nextTxt}`;
  }
  function recentWeeks() {
    const withNotes = DATA.y2.filter(w => w.hasNotes), dated = withNotes.filter(w => w.date && new Date(w.date + "T00:00:00") <= TODAY);
    return (dated.length ? dated.slice(-3) : withNotes.slice(0, 3)).map(w => w.id);
  }
  function quizWeek() { if (NOW && NOW.hasNotes) return NOW; const r = recentWeeks(); return weeksById[r[r.length - 1]]; }

  /* ----- Sessions ----- */
  let QS = null, tick = null;
  function startSession(o) {
    if (!o.items.length) { state.qnote = o.empty || "No questions match that yet."; state.qscreen = o.back || "home"; return showQuiz(true); }
    stopTimer();
    if (QS && !QS.done && !QS.timed && QS.n > 0) addHistory(QS, snapSession(QS), true);  // keep the unfinished round to carry on later
    QS = { mcq: false, focus: null, ...o, queue: o.items.slice(), n: 0, right: 0, results: [], requeued: new Set(), done: false, cur: null, past: [], view: null, uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), started: Date.now() };
    if (QS.timed) { QS.end = Date.now() + QS.timed * 1000; startTimer(); }
    state.qscreen = "session";
    nextQuestion(); showQuiz(true);
  }
  function nextQuestion() {
    if (QS.cur && QS.cur.answered) QS.past.push(QS.cur);
    QS.cur = null; QS.view = null;  // so finish() doesn't add the last card twice
    if (QS.timed && Date.now() >= QS.end) { QS.cur = null; return finish(); }
    const it = QS.queue.shift();
    if (!it) return finish();
    const seed = (Math.random() * 2147483647) | 0;
    QS.cur = { it, seed, q: instSeeded(it, QS, seed), answered: false, placed: [], again: QS.requeued.has(it.id) };
    if (QS.cur.again && QS.cur.q.kind === "list") listCarry(QS.cur);
    if (!QS.timed && QS.cur.q.kind === "typed") { const ex = usualPick(it); if (ex) QS.cur.excl = ex; }
  }
  function submit(p) {
    const c = QS && QS.cur; if (!c || c.answered || QS.done) return;
    let ok;
    if (c.q.kind === "typed") {
      if (!p.skip && !String(p.text || "").trim()) return;
      if (!p.skip && c.excl && excludedHit(c.it, c.excl.key, p.text)) { c.exclMsg = `That's the one you usually give. Name a different one.`; renderQuiz(); return; }
      const r = p.skip ? { ok: false } : c.q.grade(p.text);
      c.given = p.text; c.skipped = !!p.skip; c.hit = r.hit; c.mineHit = r.mine; ok = !!r.ok;
    } else if (c.q.kind === "mcq") { c.choice = p.choice; ok = p.choice === c.q.right; }
    else if (c.q.kind === "list") { c.log = c.log || []; c.skipped = !c.log.length; c.given = c.log.map(e => e.t).join(", "); c.msg = ""; ok = listOk(c); }
    else { c.given = p.order.slice(); ok = c.given.every((v, i) => v === i); }
    if (ok && c.q.kind === "typed" && !(c.mineHit >= 0)) notePick(c.it, p.text);
    c.answered = true; c.ok = ok; c.at = Date.now(); c.prev = srs[c.it.id]; c.exclMsg = "";
    record(c.it.id, ok, !!c.hinted, c.again);
    QS.n++; if (ok) QS.right++;
    c.res = { it: c.it, q: c.q, ok, hinted: !!c.hinted }; QS.results.push(c.res);
    if (!ok || c.hinted) requeue(c);
    if (QS.timed) setTimeout(() => { if (QS && QS.cur === c && !QS.done) { nextQuestion(); if (state.year === "quiz" && state.qscreen === "session") renderQuiz(); } }, ok ? 300 : 1100);
    renderQuiz();
  }
  function requeue(c) {
    if (QS.timed || QS.requeued.has(c.it.id)) return;
    QS.requeued.add(c.it.id); QS.queue.splice(Math.min(3, QS.queue.length), 0, c.it); c.requeuedNow = true;
  }
  // Looking back: QS.past holds every answered question in order; QS.view is the one on screen (null = the live question,
  // or the results once the round is over). Not in the timed sprint.
  const shownCard = () => QS && QS.view != null ? QS.past[QS.view] : QS && QS.cur;
  const canLookBack = () => !!QS && !QS.timed && QS.past.length > 0;
  function reviewGo(d) {
    if (!canLookBack()) return;
    const n = QS.past.length, i = (QS.view == null ? n : QS.view) + d;
    QS.view = i < 0 ? 0 : i >= n ? null : i;
    renderQuiz(true);
  }
  // A past answer can still be corrected unless that question came up again later in the round. The live card (including
  // a second try) has nothing after it, so it can always be corrected.
  const laterTries = c => { const i = QS.past.indexOf(c); return i < 0 ? [] : QS.past.slice(i + 1).concat(QS.cur && QS.cur !== c ? [QS.cur] : []).filter(x => x.it.id === c.it.id && x.answered); };
  const canOverride = c => (c.q.kind === "typed" || c.q.kind === "list") && !c.skipped && !laterTries(c).length;
  // Rescore an answered card: its spaced-repetition record goes back to before this try, then it's recorded again.
  function setResult(c, ok) {
    if (c.prev) srs[c.it.id] = c.prev; else delete srs[c.it.id];
    record(c.it.id, ok, !!c.hinted, c.again);
    QS.right += ok ? 1 : -1; c.ok = ok; c.res.ok = ok; c.overridden = true;
    if (ok && !c.hinted && c.requeuedNow) { const i = QS.queue.indexOf(c.it); if (i >= 0) QS.queue.splice(i, 1); QS.requeued.delete(c.it.id); c.requeuedNow = false; }
    if (!ok) requeue(c);
  }
  function override() {
    const c = shownCard(); if (!c || !c.answered || !canOverride(c)) return;
    const ok = !c.ok;
    setResult(c, ok);
    if (c.q.kind === "list") c.manual = ok;
    if (c.q.kind === "typed") {
      if (ok) { c.unlearned = null; if (c.learned && c.learned.undone) c.learned = null; learnAnswer(c); }
      else if (c.learned && !c.learned.dup) { undoLearn(c); c.learned = null; }
      else if (c.mineHit >= 0) { const l = mine(c.it.id).slice(), [gone] = l.splice(c.mineHit, 1); if (gone) { saveAcc(c.it.id, l); c.unlearned = gone[0]; c.mineHit = -1; } }
    }
    if (c.again) syncFirstTry(c, ok);
    renderQuiz();
  }
  // "I was right" on a second try: once the answer is saved, if the first try's answer is accepted too (usually the same
  // answer), that try counts as right as well and the question is scheduled as if it was right first time.
  // "Actually, I was wrong" puts both back.
  function syncFirstTry(c, ok) {
    const first = QS.past.find(x => x !== c && x.it.id === c.it.id && x.answered && x.q.kind === "typed");
    if (!first) return;
    if (ok && !first.ok && !first.skipped && first.q.grade(first.given).ok) {
      if (first.prev) srs[c.it.id] = first.prev; else delete srs[c.it.id];
      record(c.it.id, true, !!first.hinted, false); record(c.it.id, true, !!c.hinted, true);
      first.ok = first.res.ok = true; first.overridden = true; QS.right++; c.firstFixed = first;
    } else if (!ok && c.firstFixed) {
      const f = c.firstFixed; c.firstFixed = null;
      f.ok = f.res.ok = false; f.overridden = false; QS.right--;
    }
  }
  function finish(early) {
    stopTimer();
    const left = !QS.timed && (QS.queue.length || (QS.cur && !QS.cur.answered)) ? snapSession(QS) : null;
    if (QS.cur && QS.cur.answered) QS.past.push(QS.cur);
    QS.done = true; QS.cur = null; QS.view = null; QS.early = !!early;
    if ((QS.mode === "daily" || QS.mode === "adaily" || QS.mode === "idaily") && !early) {
      const T = dayNum(), d = meta[QS.mode];
      if (d.last !== T) { d.streak = d.last === T - 1 ? d.streak + 1 : 1; d.last = T; d.best = Math.max(d.best || 0, d.streak); saveMeta(); }
    }
    if (QS.mode === "sprint") { QS.prevBest = meta.sprintBest || 0; if (QS.right > QS.prevBest) { meta.sprintBest = QS.right; saveMeta(); } }
    addHistory(QS, early ? left : null, false); store.set("qround", null);
  }

  /* ----- Rounds that survive closing the app, and the quiz history ----- */
  // Each card keeps the seed its question was built with, so a saved round rebuilds exactly as it was (same options in
  // the same order). The round in progress is saved after every change (lorev:qround). Starting another quiz, or ending
  // one early, puts the unfinished round into the history with what's needed to carry on (newest 6 only).
  // History: lorev:qhist, newest first, up to 150 rounds; it stays on this device.
  const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  function instSeeded(it, S, seed) { const r = Math.random; Math.random = seeded(seed); try { return inst(it, S); } finally { Math.random = r; } }
  function sessionHooks(sp) {
    sp = sp || {};
    const keyset = ks => { const s = new Set(ks || []); return k => s.has(k); };
    switch (sp.k) {
      case "daily": return { more: () => startDaily(true) };
      case "cont": return { more: startContinue };
      case "due": return { more: () => startDue(sp.n) };
      case "shaky": return { focus: keyset(sp.keys), more: startShaky };
      case "custom": return { focus: customFocus(sp.cfg), more: () => startCustom(sp.cfg) };
      case "week": return { focus: k => weekOf(k) === sp.w || LINK.anat[k] === sp.w || LINK.icm[k] === sp.w, more: () => startWeekQuiz(sp.w) };
      case "lo": return { focus: k => k === sp.key, more: () => startLoQuiz(sp.key) };
      case "drug": return { more: () => startDrugQuiz(sp.id) };
      case "sprint": return { more: startSprint };
      case "mastered": return { more: startMasteredQuiz };
      case "iexam": { const keys = examKeys(sp.cfg); return { focus: k => keys.has(k), more: () => startExamQuiz(sp.cfg) }; }
      case "retry": return sessionHooks(sp.parent);
    }
    if (GMODE[sp.k]) {
      const [g, m] = GMODE[sp.k];
      if (m === "daily" || m === "extra") return { more: () => startGDaily(g, true) };
      if (m === "due") return { more: () => startGDue(g, sp.n) };
      if (m === "shaky") return { focus: keyset(sp.keys), more: () => startGShaky(g) };
      if (m === "custom") return { focus: gFocus(g, sp.cfg), more: () => startGCustom(g, sp.cfg) };
    }
    return {};
  }
  const CARD_KEYS = ["excl", "manual", "log", "matches", "alias", "xtra", "added", "seed", "answered", "ok", "hinted", "removed", "placed", "again", "given", "choice", "skipped", "hit", "mineHit", "overridden", "requeuedNow", "prev", "at", "learned", "unlearned"];
  function snapCard(c, past) {
    const o = { id: c.it.id };
    for (const k of CARD_KEYS) if (c[k] != null && c[k] !== false) o[k] = c[k];
    if (c.firstFixed) o.ff = past.indexOf(c.firstFixed);
    return o;
  }
  const snapSession = S => ({ uid: S.uid, mode: S.mode, title: S.title, mcq: !!S.mcq, spec: S.spec || null, back: S.back, empty: S.empty, started: S.started, n: S.n, right: S.right,
    queue: S.queue.map(it => it.id), requeued: [...S.requeued], past: S.past.map(c => snapCard(c, S.past)), cur: S.cur ? snapCard(S.cur, S.past) : null });
  function restoreSession(s) {
    const S = { mode: s.mode, title: s.title, mcq: !!s.mcq, spec: s.spec, back: s.back, empty: s.empty, uid: s.uid, started: s.started, focus: null, ...sessionHooks(s.spec) };
    const mk = x => { const it = ITEM[x.id]; if (!it) return null; const c = { answered: false, placed: [], ...x, it }; delete c.id; delete c.ff; c.q = instSeeded(it, S, x.seed || 0); if (c.answered) c.res = { it, q: c.q, ok: !!c.ok, hinted: !!c.hinted }; return c; };
    const past = s.past.map(mk), cur = s.cur ? mk(s.cur) : null;
    s.past.forEach((x, i) => { if (past[i] && x.ff >= 0 && past[x.ff]) past[i].firstFixed = past[x.ff]; });
    if (cur && s.cur.ff >= 0 && past[s.cur.ff]) cur.firstFixed = past[s.cur.ff];
    const kept = past.filter(Boolean);
    return { ...S, items: [], queue: s.queue.map(id => ITEM[id]).filter(Boolean), n: s.n, right: s.right, requeued: new Set(s.requeued), done: false, past: kept, cur, view: null,
      results: kept.concat(cur && cur.answered ? [cur] : []).map(c => c.res) };
  }
  function saveRound() { if (!QS || QS.timed) return; store.set("qround", QS.done ? null : snapSession(QS)); }
  let HIST = null;
  const histList = () => HIST || (HIST = store.get("qhist", []));
  const setHist = h => { HIST = h; store.set("qhist", h); };
  function addHistory(S, resume, paused) {
    if (!S.n) return;
    const cards = S.past.concat(S.cur && S.cur.answered && !S.past.includes(S.cur) ? [S.cur] : []).filter(c => c.answered);
    const firsts = new Map(); for (const c of cards) if (!firsts.has(c.it.id)) firsts.set(c.it.id, c);
    const e = { uid: S.uid, mode: S.mode, title: S.title, mcq: !!S.mcq, spec: S.spec || null, timed: S.timed || 0, started: S.started || Date.now(), ended: Date.now(),
      n: S.n, right: S.right, qs: firsts.size, firstRight: [...firsts.values()].filter(c => c.ok && !c.hinted).length, paused: !!paused, early: !!S.early && !paused,
      cards: cards.map(c => { const o = { i: c.it.id, s: c.seed || 0, o: c.ok ? 1 : 0 }; if (c.hinted) o.h = 1; if (c.again) o.a = 1; if (c.skipped) o.k = 1; if (typeof c.given === "string") o.g = c.given.slice(0, 160); if (c.choice != null) o.c = c.choice; return o; }),
      resume: resume || null };
    const h = histList().filter(x => x.uid !== e.uid); h.unshift(e);
    let keep = 0; for (const x of h) if (x.resume && ++keep > 6) x.resume = null;
    setHist(h.slice(0, 150));
  }
  const leftIn = s => s.queue.length + (s.cur && !s.cur.answered ? 1 : 0);
  function carryOn(uid) {
    if (uid === "live") { if (QS && !QS.done) { state.qscreen = "session"; showQuiz(true); } return; }
    const e = histList().find(x => x.uid === uid); if (!e || !e.resume) return;
    if (QS && !QS.done && !QS.timed && QS.n > 0 && QS.uid !== uid) addHistory(QS, snapSession(QS), true);
    stopTimer();
    setHist(histList().filter(x => x.uid !== uid));
    QS = restoreSession(e.resume);
    if (!QS.cur) nextQuestion();
    state.qscreen = QS.done ? "home" : "session"; showQuiz(true);
  }
  const resumable = () => QS && !QS.done && !QS.timed && (QS.n > 0 || QS.cur && QS.cur.answered) ? { live: true, title: QS.title, n: QS.n, right: QS.right, left: leftIn(QS) }
    : (e => e ? { uid: e.uid, title: e.title, n: e.n, right: e.right, left: leftIn(e.resume), when: e.ended } : null)(histList().find(x => x.resume));
  function whenText(ts) {
    const d = new Date(ts), day = Math.floor((d - d.getTimezoneOffset() * 60000) / 86400000), T = dayNum();
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return day === T ? `Today ${time}` : day === T - 1 ? `Yesterday ${time}` : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
  }
  const histScore = e => e.timed ? `${e.right} right in ${e.timed} s` : `${e.firstRight} of ${e.qs} right first time`;
  const histStatus = e => e.paused ? `Paused · ${leftIn(e.resume || { queue: [] })} left` : e.early ? (e.resume ? `Ended early · ${leftIn(e.resume)} left` : "Ended early") : "Finished";
  const histPct = e => e.timed ? "" : e.qs ? Math.round(e.firstRight / e.qs * 100) + "%" : "";
  function histRow(e) {
    const mins = Math.max(1, Math.round((e.ended - e.started) / 60000));
    return `<div class="hrow"><button class="dlink hlink" data-hist="${e.uid}"><span class="dl-name">${esc(e.title)}</span><span class="dl-sub">${whenText(e.ended)} · ${histScore(e)} · ${mins} min · ${histStatus(e)}</span><span class="hpct">${histPct(e)}</span></button>${e.resume ? `<button class="btn" data-carry="${e.uid}">Carry on</button>` : ""}</div>`;
  }
  function liveRow() {
    const r = resumable(); if (!r || !r.live) return "";
    return `<div class="resume"><span><b>${esc(r.title)}</b> in progress · ${r.n} answered · ${r.right} right · ${r.left} left</span><button class="btn pri" id="q-resume">Carry on</button></div>`;
  }
  function histHTML() {
    const h = histList(), byDay = new Map();
    for (const e of h) { const k = new Date(e.ended).toDateString(); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
    const total = h.reduce((a, e) => a + e.n, 0);
    return `<div class="qz"><header class="week-head"><div class="eyebrow">Quiz</div><h2>Quiz history</h2>
      <div class="meta"><span><b>${h.length}</b> round${h.length === 1 ? "" : "s"}</span><span><b>${total.toLocaleString("en-GB")}</b> answers</span><span>Kept on this device</span></div></header>
      ${liveRow()}
      ${h.length ? [...byDay.values()].map(list => `<section class="psec"><h3>${whenText(list[0].ended).replace(/ \d\d:\d\d$/, "").replace(/,$/, "")}</h3><div class="hlist">${list.map(histRow).join("")}</div></section>`).join("")
        : `<p class="pending-note">No quizzes yet. Finished, paused and ended rounds will show here.</p>`}
    </div>`;
  }
  function histOneHTML() {
    const e = histList().find(x => x.uid === state.histUid);
    if (!e) return `<div class="qz"><p class="pending-note">That round isn't in your history any more.</p><div class="fb-actions"><button class="btn" data-qmode="hist">Quiz history</button></div></div>`;
    const S = { mcq: e.mcq, focus: null, ...sessionHooks(e.spec) }, plain = h => String(h || "").replace(/<small>.*?<\/small>/g, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    const missed = [...new Set(e.cards.filter(c => !c.o || c.h).map(c => c.i))].filter(id => ITEM[id]);
    const rows = e.cards.map((c, i) => {
      const it = ITEM[c.i]; if (!it) return "";
      const q = instSeeded(it, S, c.s);
      const yours = c.k ? "Didn't know" : typeof c.g === "string" ? c.g : q.kind === "mcq" && c.c != null && q.opts[c.c] != null ? plain(q.opts[c.c]) : q.kind === "order" ? (c.o ? "Right order" : "Wrong order") : "";
      const mark = c.o ? (c.h ? "½" : "✓") : "✗";
      return `<div class="hq ${c.o ? (c.h ? "hint" : "ok") : "no"}"><span class="hmark" aria-label="${c.o ? (c.h ? "right with a hint" : "right") : "wrong"}">${mark}</span><div class="hbody"><b>${i + 1}. ${plain(q.prompt)}${c.a ? `<span class="hagain">2nd try</span>` : ""}</b>${yours ? `<span class="hyours">Your answer: ${esc(yours)}</span>` : ""}<span class="hans">${esc(q.answerText || "")}</span>${q.lo && loByKey[q.lo] ? loLink("Open the notes", q.lo) : ""}</div></div>`;
    }).join("");
    const mins = Math.max(1, Math.round((e.ended - e.started) / 60000)), more = sessionHooks(e.spec).more;
    return `<div class="qz"><header class="week-head"><div class="eyebrow">Quiz history · ${whenText(e.ended)}</div><h2>${esc(e.title)}</h2>
      <div class="meta"><span><b>${histScore(e)}</b></span><span>${e.n} answers · ${mins} min</span><span>${histStatus(e)}</span></div></header>
      <div class="fb-actions">${e.resume ? `<button class="btn pri" data-carry="${e.uid}">Carry on · ${leftIn(e.resume)} left</button>` : ""}${missed.length ? `<button class="btn${e.resume ? "" : " pri"}" id="h-retry">Retry the ${missed.length} I missed or needed a hint for</button>` : ""}${more ? `<button class="btn ghost" id="h-again">Another round like this</button>` : ""}<button class="btn ghost" data-qmode="hist">All quiz history</button></div>
      <section class="hqs">${rows}</section></div>`;
  }
  function histRetry() {
    const e = histList().find(x => x.uid === state.histUid); if (!e) return;
    const items = [...new Set(e.cards.filter(c => !c.o || c.h).map(c => c.i))].map(id => ITEM[id]).filter(Boolean);
    startSession({ mode: "retry", title: "Missed questions", items: shuffle(items), mcq: e.mcq, spec: { k: "retry", parent: e.spec }, focus: null, ...sessionHooks(e.spec) });
  }
  function startTimer() {
    stopTimer();
    tick = setInterval(() => {
      if (!QS || !QS.timed || QS.done) return stopTimer();
      const left = QS.end - Date.now(), bar = $("#qtimer"), secs = $("#qsecs");
      if (bar) bar.style.width = Math.max(0, left / (QS.timed * 1000) * 100) + "%";
      if (secs) secs.textContent = Math.max(0, Math.ceil(left / 1000)) + "s left";
      if (left <= 0) { finish(); if (state.year === "quiz" && !state.query.trim()) { renderNav(); renderQuiz(true); } }
    }, 100);
  }
  function stopTimer() { clearInterval(tick); tick = null; }
  function place(i) { const c = QS.cur; if (c.answered || c.placed.includes(i)) return; c.placed.push(i); renderQuiz(); if (c.placed.length === c.q.steps.length) { const b = $("#q-check"); if (b) b.focus(); } }
  function unplace(p) { const c = QS.cur; if (c.answered) return; c.placed.splice(p, 1); renderQuiz(); }
  function missedItems() { const seen = new Set(), out = []; for (const r of QS.results) if ((!r.ok || r.hinted) && !seen.has(r.it.id)) { seen.add(r.it.id); out.push(r.it); } return out; }
  function useHint() {
    const c = QS && QS.cur; if (!c || c.answered || c.hinted || !c.q.hint || QS.done) return;
    c.hinted = true;
    if (c.q.hint.fifty) { const wrong = c.q.opts.map((_, i) => i).filter(i => i !== c.q.right); c.removed = pickN(wrong, Math.min(2, wrong.length - 1)); }
    if (c.q.hint.first) c.placed = [0];
    const inp = $("#qans") || $("#qlist"), typed = inp ? inp.value : null;
    renderQuiz();
    const again = $("#qans") || $("#qlist"); if (again && typed != null) { again.value = typed; again.focus(); }
  }

  function startDaily(extra) {
    if (!extra && QS && !QS.done && QS.mode === "daily") { state.qscreen = "session"; return showQuiz(true); }
    const T = dayNum(), recent = new Set(recentWeeks());
    const pool = POOL.filter(it => !it.sep && inLevel(it) && covered(it));
    let items = extra ? [] : choose(pool.filter(it => srs[it.id] && srs[it.id][1] <= T), 6);
    const fill = list => { if (items.length < 10) { const have = new Set(items); items = items.concat(choose(list.filter(it => !have.has(it)), 10 - items.length)); } };
    fill(pool.filter(it => !srs[it.id] && it.weeks.some(w => recent.has(w))));
    fill(pool.filter(it => !srs[it.id]));
    fill(pool);
    startSession({ mode: extra ? "extra" : "daily", title: extra ? "10 more" : "Daily 10", items: shuffle(items), spec: { k: "daily" }, more: () => startDaily(true) });
  }
  /* ----- Continue learning: new questions on what you've been doing lately ----- */
  // Topics come from recent activity: questions answered in the last 3 weeks (the time on their srs record; each counts
  // half as much every 3 days, a wrong one a little more) and the note weeks you've opened (lorev:seenw, this device).
  // Questions you've never answered score by how close they sit to those topics: the same LO or drug most, then the same
  // week, ICM/anatomy page or drug group, then the same body system (weeks already reached only). A drug drill counts less
  // the more uses its drug has. A round takes the best-scoring new questions, one per question group; at first at most 4
  // per LO, 12 from one week and 8 drug drills, so it mixes topics, then without those limits if it's still short. It
  // only tops up with related questions that are due again (not mastered, not answered in the last 12 hours) when new
  // ones run out.
  // Questions come grouped by week, so a round moves through a few topics rather than jumping about.
  let seenW = store.get("seenw", {});
  function noteSeen(id) {
    seenW[id] = nowS();
    const ks = Object.keys(seenW).sort((a, b) => seenW[b] - seenW[a]); for (const k of ks.slice(40)) delete seenW[k];
    store.set("seenw", seenW);
  }
  const CONT_N = 20, CONT_DAYS = 21, CONT_HALF = 3;
  const itemWeeks = it => [...new Set([...it.weeks, ...it.gw.anat, ...it.gw.icm])];
  const SYS_OF = {}; for (const sy of SYSTEMS) { for (const w of sy.weeks) (SYS_OF[w] ||= []).push(sy.id); for (const c of sy.cats) (SYS_OF["dcat:" + c] ||= []).push(sy.id); }
  function contTopics(now = nowS()) {
    const t = { lo: {}, wk: {}, drug: {}, cat: {}, sys: {}, n: 0 }, cutoff = now - CONT_DAYS * 86400, add = (m, k, v) => { m[k] = (m[k] || 0) + v; };
    const decay = at => Math.pow(0.5, (now - at) / (CONT_HALF * 86400));
    for (const id in srs) {
      const e = srs[id], it = ITEM[id]; if (!it || !e[4] || e[4] < cutoff) continue;
      const v = decay(e[4]) * (e[0] === 0 ? 1.3 : 1); t.n++;
      const share = it.drug ? 1 / Math.sqrt(Math.max(1, it.los.length)) : 1;  // a drug's many uses share its weight
      for (const k of it.los) add(t.lo, k, v * share);
      for (const w of itemWeeks(it)) add(t.wk, w, v * share);
      if (it.drug) { add(t.drug, it.drug.id, v); add(t.cat, it.cat, v); }
    }
    for (const id in seenW) if (seenW[id] >= cutoff && weeksById[id]) add(t.wk, id, 0.8 * decay(seenW[id]));
    if (!Object.keys(t.wk).length && !Object.keys(t.cat).length) { const w = quizWeek(); if (w) t.wk[w.id] = 0.5; }  // nothing yet: this week
    for (const [k, v] of Object.entries(t.wk).concat(Object.entries(t.cat).map(([c, v]) => ["dcat:" + c, v]))) for (const sy of SYS_OF[k] || []) t.sys[sy] = Math.max(t.sys[sy] || 0, v);
    return t;
  }
  function contScore(it, t) {
    let a = 0, b = 0, c = 0;
    const share = it.drug ? 1 / Math.sqrt(Math.max(1, it.los.length)) : 1;
    for (const k of it.los) a = Math.max(a, (t.lo[k] || 0) * share);
    for (const w of itemWeeks(it)) b = Math.max(b, (t.wk[w] || 0) * share);
    if (it.drug) { a += t.drug[it.drug.id] || 0; b = Math.max(b, t.cat[it.cat] || 0); }
    if (covered(it)) for (const k of it.weeks.concat(it.drug ? ["dcat:" + it.cat] : [])) for (const sy of SYS_OF[k] || []) c = Math.max(c, t.sys[sy] || 0);
    const close = a + 0.5 * b;
    return { close, score: Math.max(close, 0.15 * c) };
  }
  function contLabels(t, n = 4) {  // the recent topics in words: weeks and pages, and drugs
    const best = new Map();
    for (const [id, v] of Object.entries(t.wk)) {
      const w = weeksById[id]; if (!w || w.hidden || (w.year === "anat" && isLinked(w))) continue;
      const label = w.year === "icm" && w.yr ? `${w.title} (ICM Y${w.yr})` : w.year === "anat" ? `${w.title} (anatomy)` : w.title;
      best.set(label, Math.max(best.get(label) || 0, v));
    }
    for (const [id, v] of Object.entries(t.drug)) if (drugById[id]) best.set(drugById[id].name, Math.max(best.get(drugById[id].name) || 0, v));
    return [...best.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(x => x[0]);
  }
  function contPlan(n = CONT_N) {
    const t = contTopics(), T = dayNum(), now = nowS(), fresh = [], again = [];
    let close = 0;
    for (const it of POOL) {
      if (!inLevel(it)) continue;
      const e = srs[it.id];
      if (e && !(e[1] <= T && e[0] < 4 && now - (e[4] || 0) > 12 * 3600)) continue;
      const sc = contScore(it, t); if (sc.score < 0.001) continue;
      if (!e && sc.close > 0) close++;
      (e ? again : fresh).push({ it, sc: sc.score * (0.85 + Math.random() * 0.3) });
    }
    const home = it => it.drug ? "dcat:" + it.cat : it.gw.icm[0] || it.weeks[0] || it.gw.anat[0] || "";  // ICM page, else teaching week
    const pick = [], grp = new Set(), cnt = {}, inc = k => { cnt[k] = (cnt[k] || 0) + 1; };
    const take = (list, mix) => {
      for (const x of list) {
        if (pick.length >= n) return;
        const it = x.it, lk = "lo:" + (it.drug ? it.drug.id : it.los[0] || it.id), hk = "wk:" + home(it);
        if (grp.has(it.grp)) continue;
        if (mix && ((cnt[lk] || 0) >= 4 || (cnt[hk] || 0) >= Math.ceil(n * 0.6) || (it.drug && (cnt.drug || 0) >= Math.ceil(n * 0.4)))) continue;
        grp.add(it.grp); inc(lk); inc(hk); if (it.drug) inc("drug"); pick.push(x);
      }
    };
    fresh.sort((x, y) => y.sc - x.sc); again.sort((x, y) => y.sc - x.sc);
    take(fresh, true); take(fresh, false);
    const nNew = pick.length;
    take(again, true); take(again, false);
    const groups = new Map();  // grouped by week (drug drills by drug group), best group first
    for (const x of pick) { const h = home(x.it); if (!groups.has(h)) groups.set(h, []); groups.get(h).push(x.it); }
    const focus = Object.entries(t.lo).sort((x, y) => y[1] - x[1]).slice(0, 40).map(x => x[0]);
    return { items: [...groups.values()].flatMap(g => shuffle(g)), nNew, nAgain: pick.length - nNew, close, topics: contLabels(t), focus, active: t.n };
  }
  function startContinue() {
    const cp = contPlan(), keys = new Set(cp.focus);
    startSession({ mode: "cont", title: "Continue learning", items: cp.items, spec: { k: "cont" }, focus: k => keys.has(k), more: startContinue, empty: "Nothing new to continue with at this level. Try another level, or the Daily 10." });
  }
  const contText = cp => cp.topics.length ? `New questions on ${cp.topics.slice(0, 3).join(" · ")}${cp.topics.length > 3 ? " and more" : ""}` : "New questions on this week's topic";

  /* ----- Section quizzes (Anatomy, ICM): own Daily 10 with its own streak, review, drills, custom quiz, quiz a week ----- */
  // Mode names use the section's letter (adaily, aextra, adue, ashaky, acustom; idaily, …) so saved streaks and history match.
  const GRP = {
    anat: { p: "a", name: "Anatomy", low: "anatomy", src: "Human Structure LOs", catLabel: "Body regions", catHint: "anatomy weeks or body regions", unit: "week", unitLabel: "Weeks" },
    icm: { p: "i", name: "ICM", low: "ICM", src: "ICM LOs", catLabel: "Skill types", catHint: "ICM systems or skill types", unit: "system", unitLabel: "Systems" }
  };
  const GMODE = {}; for (const g in GRP) for (const m of ["daily", "extra", "due", "shaky", "custom"]) GMODE[GRP[g].p + m] = [g, m];
  GMODE.iexam = ["icm", "exam"];  // ICM quiz > Examinations
  const inG = (it, g) => it.gw[g].length > 0;
  function gStats(g) {
    const T = dayNum(); let due = 0, mastered = 0, seen = 0, n = 0;
    for (const it of POOL) { if (!inG(it, g)) continue; n++; const e = srs[it.id]; if (!e) continue; seen++; if (e[1] <= T && inLevel(it)) due++; if (e[0] >= 4) mastered++; }
    const d = meta[GRP[g].p + "daily"] || {};
    return { n, due, mastered, seen, streak: d.last >= T - 1 ? d.streak || 0 : 0, best: d.best || 0, doneToday: d.last === T };
  }
  const anatStats = () => gStats("anat");
  function startGDaily(g, extra) {
    const G = GRP[g], mode = G.p + (extra ? "extra" : "daily");
    if (!extra && QS && !QS.done && QS.mode === mode) { state.qscreen = "session"; return showQuiz(true); }
    const T = dayNum(), pool = POOL.filter(it => inG(it, g) && inLevel(it) && covered(it));
    let items = extra ? [] : choose(pool.filter(it => srs[it.id] && srs[it.id][1] <= T), 6);
    const fill = list => { if (items.length < 10) { const have = new Set(items); items = items.concat(choose(list.filter(it => !have.has(it)), 10 - items.length)); } };
    fill(pool.filter(it => !srs[it.id])); fill(pool);
    startSession({ mode, title: extra ? `10 more ${G.low}` : `${G.name} Daily 10`, items: shuffle(items), spec: { k: G.p + "daily" }, more: () => startGDaily(g, true), back: g, empty: `No ${G.low} questions at this level.` });
  }
  function startGDue(g, n = qcfg.dueN) {
    const G = GRP[g];
    startSession({ mode: G.p + "due", title: `${G.name} review due`, items: choose(dueItems(g), n === "all" ? Infinity : n, 3), spec: { k: G.p + "due", n }, more: () => startGDue(g, n), back: G.p + "due", empty: `No ${G.low} questions are due. Try the ${G.name} Daily 10.` });
  }
  function startGShaky(g) {
    const G = GRP[g], set = shakyLos();
    const items = POOL.filter(it => inG(it, g) && inLevel(it) && it.los.some(k => set.has(k)));
    startSession({ mode: G.p + "shaky", title: `Shaky ${G.low} LOs`, items: choose(items, 20, 2), spec: { k: G.p + "shaky", keys: [...set] }, focus: k => set.has(k), more: () => startGShaky(g), back: g, empty: `No shaky ${G.low} LOs yet. Mark them Shaky or Not yet in the ${G.name} tab, or answer a few more questions first.` });
  }
  // Categories for the custom quiz. Anatomy: body regions (by week, so the curriculum's system labels don't matter).
  // ICM: skill types, from each LO's session title and wording (an LO can be in more than one).
  const ANAT_REGIONS = [
    ["abdo", "Abdomen & pelvis", "102 104 111 114 132 135 141 206 212 229 238 239"], ["thorax", "Thorax & heart", "103 106 108 134 213 237"],
    ["upper", "Upper limb", "107 113 220"], ["lower", "Lower limb", "115 125 210 211"], ["headneck", "Head & neck", "126 127 136 139 142 204 207 208 219"],
    ["neuro", "Brain & spine", "109 119 133 209 221 230 231 240"], ["embryo", "Embryology", "110 112 128 202"], ["cells", "Cells & immunity", "105 130 131"],
    ["skin", "Skin & breast", "227 228"]
  ].map(([id, title, nums]) => ({ id, title, weeks: new Set(nums.split(" ").map(n => "a-" + n)) }));
  const ICM_SKILLS = [
    ["exam", "Examinations", /exam|ophthalmoscop|otoscop|speculum|\bPV\b|\bPR\b|rectal|palpat|auscult|cranial nerve|fundus|visual (field|acuit)|lumps|gait|murmur|inspect/i],
    ["history", "Histories & communication", /histor|consult|explain|communicat|bad news|signpost|question|telephone|video|triadic|counsel|cues|sensitiv|perspective|agenda|handover|present|empath|interpreter|capacity|consent/i],
    ["procedure", "Practical procedures", /cannul|venepunct|venesect|inject|blood culture|ECG (procedure|record)|12[- ]lead|electrode|sutur|catheter|glucose|ANTT|aseptic|local anaes|BMI|measure|arterial blood gas|\bABG\b|inhaler|swab|urinalysis|hand hygiene|PPE|airway adjunct|oropharyngeal|nasopharyngeal|scrub|gown|glov/i],
    ["emergency", "Emergencies & A–E", /\bA ?to ?E\b|\bA ?- ?E\b|ABCDE|life support|\bCPR\b|cardiac arrest|defibrillat|airway|sick (patient|child)|unwell|haemorrhage|resuscitat|sepsis|\bNEWS|deteriorat|emergenc|rhythm/i],
    ["data", "Prescribing & interpretation", /prescrib|interpret|chart|growth|data|result|X-ray|radiograph|imaging|insulin|fluid|drug|medication|calculat|plot|spirometr|peak flow/i],
    ["prof", "Professionalism & placement", /professional|confidential|integrity|dignity|team|feedback|patient safety|wellbeing|raise and escalate|punctual|honest|respect|limitation|reflect|safeguard/i]
  ];
  // Exam quiz (ICM quiz > Examinations): each examination is a set of ICM LOs (Year 1 and Year 2); a question belongs to
  // an exam if any of its LOs does. An LO can sit in more than one exam (e.g. the combined cardio-respiratory sessions).
  const EXAM_GROUPS = [["sys", "Systems"], ["neuro", "Neurology and special senses"], ["msk", "Musculoskeletal"], ["intimate", "Intimate and obstetric"], ["other", "Mental state, children and basics"]];
  const EXAMS = [
    ["cvs", "Cardiovascular", "sys", "i-108-1 i-112-4 i-112-5 i-119-7 i-130-2 i-130-3 i-130-4 i-133-3 i-140-4 y2-210-37 y2-210-38 y2-210-39 y2-213-18"],
    ["resp", "Respiratory", "sys", "i-106-1 i-111-2 i-111-3 i-111-4 i-116-6 i-130-2 i-130-3 i-130-4 i-133-4 y2-204-13 y2-204-14 y2-204-15 y2-213-18"],
    ["gi", "Gastrointestinal (abdominal)", "sys", "i-105-1 i-109-2 i-109-3 i-115-3 i-133-5 y2-206-21 y2-229-11"],
    ["thyroid", "Neck and thyroid", "sys", "i-126-1 i-136-8 y2-212-29 y2-212-30 y2-222-14"],
    ["vasc", "Peripheral vascular and ABPI", "sys", "i-134-2 y2-210-40 y2-210-41"],
    ["lump", "Lumps and bumps", "sys", "i-132-1"],
    ["skin", "Skin (dermatology)", "sys", "y2-227-20 y2-227-21 y2-227-22"],
    ["breast", "Breast", "sys", "y2-203-14 y2-203-15 y2-228-18"],
    ["ulneuro", "Upper limb neurology", "neuro", "i-109-1 i-111-1 i-113-7 i-134-4 y2-205-23 y2-205-24 y2-205-25 y2-205-26 y2-227-17"],
    ["llneuro", "Lower limb neurology", "neuro", "i-133-1 i-134-4 y2-205-23 y2-205-24 y2-205-25 y2-205-26 y2-227-17"],
    ["cn", "Cranial nerves", "neuro", "i-141-2 i-146-3 y2-205-22 y2-205-24 y2-205-25 y2-205-26 y2-227-17"],
    ["eye", "Eyes and fundoscopy", "neuro", "i-104-14 i-142-1 i-142-2 i-142-3 i-142-4 y2-202-18 y2-202-19"],
    ["ent", "Ear, nose and throat", "neuro", "i-140-5 i-145-2 y2-208-11 y2-208-12 y2-208-13"],
    ["shoulder", "Shoulder", "msk", "i-107-1 i-115-2 i-135-7 i-135-8 y2-228-19 y2-228-20 y2-228-21 y2-228-22"],
    ["elbow", "Elbow", "msk", "y2-228-19 y2-228-20 y2-228-21 y2-228-22"],
    ["hand", "Hand and wrist", "msk", "i-113-1 i-113-2 i-113-3 i-113-4 i-113-6 i-115-4 y2-228-19 y2-228-20 y2-228-21 y2-228-22 y2-238-9 y2-238-10 y2-238-11 y2-238-12"],
    ["spine", "Spine (cervical and lumbar)", "msk", "i-126-5 i-133-2 y2-209-15 y2-209-16 y2-209-17 y2-209-18 y2-209-19 y2-219-16 y2-219-17"],
    ["hip", "Hip", "msk", "i-125-1 i-130-1 i-135-5 i-135-8 y2-238-9 y2-238-10 y2-238-11 y2-238-12"],
    ["knee", "Knee", "msk", "i-115-1 i-125-2 i-135-6 i-135-8 y2-238-9 y2-238-10 y2-238-11 y2-238-12"],
    ["foot", "Foot and ankle", "msk", "y2-237-11 y2-237-12 y2-237-13 y2-237-14 y2-238-9 y2-238-10 y2-238-11 y2-238-12"],
    ["pr", "Rectal (DRE)", "intimate", "i-125-3 i-132-7 i-132-8 y2-206-22 y2-210-34"],
    ["groin", "Male genitalia and groin", "intimate", "i-141-1 i-145-1 y2-210-33 y2-210-35 y2-210-36"],
    ["pv", "Speculum and bimanual (gynaecological)", "intimate", "i-114-1 i-135-3 i-135-4 y2-212-16 y2-212-22 y2-212-23 y2-228-14 y2-228-15"],
    ["antenatal", "Antenatal (obstetric abdominal)", "intimate", "i-114-3 y2-222-12"],
    ["mse", "Mental state examination", "other", "i-119-6 i-127-7 y2-239-25"],
    ["cog", "Cognitive assessment", "other", "i-116-4 i-116-5 y2-209-13"],
    ["child", "The unwell child", "other", "i-136-4 i-136-5"],
    ["obs", "Observations and NEWS2", "other", "i-104-7 i-104-8 i-104-11 i-104-12 i-107-3 i-107-4"],
    ["basics", "Examination basics (inspect, palpate, percuss, auscultate)", "other", "i-103-3 i-103-4 i-103-5 i-103-6 i-103-7 i-103-8"]
  ].map(([id, title, group, keys]) => ({ id, title, group, keys: new Set(keys.split(" ")) }));
  const CATS = {
    anat: ANAT_REGIONS.map(r => ({ id: r.id, title: r.title, test: it => it.gw.anat.some(w => r.weeks.has(w)), focus: k => r.weeks.has(gweekOf("anat", k)) })),
    icm: (() => {
      const sets = Object.fromEntries(ICM_SKILLS.map(([id]) => [id, new Set()])), other = new Set();
      for (const w of DATA.icm || []) for (const lo of w.los) { const s = lo.text + " " + lo.sessions.join(" "); let hit = false; for (const [id, , re] of ICM_SKILLS) if (re.test(s)) { sets[id].add(lo.key); hit = true; } if (!hit) other.add(lo.key); }
      return ICM_SKILLS.map(([id, title]) => [id, title, sets[id]]).concat(other.size ? [["other", "Other", other]] : [])
        .map(([id, title, keys]) => ({ id, title, keys, test: it => it.los.some(k => keys.has(k)), focus: k => keys.has(k) }));
    })()
  };
  function poolForG(g, cfg) {
    const fams = new Set(cfg.fams), cats = cfg.cats || cfg.regions || [];
    let items = POOL.filter(it => inG(it, g) && fams.has(it.fam) && (cfg.levels || [1, 2, 3]).includes(it.lvl));
    if (cfg.scope === "weeks") { const ws = new Set(cfg.weeks); items = items.filter(it => it.gw[g].some(w => ws.has(w))); }
    else if (cfg.scope === "cats" || cfg.scope === "regions") { const cs = CATS[g].filter(c => cats.includes(c.id)); items = items.filter(it => cs.some(c => c.test(it))); }
    return byStatus(items, cfg);
  }
  const poolForAnat = cfg => poolForG("anat", cfg);
  function gFocus(g, cfg) {
    if (!cfg) return null;
    if (cfg.scope === "weeks") { const ws = new Set(cfg.weeks); return k => ws.has(gweekOf(g, k)); }
    if (cfg.scope === "cats" || cfg.scope === "regions") { const cats = cfg.cats || cfg.regions || [], cs = CATS[g].filter(c => cats.includes(c.id)); return k => cs.some(c => c.focus(k)); }
    return null;
  }
  function startGCustom(g, cfg = { ...JSON.parse(JSON.stringify(GCFG[g])), levels: qcfg.levels.slice() }) {
    const G = GRP[g], n = cfg.n === "all" ? Infinity : cfg.n, spec = { k: G.p + "custom", cfg };
    startSession({ mode: G.p + "custom", title: `Custom ${G.low} quiz${statusTitle(cfg)}`, items: choose(poolForG(g, cfg), n), spec, ...sessionHooks(spec), back: G.p + "custom", empty: `No ${G.low} questions match. Pick at least one ${G.unit} or ${G.catLabel.toLowerCase().replace(/s$/, "")}.` });
  }
  function gCustomHTML(g) {
    const G = GRP[g], cfg = { ...GCFG[g], levels: qcfg.levels }, fams = new Set(cfg.fams), match = poolForG(g, cfg).length;
    const n = cfg.n === "all" ? match : Math.min(cfg.n, match), note = state.qnote; state.qnote = "";
    const cnt = pred => POOL.filter(it => inG(it, g) && fams.has(it.fam) && cfg.levels.includes(it.lvl) && pred(it)).length;
    const b = (k, v, pressed, label, cls = "") => `<button${cls ? ` class="${cls}"` : ""} data-g="${g}" data-gk="${k}" data-gv="${v}"${pressed == null ? "" : ` aria-pressed="${pressed}"`}>${label}</button>`;
    const seg = (k, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => b(k, v, String(cur) === String(v), l)).join("")}</div>`;
    let scope = "";
    if (cfg.scope === "weeks") scope = [1, 2].map(yr => {
      const ws = DATA[g].filter(w => yrOf(w) === yr).map(w => [w, cnt(it => it.gw[g].includes(w.id))]).filter(([, c]) => c);
      return ws.length ? `<div><h3>Year ${yr} ${G.low}${b("all", yr, null, "All")}${b("none", yr, null, "None")}</h3><div class="chips">${ws.map(([w, c]) => b("week", w.id, cfg.weeks.includes(w.id), `${w.yr ? "" : w.num + " "}${esc(w.title)} <span class="ct">${c}</span>`, "chip")).join("")}</div></div>` : "";
    }).join("");
    if (cfg.scope === "cats") scope = `<div class="chips">${CATS[g].map(c => b("cat", c.id, cfg.cats.includes(c.id), `${esc(c.title)} <span class="ct">${cnt(c.test)}</span>`, "chip")).join("")}</div>`;
    const famN = f => POOL.filter(it => inG(it, g) && it.fam === f).length;
    return `<div class="qz"><header class="week-head"><div class="eyebrow">${G.name} quiz</div><h2>Custom ${G.low} quiz</h2><div class="meta"><span>Pick which ${G.low} to cover, the question types and how many.</span></div></header>
      ${note ? `<p class="pending-note">${esc(note)}</p>` : ""}
      <section class="picker">
        ${statusHTML(cfg, id => poolForG(g, { ...cfg, status: [id] }).length, id => `data-g="${g}" data-gk="stat" data-gv="${id}"`)}
        <div><h3>Cover</h3>${seg("scope", cfg.scope, [["all", `All ${G.low}`], ["weeks", G.unitLabel], ["cats", G.catLabel]])}</div>
        ${scope ? `<div class="scope">${scope}</div>` : ""}
        <div><h3>Level</h3>${levelPicker(levelCounts(poolForG(g, { ...cfg, levels: [1, 2, 3] })))}</div>
        <div><h3>Question types</h3><div><div class="chips">${["sa", "num", "list", "lad"].map(f => b("fam", f, fams.has(f), `${FAM_LABEL[f]} <span class="ct">${famN(f)}</span>`, "chip")).join("")}</div></div></div>
        <div><h3>How many</h3>${seg("n", cfg.n, [[10, "10"], [20, "20"], [40, "40"], ["all", "All"]])}</div>
      </section>
      <div class="startbar"><button class="btn pri" id="g-start" data-g="${g}"${n ? "" : " disabled"}>Start ${n} question${n === 1 ? "" : "s"}</button><span class="count">${match} match${match === 1 ? "" : "es"}${match ? "" : statusPick(cfg).length && poolForG(g, noStatus(cfg)).length ? " · none of these match your review choice" : cfg.scope !== "all" ? " · pick at least one" : ""}</span></div>
    </div>`;
  }
  /* ----- Exam quiz: pick examinations, get every question on them ----- */
  function examKeys(cfg) { return new Set(EXAMS.filter(e => cfg.exams.includes(e.id)).flatMap(e => [...e.keys])); }
  function examPool(cfg) {
    const fams = new Set(cfg.fams), keys = examKeys(cfg), lv = cfg.levels || [1, 2, 3];
    return byStatus(POOL.filter(it => fams.has(it.fam) && lv.includes(it.lvl) && it.los.some(k => keys.has(k))), cfg);
  }
  function examTitle(cfg) {
    const names = EXAMS.filter(e => cfg.exams.includes(e.id)).map(e => e.title.replace(/ \(.*\)$/, ""));
    return "ICM exams: " + (names.length > 3 ? names.slice(0, 3).join(", ") + ` and ${names.length - 3} more` : names.join(", ").replace(/, ([^,]*)$/, " and $1"));
  }
  function startExamQuiz(cfg = { ...JSON.parse(JSON.stringify(xcfg)), levels: qcfg.levels.slice() }) {
    const n = cfg.n === "all" ? Infinity : cfg.n, keys = examKeys(cfg), spec = { k: "iexam", cfg };
    startSession({ mode: "iexam", title: examTitle(cfg) + statusTitle(cfg), items: choose(examPool(cfg), n), spec, focus: k => keys.has(k), more: () => startExamQuiz(cfg), back: "iexam", empty: "No questions match. Pick at least one examination." });
  }
  const ALL_EXAM_KEYS = new Set(EXAMS.flatMap(e => [...e.keys]));
  function examHTML() {
    const cfg = { ...xcfg, levels: qcfg.levels }, fams = new Set(cfg.fams), match = examPool(cfg).length, n = cfg.n === "all" ? match : Math.min(cfg.n, match), note = state.qnote; state.qnote = "";
    const b = (k, v, pressed, label, cls = "") => `<button${cls ? ` class="${cls}"` : ""} data-xk="${k}" data-xv="${v}"${pressed == null ? "" : ` aria-pressed="${pressed}"`}>${label}</button>`;
    const cnt = e => POOL.filter(it => fams.has(it.fam) && cfg.levels.includes(it.lvl) && it.los.some(k => e.keys.has(k))).length;
    const groups = EXAM_GROUPS.map(([gid, gtitle]) => `<div><h3>${gtitle}${b("all", gid, null, "All")}${b("none", gid, null, "None")}</h3><div class="chips">${EXAMS.filter(e => e.group === gid).map(e => b("exam", e.id, cfg.exams.includes(e.id), `${esc(e.title)} <span class="ct">${cnt(e)}</span>`, "chip")).join("")}</div></div>`).join("");
    const famN = f => POOL.filter(it => it.fam === f && it.los.some(k => ALL_EXAM_KEYS.has(k))).length;
    const why = match ? "" : !cfg.exams.length ? " · pick at least one examination" : statusPick(cfg).length && examPool(noStatus(cfg)).length ? " · none of these match your review choice" : "";
    return `<div class="qz"><header class="week-head"><div class="eyebrow">ICM quiz</div><h2>Examination quiz</h2><div class="meta"><span>Pick examinations and get every question on them: the full lists of what to look for and the short answers, Years 1 and 2.</span></div></header>
      ${note ? `<p class="pending-note">${esc(note)}</p>` : ""}
      <section class="picker">
        ${statusHTML(cfg, id => examPool({ ...cfg, status: [id] }).length, id => `data-xk="stat" data-xv="${id}"`)}
        <div><h3>Examinations${b("all", "*", null, "All")}${b("none", "*", null, "None")}</h3><div class="scope">${groups}</div></div>
        <div><h3>Level</h3>${levelPicker(levelCounts(examPool({ ...cfg, levels: [1, 2, 3] })))}</div>
        <div><h3>Question types</h3><div><div class="chips">${["sa", "num", "list", "lad"].map(f => b("fam", f, fams.has(f), `${FAM_LABEL[f]} <span class="ct">${famN(f)}</span>`, "chip")).join("")}</div></div></div>
        <div><h3>How many</h3><div class="seg" role="group">${[[10, "10"], [20, "20"], [40, "40"], ["all", "All"]].map(([v, l]) => b("n", v, String(cfg.n) === String(v), l)).join("")}</div></div>
      </section>
      <div class="startbar"><button class="btn pri" id="x-start"${n ? "" : " disabled"}>Start ${n} question${n === 1 ? "" : "s"}</button><span class="count">${match} match${match === 1 ? "" : "es"}${why}</span></div>
    </div>`;
  }
  function xSet(k, v) {
    const ids = g => EXAMS.filter(e => g === "*" || e.group === g).map(e => e.id);
    if (k === "exam") toggleIn(xcfg.exams, v);
    else if (k === "all") xcfg.exams = [...new Set([...xcfg.exams, ...ids(v)])];
    else if (k === "none") { const drop = new Set(ids(v)); xcfg.exams = xcfg.exams.filter(id => !drop.has(id)); }
    else if (k === "fam") { if (!(xcfg.fams.length === 1 && xcfg.fams[0] === v)) toggleIn(xcfg.fams, v); }
    else if (k === "n") xcfg.n = v === "all" ? "all" : +v;
    else if (k === "stat") { xcfg.status = statusPick(xcfg).slice(); toggleIn(xcfg.status, v); }
    return saveCfg();
  }
  function gSet(g, k, v) {
    const cfg = GCFG[g];
    if (k === "scope") cfg.scope = v;
    else if (k === "week") toggleIn(cfg.weeks, v);
    else if (k === "all") { const y2 = v === "2"; cfg.weeks = [...new Set([...cfg.weeks, ...DATA[g].filter(w => WEEK_N[w.id] && yrOf(w) === (y2 ? 2 : 1)).map(w => w.id)])]; }
    else if (k === "none") { const y2 = v === "2"; cfg.weeks = cfg.weeks.filter(id => weeksById[id] && yrOf(weeksById[id]) !== (y2 ? 2 : 1)); }
    else if (k === "cat") toggleIn(cfg.cats, v);
    else if (k === "stat") { cfg.status = statusPick(cfg).slice(); toggleIn(cfg.status, v); delete cfg.learning; }
    else if (k === "fam") { if (!(cfg.fams.length === 1 && cfg.fams[0] === v)) toggleIn(cfg.fams, v); }
    else if (k === "n") cfg.n = v === "all" ? "all" : +v;
    return saveCfg();
  }
  function gHTML(g) {
    const G = GRP[g], a = gStats(g), note = state.qnote; state.qnote = "";
    const line = w => `<button class="pline" data-quizweek="${w.id}"><span class="nm">${w.yr ? "" : `<span class="num">${w.num}</span>`}${esc(w.title)}</span><span class="pnum">${WEEK_N[w.id] || 0} questions</span>${prog("mini", "qweek:" + w.id)}</button>`;
    return `<div class="qz">
      <header class="week-head"><div class="eyebrow">Quiz</div><h2>${G.name} quiz</h2>
        <div class="meta"><span><b>${a.n.toLocaleString("en-GB")}</b> questions</span><span>Year 1 and Year 2 ${G.src}</span><span>Year 1 ${G.low} stays out of the main Daily 10 and sprint</span></div></header>
      ${note ? `<p class="pending-note">${esc(note)}</p>` : ""}
      ${heroMode(G.p + "daily", a.doneToday ? "Done today ✓" : "Today · about 3 min", `${G.name} Daily 10`, `Due ${G.low} reviews first, then new ones. Its own streak. ${reachedNote()}`, a.doneToday)}
      <div class="stats">${stat(a.due, "due for review")}${stat(a.streak, "day streak")}${stat(a.seen, "questions tried")}${stat(a.mastered, "mastered")}</div>
      <div class="mgrid">
        <div class="mcol">${modeGroup("Practise", [
          modeRow(G.p + "due", "Review due", `${a.due} due`, `${G.name} questions due again`),
          modeRow(G.p + "shaky", `Drill shaky ${G.low}`, "", `LOs marked Shaky or Not yet, and ones you keep missing`)])}</div>
        <div class="mcol">${modeGroup("Choose your own", [
          modeRow(G.p + "custom", `Custom ${G.low} quiz`, "", `Pick ${G.catHint}`),
          g === "icm" && modeRow("iexam", "Examinations", "", "Pick exams (cardiovascular, knee, cranial nerves…) and get every question on them")])}</div>
      </div>
      ${foldBox(`${G.name} progress`, "qyear:" + g, `<div class="prows">${prog("row", "qyear:" + g, `${G.name} questions`)}${prog("row", g, `${G.name} LO ratings`)}</div>`)}
      ${[1, 2].map(yr => { const ws = DATA[g].filter(w => WEEK_N[w.id] && yrOf(w) === yr); return ws.length ? `<section class="psec"><h3>Year ${yr}: quiz one ${G.unit}</h3><div class="plist">${ws.map(line).join("")}</div></section>` : ""; }).join("")}
    </div>`;
  }
  function startSprint() { startSession({ mode: "sprint", title: "60-second sprint", items: choose(POOL.filter(it => !it.sep && MCQ.has(it.t) && inLevel(it) && covered(it)), 150), mcq: true, timed: 60, spec: { k: "sprint" }, more: startSprint }); }
  function startShaky() {
    const set = shakyLos();
    const items = POOL.filter(it => !it.sep && inLevel(it) && it.los.some(k => set.has(k)) && (it.lo || it.t === "duse" || it.t === "dwhy"));
    startSession({ mode: "shaky", title: "Shaky LOs", items: choose(items, 20, 2), spec: { k: "shaky", keys: [...set] }, focus: k => set.has(k), more: startShaky, empty: "Nothing to drill yet. Mark LOs as Shaky or Not yet in the week view, or answer a few more questions first." });
  }
  /* ----- Review due: you choose how many (remembered in qcfg.dueN, shared by the main and anatomy reviews) ----- */
  const DUE_OPTS = [5, 10, 20, 30, 50, "all"];
  // The main Review due takes every due question (Years 1 and 2, anatomy, ICM and drugs); the Anatomy and ICM pages
  // each have their own review of just their questions.
  const dueItems = g => { const T = dayNum(); return POOL.filter(it => (!g || inG(it, g)) && inLevel(it) && srs[it.id] && srs[it.id][1] <= T); };
  const dueArea = it => inG(it, "icm") ? "ICM" : inG(it, "anat") ? "Anatomy" : it.drug ? "Drugs" : "Years 1 and 2";
  function dueSplit(items) {
    const by = {}; for (const it of items) by[dueArea(it)] = (by[dueArea(it)] || 0) + 1;
    return ["Years 1 and 2", "Anatomy", "ICM", "Drugs"].filter(a => by[a]).map(a => `${by[a]} ${a}`).join(" · ");
  }
  const dueCount = (g, due) => qcfg.dueN === "all" ? due : Math.min(qcfg.dueN, due);
  const dueLabel = n => n ? `Start ${n} question${n === 1 ? "" : "s"}` : "Nothing due";
  function startDue(n = qcfg.dueN) {
    startSession({ mode: "due", title: "Review due", items: choose(dueItems(false), n === "all" ? Infinity : n, 3), spec: { k: "due", n }, more: () => startDue(n), back: "due", empty: "Nothing is due right now. Try a Daily 10." });
  }
  function dueHTML(g) {
    const G = g && GRP[g], items = dueItems(g), due = items.length, cur = qcfg.dueN, n = dueCount(g, due), note = state.qnote; state.qnote = "";
    return `<div class="qz"><header class="week-head"><div class="eyebrow">${G ? G.name + " quiz" : "Quiz"}</div><h2>${G ? G.name + " review due" : "Review due"}</h2>
      <div class="meta"><span><b>${due}</b> question${due === 1 ? "" : "s"} due${!G && due ? `: ${dueSplit(items)}` : ""}</span><span>${G ? "" : "Everything due, anatomy and ICM included. "}Most overdue and weakest first</span></div></header>
      ${note ? `<p class="pending-note">${esc(note)}</p>` : ""}
      <section class="picker"><div><h3>How many</h3><div class="duepick"><div class="seg" role="group" aria-label="How many questions">${DUE_OPTS.map(v => `<button data-duen="${v}" aria-pressed="${String(cur) === String(v)}">${v === "all" ? "All" : v}</button>`).join("")}</div>
        <label class="duecustom">or type a number <input id="due-custom" type="number" inputmode="numeric" min="1" max="999" value="${DUE_OPTS.includes(cur) ? "" : cur}" placeholder="e.g. 15"></label></div></div></section>
      <div class="startbar"><button class="btn pri" id="q-due-go" data-g="${g || ""}"${n ? "" : " disabled"}>${dueLabel(n)}</button><span class="count">${n ? "Your choice is remembered for next time" : G ? `Try the ${G.name} Daily 10.` : "Try a Daily 10."}</span></div>
    </div>`;
  }
  // Typing a number updates the button straight away (no re-render, so the box keeps focus); it's saved as you type.
  document.addEventListener("change", e => {
    const s = e.target.closest && e.target.closest("[data-lsame]"); if (s && s.value !== "") (s.value[0] === "m" ? listMatch : listAlias)(+s.dataset.lsame, +s.value.slice(1));
    const a = e.target.closest && e.target.closest("[data-laddat]"); if (a && a.value !== "") listOwn(+a.dataset.laddat, a.value);
  });
  document.addEventListener("input", e => {
    if (e.target.id !== "due-custom") return;
    const v = Math.min(999, Math.round(+e.target.value));
    if (!(v >= 1)) return;
    qcfg.dueN = v; store.set("qcfg", qcfg);
    for (const b of document.querySelectorAll("[data-duen]")) b.setAttribute("aria-pressed", "false");
    const go = $("#q-due-go"); if (go) { const n = dueCount(null, dueItems(go.dataset.g || null).length); go.textContent = dueLabel(n); go.disabled = !n; }
  });
  function startWeekQuiz(wid) {
    const w = weeksById[wid]; if (!w) return;
    startSession({ mode: "week", title: w.yr ? `ICM Year ${w.yr}: ${w.title}` : `${w.year === "anat" ? "Anatomy w" : w.year === "icm" ? "ICM w" : "W"}eek ${w.num}: ${w.title}`, items: choose(POOL.filter(it => inLevel(it) && (it.weeks.includes(wid) || it.gw.anat.includes(wid) || it.gw.icm.includes(wid))), 20), spec: { k: "week", w: wid }, ...sessionHooks({ k: "week", w: wid }) });
  }
  function startLoQuiz(key) {
    const h = loByKey[key]; if (!h) return;
    startSession({ mode: "lo", title: h.w.yr ? loTagOf(h) : `Week ${h.w.num} · LO ${h.lo.n}`, items: shuffle((BY_LO[key] || []).slice()).slice(0, 20), spec: { k: "lo", key }, ...sessionHooks({ k: "lo", key }) });
  }
  function startDrugQuiz(id) {
    const d = drugById[id]; if (!d) return;
    startSession({ mode: "drug", title: d.name, items: shuffle(POOL.filter(it => it.drug === d)), spec: { k: "drug", id }, more: () => startDrugQuiz(id) });
  }
  // A question belongs to a week if it's taught that week or linked to that anatomy week or ICM page (Year 2 anatomy weeks
  // hold no LOs of their own: their questions sit in the Year 2 week and are linked to the anatomy week).
  // A Year 2 week stands for its medicine only: its anatomy questions belong to the Year 2 anatomy week instead.
  const inWeeks = (it, ws) => it.weeks.some(w => ws.has(w) && !(it.gw.anat.length && weeksById[w] && weeksById[w].year === "y2")) || it.gw.anat.some(w => ws.has(w)) || it.gw.icm.some(w => ws.has(w));
  // The groups of the custom quiz's Weeks picker: each year's medicine and anatomy separately, then ICM.
  const weekGroups = () => [["y1", "Year 1", DATA.y1], ["anat1", "Year 1 anatomy", DATA.anat.filter(w => yrOf(w) === 1)],
    ["y2", "Year 2 medicine", DATA.y2], ["anat2", "Year 2 anatomy", DATA.anat.filter(w => yrOf(w) === 2)], ["icm", "ICM", DATA.icm || []]];
  function poolFor(cfg) {
    const fams = new Set(cfg.scope === "drugs" ? ["drug"] : cfg.fams);
    let items = POOL.filter(it => fams.has(it.fam) && (cfg.levels || [1, 2, 3]).includes(it.lvl) && (cfg.scope === "weeks" || cfg.scope === "search" || !it.sep));
    if (cfg.scope === "search") { const t = termTest(cfg.term); items = t ? items.filter(t) : []; }
    else if (cfg.scope === "weeks") { const ws = new Set(cfg.weeks); items = items.filter(it => inWeeks(it, ws)); }
    else if (cfg.scope === "systems") { const ss = SYSTEMS.filter(s => cfg.systems.includes(s.id)); items = items.filter(it => ss.some(s => inSystem(it, s))); }
    else if (cfg.scope === "drugs") { const cs = new Set(cfg.cats); items = items.filter(it => cs.has(it.cat)); }
    return byStatus(items, cfg);
  }
  function customFocus(cfg) {
    if (cfg.scope === "weeks") { const ws = new Set(cfg.weeks); return k => ws.has(weekOf(k)) || ws.has(LINK.anat[k]) || ws.has(LINK.icm[k]); }
    if (cfg.scope === "systems") { const ss = SYSTEMS.filter(s => cfg.systems.includes(s.id)); return k => ss.some(s => s.weeks.has(weekOf(k))); }
    if (cfg.scope === "search") { const t = termTest(cfg.term), keys = new Set(t ? POOL.filter(t).flatMap(it => it.los) : []); return k => keys.has(k); }
    return null;
  }
  function startCustom(cfg = JSON.parse(JSON.stringify(qcfg))) {
    const n = cfg.n === "all" ? Infinity : cfg.n, spec = { k: "custom", cfg };
    startSession({ mode: "custom", title: (cfg.scope === "search" ? `Search: “${(cfg.term || "").trim()}”` : "Custom quiz") + statusTitle(cfg), items: choose(poolFor(cfg), n, cfg.scope === "drugs" ? 2 : 1), spec, ...sessionHooks(spec) });
  }
  function goMode(m) {
    if (m === "daily") return startDaily();
    if (m === "cont") return startContinue();
    if (GMODE[m]) {
      const [g, k] = GMODE[m];
      if (k === "daily") return startGDaily(g);
      if (k === "shaky") return startGShaky(g);
      if (k === "due" && QS && !QS.done && QS.mode === m) { state.qscreen = "session"; return showQuiz(true); }
    }
    if (m === "shaky") return startShaky();
    if (m === "due" || m === "adue") { if (QS && !QS.done && QS.mode === m) { state.qscreen = "session"; return showQuiz(true); } state.qscreen = m; return showQuiz(true); }
    if (m === "week") { const w = quizWeek(); return w && startWeekQuiz(w.id); }
    if (m === "search") { qcfg.scope = "search"; store.set("qcfg", qcfg); state.qscreen = "custom"; showQuiz(true); const el = $("#q-term"); if (el) el.focus(); return; }
    state.qscreen = m; showQuiz(true);
  }
  function showQuiz(top) {
    state.year = "quiz"; state.query = ""; $("#q").value = "";
    if (location.hash !== "#quiz") history.replaceState(null, "", "#quiz");
    renderNav(); renderQuiz(top);
  }

  /* ----- Quiz views ----- */
  const stat = (n, label) => `<div class="stat"><b>${Number(n).toLocaleString("en-GB")}</b><span>${label}</span></div>`;
  // Quiz menus: the day's main quiz as one wide button, then the other modes as rows in labelled groups.
  const CHEV = `<svg class="mchev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>`;
  const modeRow = (mode, title, badge, text, o = {}) => `<button class="mode" data-qmode="${mode}"${o.disabled ? " disabled" : ""}><span class="mt">${title}</span>${text ? `<span class="md">${text}</span>` : ""}${badge ? `<small class="mb">${badge}</small>` : ""}${CHEV}</button>`;
  const modeGroup = (label, rows) => `<section class="mgrp"><h3 class="glabel">${label}</h3><div class="menu">${rows.filter(Boolean).join("")}</div></section>`;
  const heroMode = (mode, kicker, title, text, done) => `<button class="hero${done ? " done" : ""}" data-qmode="${mode}"><span class="hero-txt"><span class="hero-k">${kicker}</span><b>${title}</b><span class="hero-d">${text}</span></span><span class="btn${done ? "" : " pri"}">${done ? "10 more" : "Start"}</span></button>`;
  const foldBox = (title, scope, inner) => `<details class="fold"><summary>${title}${prog("pct", scope)}</summary>${inner}</details>`;
  function homeHTML() {
    const s = stats(), wk = quizWeek(), shaky = shakyLos().size, note = state.qnote; state.qnote = "";
    const acc = s.seen ? Math.round(s.right / s.seen * 100) + "% right" : "none yet";
    return `<div class="qz">
      <header class="week-head"><div class="eyebrow">Quiz</div><h2>Quick-fire quiz</h2>
        <div class="meta"><span><b>${POOL.length.toLocaleString("en-GB")}</b> questions</span><span>Years 1 and 2, Anatomy, ICM and drugs</span></div></header>
      ${note ? `<p class="pending-note">${esc(note)}</p>` : ""}
      ${QS && !QS.done ? liveRow() || `<div class="resume"><span><b>${esc(QS.title)}</b> in progress · ${QS.n} answered</span><button class="btn pri" id="q-resume">Resume</button></div>` : (r => r ? `<div class="resume"><span><b>${esc(r.title)}</b> left unfinished · ${r.n} answered · ${r.left} left</span><button class="btn pri" data-carry="${r.uid}">Carry on</button></div>` : "")(resumable())}
      <div class="heroes">${heroMode("daily", s.doneToday ? "Done today ✓" : "Today · about 3 min", "Daily 10", `Due reviews first, then new questions from your recent weeks. ${reachedNote()}`, s.doneToday)}
        ${(cp => `<button class="hero alt" data-qmode="cont"${cp.items.length ? "" : " disabled"}><span class="hero-txt"><span class="hero-k">${cp.close ? `${cp.close.toLocaleString("en-GB")} new on your recent topics` : "Picks up from your recent topics"}</span><b>Continue learning</b><span class="hero-d">${esc(contText(cp))}. Minimal repeats.</span></span><span class="btn">Continue</span></button>`)(contPlan())}</div>
      <div class="stats">${stat(s.due, "due for review")}${stat(s.streak, "day streak")}${stat(s.seen, "answers · " + acc)}${stat(meta.sprintBest || 0, "sprint best")}${stat(s.mastered, "mastered")}</div>
      <div class="lvbar"><span class="lbl">Level</span>${levelPicker(levelCounts(POOL))}</div>
      <div class="mgrid">
        <div class="mcol">${modeGroup("Practise", [
          modeRow("due", "Review due", s.due + " due", "Everything due, anatomy and ICM included", { disabled: !s.due }),
          modeRow("shaky", "Drill shaky LOs", shaky + (shaky === 1 ? " LO" : " LOs"), shaky ? "LOs marked Shaky or Not yet, and ones you keep missing" : "Mark LOs Shaky or Not yet to fill this", { disabled: !shaky }),
          wk && modeRow("week", "This week", WEEK_N[wk.id] ? WEEK_N[wk.id] + " Qs" : "", `${wk.num} ${esc(wk.title)}`),
          modeRow("sprint", "60-second sprint", "best " + (meta.sprintBest || 0), "Multiple choice against the clock")])}</div>
        <div class="mcol">${modeGroup("Choose your own", [
          modeRow("custom", "Custom quiz", "", "Pick weeks, systems or drug groups"),
          modeRow("search", "Search quiz", "", "Every question on a term, e.g. cranial nerves")])}
        ${modeGroup("By subject", [
          modeRow("anat", "Anatomy quiz", gStats("anat").doneToday ? "daily ✓" : "", "Its own Daily 10, review and quizzes by week"),
          modeRow("icm", "ICM quiz", gStats("icm").doneToday ? "daily ✓" : "", "Examinations, histories, procedures and A–E")])}</div>
      </div>
      ${foldBox("Progress by question type", "quiz", `<div class="prows">${prog("row", "quiz", "All questions")}${["sa", "num", "list", "lad", "drug"].map(f => prog("row", "qfam:" + f, FAM_LABEL[f])).join("")}</div>`)}
      ${syncNote()}
      <p class="foot-note">Typed answers are marked on key words and forgive small spelling slips; if it marks you wrong unfairly, tap “I was right”. A right answer comes back after 1, 3, 7, 16, then 35 days. A miss comes back later in the round and stays in Review due until you get it.</p>
    </div>`;
  }
  function sprintHTML() {
    const n = POOL.filter(it => MCQ.has(it.t) && covered(it)).length;
    return `<div class="qz"><header class="week-head"><div class="eyebrow">Quiz</div><h2>60-second sprint</h2>
      <div class="meta"><span>Multiple choice: get as many right as you can in a minute. Keys 1–4 work on a keyboard.</span><span>Best so far: <b>${meta.sprintBest || 0}</b></span></div></header>
      <p class="pending-note">${n} questions in the mix: which drug treats what, how drugs work, why a drug is avoided, key numbers and the next step in management ladders. A wrong answer shows the right one for a second, then moves on. ${reachedNote()}</p>
      <div><span class="lbl">Level</span>${levelPicker(levelCounts(POOL.filter(it => MCQ.has(it.t) && covered(it))))}</div>
      <div class="fb-actions"><button class="btn pri big" id="q-sprint-go">Start the clock</button></div></div>`;
  }
  // The parts of the custom quiz screen that change as you type a search term are redrawn in place (refreshCustom), so the
  // search box keeps focus.
  function customBits(cfg) {
    const match = poolFor(cfg).length, n = cfg.n === "all" ? match : Math.min(cfg.n, match), term = (cfg.term || "").trim();
    const why = match ? "" : cfg.scope === "search" && !term ? " · type a term" : statusPick(cfg).length && poolFor(noStatus(cfg)).length ? " · none of these match your review choice" : cfg.scope !== "all" ? (cfg.scope === "search" ? " · try another word or fewer filters" : " · pick at least one") : "";
    let found = "";
    if (cfg.scope === "search") {
      if (!term) found = "Type a word or phrase, e.g. <b>cranial nerves</b>, <b>warfarin</b> or <b>Virchow</b>. Every question that mentions it, or whose learning outcome does, is included: Years 1 and 2, Anatomy, ICM and drugs. Press Enter to start.";
      else {
        const items = poolFor(cfg), by = {};
        for (const it of items) { const h = !it.drug && loByKey[it.los[0]], area = it.drug ? "Drugs" : h ? YEAR_LABEL[h.w.year] : "Other"; by[area] = (by[area] || 0) + 1; }
        const los = new Set(items.flatMap(it => it.drug ? [] : it.los)).size;
        const also = searchAlso(term);
        found = items.length ? `<b>${items.length}</b> question${items.length === 1 ? "" : "s"} on “${esc(term)}”${also.length ? ` (also ${also.slice(0, 4).join(", ")}${also.length > 4 ? ` and ${also.length - 4} more` : ""})` : ""}: ${["Year 1", "Year 2", "Anatomy", "ICM", "Drugs", "Other"].filter(a => by[a]).map(a => `${by[a]} ${a}`).join(" · ")}${los ? ` · from ${los} learning outcome${los === 1 ? "" : "s"}` : ""}. Press Enter to start.` : `No questions match “${esc(term)}” with these settings. Try a shorter word, another spelling, or turn off some filters.`;
      }
    }
    return {
      review: statusHTML(cfg, id => poolFor({ ...cfg, status: [id] }).length, id => `data-qstat="${id}"`),
      level: levelPicker(levelCounts(poolFor({ ...cfg, levels: [1, 2, 3] }))),
      start: `<button class="btn pri" id="q-start"${n ? "" : " disabled"}>Start ${n} question${n === 1 ? "" : "s"}</button><span class="count">${match} match${match === 1 ? "" : "es"}${why}</span>`,
      found
    };
  }
  function refreshCustom() {
    const bits = customBits(qcfg);
    for (const [id, html] of [["c-review", bits.review], ["c-level", bits.level], ["c-start", bits.start], ["c-found", bits.found]]) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  }
  function customHTML() {
    const cfg = qcfg, fams = new Set(cfg.scope === "drugs" ? ["drug"] : cfg.fams), bits = customBits(cfg);
    const cnt = pred => POOL.filter(it => fams.has(it.fam) && pred(it)).length;
    const seg = (attr, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-${attr}="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</div>`;
    let scope = "";
    if (cfg.scope === "weeks") scope = weekGroups().map(([y, label, weeks]) => {
      const ws = weeks.map(w => [w, cnt(it => inWeeks(it, new Set([w.id])))]).filter(([, c]) => c);
      return `<div><h3>${label}<button data-qall="${y}">All</button><button data-qnone="${y}">None</button></h3><div class="chips">${ws.map(([w, c]) => `<button class="chip" data-qweek="${w.id}" aria-pressed="${cfg.weeks.includes(w.id)}">${w.num} ${esc(w.title)} <span class="ct">${c}</span></button>`).join("")}</div></div>`;
    }).join("");
    if (cfg.scope === "systems") scope = `<div class="chips">${SYSTEMS.map(s => `<button class="chip" data-qsys="${s.id}" aria-pressed="${cfg.systems.includes(s.id)}">${esc(s.title)} <span class="ct">${cnt(it => inSystem(it, s))}</span></button>`).join("")}</div>`;
    if (cfg.scope === "drugs") scope = `<div class="chips">${DRUGS.map(c => `<button class="chip" data-qcat="${c.id}" aria-pressed="${cfg.cats.includes(c.id)}">${esc(c.title)} <span class="ct">${cnt(it => it.cat === c.id)}</span></button>`).join("")}</div>`;
    if (cfg.scope === "search") scope = `<div class="qsearch"><input id="q-term" type="search" value="${esc(cfg.term || "")}" placeholder="Search questions, e.g. cranial nerves" autocomplete="off" spellcheck="false" aria-label="Quiz every question on this term"><p class="lvhint" id="c-found" aria-live="polite">${bits.found}</p></div>`;
    return `<div class="qz"><header class="week-head"><div class="eyebrow">Quiz</div><h2>Custom quiz</h2><div class="meta"><span>Pick what to cover, or search for a term, then the level, question types and how many.</span></div></header>
      <section class="picker">
        <div id="c-review">${bits.review}</div>
        <div><h3>Cover</h3>${seg("qscope", cfg.scope, [["all", "Everything"], ["weeks", "Weeks"], ["systems", "Systems"], ["drugs", "Drug groups"], ["search", "Search"]])}</div>
        ${scope ? `<div class="scope">${scope}</div>` : ""}
        <div><h3>Level</h3><div id="c-level">${bits.level}</div></div>
        <div><h3>Question types</h3><div><div class="chips">${["sa", "num", "list", "lad", "drug"].map(f => `<button class="chip" data-qfam="${f}" aria-pressed="${fams.has(f)}"${cfg.scope === "drugs" && f !== "drug" ? " disabled" : ""}>${FAM_LABEL[f]} <span class="ct">${FAMN[f]}</span></button>`).join("")}</div></div></div>
        <div><h3>How many</h3>${seg("qn", cfg.n, [[10, "10"], [20, "20"], [40, "40"], ["all", "All"]])}</div>
      </section>
      <div class="startbar" id="c-start">${bits.start}</div>
    </div>`;
  }
  // An option as short plain text (drops the examples line, trims long mechanisms).
  const optPlain = h => { const s = h.replace(/<small>.*?<\/small>/g, "").replace(/<[^>]+>/g, ""); return s.length > 72 ? s.slice(0, 70).replace(/\s+\S*$/, "").replace(/&[^;\s]*$/, "") + "…" : s; };
  function feedbackHTML(c, review) {
    const q = c.q, ok = c.ok;
    let body = "";
    if (q.kind === "typed") body = `${!c.skipped ? `<div class="yours">Your answer: ${esc(c.given)}</div>` : ""}<div class="model">${q.answerHTML(c.hit)}</div>`;
    else if (q.kind === "list") body = listResultHTML(c);
    else if (q.kind === "order") body = `<div class="model"><span class="lbl">Correct order, and why</span><ol class="ladder">${q.steps.map((s, i) => { const good = c.given[i] === i; return `<li class="${good ? "ok" : "bad"}">${esc(s)}${q.whys[i] ? `<span class="lw">${esc(q.whys[i])}</span>` : ""}${good ? "" : `<span class="yp">you put: ${esc(q.steps[c.given[i]])}</span>`}</li>`; }).join("")}</ol></div>`;
    else if (q.explain) body = `<div class="model">${q.explain}</div>`;
    body += learnedHTML(c);
    if (c.firstFixed) body += `<div class="learned">Your first try was the same answer, so it counts as right too.</div>`;
    if (q.why && q.kind !== "order") body += `<div class="why"><span class="lbl">Why</span>${q.why}</div>`;
    if (q.kind === "mcq" && q.notes && q.notes.some(Boolean)) body += `<div class="others"><span class="lbl">The other options</span><ul>${q.opts.map((h, i) => i === q.right || !q.notes[i] ? "" : `<li><b>${optPlain(h)}</b> ${q.notes[i]}</li>`).join("")}</ul></div>`;
    const links = [];
    if (q.lo && loByKey[q.lo]) links.push(loLink("Open the notes", q.lo, "linkbtn lolink"));
    if (q.drug) links.push(`<button class="linkbtn" data-qdrug="${q.drug.id}">Open ${esc(q.drug.name)}</button>`);
    const verdict = q.kind === "list" ? listVerdict(c) : ok ? (c.overridden ? "Marked right" : c.hinted ? "Right, with a hint" : "Right") : c.skipped ? "Here's the answer" : c.overridden ? "Marked wrong" : "Not quite";
    const later = review ? "" : c.requeuedNow ? (ok ? " · it'll come back this round and sooner than usual" : " · it'll come back this round") : ok && c.hinted ? " · it'll come back sooner than usual" : "";
    return `<div class="fb ${ok ? "ok" : "no"}"><div class="verdict">${verdict}${later}</div>${body}
      <div class="fb-actions">${review
        ? `${QS.view > 0 ? `<button class="btn ghost" id="q-prev2">‹ Previous</button>` : ""}<button class="btn pri" id="q-fwd">${QS.view < QS.past.length - 1 ? "Next ›" : QS.done ? "Back to results" : "Back to current question"}</button>`
        : `<button class="btn pri" id="q-next">${QS.queue.length ? "Next" : "Finish"} →</button>`}${canOverride(c) ? `<button class="btn ghost" id="q-override">${ok ? "Actually, I was wrong" : "I was right"}</button>` : ""}${links.join("")}</div></div>`;
  }
  function sessionHTML() {
    const review = QS.view != null, c = review ? QS.past[QS.view] : QS.cur, q = c.q;
    const remaining = QS.done ? 0 : QS.queue.length + (QS.cur.answered ? 0 : 1), total = QS.n + remaining, pos = QS.n + (QS.cur && !QS.cur.answered ? 1 : 0);
    const left = QS.timed ? Math.max(0, QS.end - Date.now()) : 0;
    const back = canLookBack() && (!review || QS.view > 0) ? `<button class="linkbtn qprev" id="q-prev">‹ Previous</button>` : "";
    const head = review
      ? `<div class="qhead"><div class="qbar"><span class="eyebrow">${esc(QS.title)}</span><span class="count looking">Looking back: question ${QS.view + 1} of ${QS.past.length}</span>${back}<button class="linkbtn" id="q-current">${QS.done ? "Back to results" : "Back to current question"}</button></div></div>`
      : `<div class="qhead"><div class="qbar"><span class="eyebrow">${esc(QS.title)}</span>${QS.timed ? `<span class="count" id="qsecs">${Math.ceil(left / 1000)}s left</span>` : `<span class="count">${pos} of ${total}</span>`}<span class="count">${QS.right} right</span>${back}<button class="linkbtn" id="q-end">End</button></div>
      ${QS.timed ? `<div class="timer"><i id="qtimer" style="width:${left / (QS.timed * 1000) * 100}%"></i></div>` : `<div class="bar thin" aria-hidden="true"><i class="b-ok" style="width:${QS.n / total * 100}%"></i></div>`}</div>`;
    if (review) return `<div class="qz">${head}<article class="qcard reviewing">${cardInner(c, q)}${feedbackHTML(c, true)}</article></div>`;
    let body = "";
    if (q.kind === "typed" && !c.answered) body = `<form class="qinput" id="qform" autocomplete="off"><input id="qans" type="text" enterkeyhint="done" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${q.placeholder || "Type your answer"}" aria-label="Your answer"><button class="btn pri" type="submit">Check</button><button class="btn ghost hintbtn" type="button" id="q-hint"${c.hinted ? " disabled" : ""}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2v.6h4v-.6c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5z"/></svg>Hint</button><button class="btn ghost" type="button" id="q-skip">Don't know</button></form>`;
    if (q.kind === "mcq") body = `${!c.answered && !c.hinted ? `<div class="hintrow"><button class="btn ghost hintbtn" id="q-hint"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2v.6h4v-.6c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5z"/></svg>Hint</button></div>` : ""}<div class="opts">${q.opts.map((h, i) => { const out = !c.answered && c.removed && c.removed.includes(i); const cls = out ? " out" : !c.answered ? "" : i === q.right ? " right" : i === c.choice ? " wrong" : " dim"; return `<button class="opt${cls}" data-opt="${i}"${c.answered || out ? " disabled" : ""}><kbd>${i + 1}</kbd><span>${h}</span></button>`; }).join("")}</div>`;
    if (q.kind === "typed" && !c.answered && c.exclMsg) body += `<p class="lmsg no" aria-live="polite">${esc(c.exclMsg)}</p>`;
    if (q.kind === "list" && !c.answered) body = listLiveHTML(c);
    if (q.kind === "order" && !c.answered) {
      const rest = q.perm.filter(i => !c.placed.includes(i));
      body = `${c.placed.length ? `<ol class="placed">${c.placed.map((i, p) => `<li><button data-unplace="${p}" title="Tap to take it back"><span class="n">${p + 1}</span><span>${esc(q.steps[i])}</span></button></li>`).join("")}</ol>` : ""}
        ${rest.length ? `<div class="steps-pick"><span class="hint">Tap the ${c.placed.length ? "next" : "first"} step${c.placed.length ? " (tap a placed step to take it back)" : ""}</span>${rest.map((i, k) => `<button class="step" data-step="${i}"><kbd>${k + 1}</kbd><span>${esc(q.steps[i])}</span></button>`).join("")}</div>` : ""}
        <div class="fb-actions"><button class="btn pri" id="q-check"${rest.length ? " disabled" : ""}>Check order</button>${c.hinted ? "" : `<button class="btn ghost hintbtn" id="q-hint"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2v.6h4v-.6c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5z"/></svg>Hint</button>`}${c.placed.length ? `<button class="btn ghost" id="q-reset">Start again</button>` : ""}</div>`;
    }
    return `<div class="qz">${head}<article class="qcard">${cardInner(c, q)}${body}${c.answered && !QS.timed ? feedbackHTML(c) : ""}</article></div>`;
  }
  function cardInner(c, q) {
    const opts = c.answered && q.kind === "mcq" && QS.view != null ? `<div class="opts">${q.opts.map((h, i) => `<button class="opt${i === q.right ? " right" : i === c.choice ? " wrong" : " dim"}" disabled><kbd>${i + 1}</kbd><span>${h}</span></button>`).join("")}</div>` : "";
    return `<div class="qtag"><span>${esc(q.tag)}</span>${q.src ? `<span>${esc(q.src)}</span>` : ""}<span class="lvl lvl-${c.it.lvl}">${LEVEL_LABEL[c.it.lvl]}</span>${c.again ? `<span class="again">Second try</span>` : ""}</div>
      <p class="qprompt">${q.prompt}</p>${c.excl ? `<p class="apart">Apart from <b>${esc(c.excl.label)}</b>, which you've given the last few times.</p>` : ""}${c.hinted ? `<div class="hintbox"><b>Hint</b><span>${esc(q.hint.text)}</span></div>` : ""}${opts}`;
  }
  function ratedHTML() {
    const rows = Object.entries(QS.rated || {}).filter(([, [from, to]]) => from !== to);
    if (!rows.length) return "";
    const pill = v => `<span class="pill ${v === 3 ? "ok" : v === 2 ? "warn" : "bad"}">${CONF_LABEL[v]}</span>`;
    const name = k => { if (k.startsWith("drug:")) { const d = drugById[k.slice(5)]; return d ? `<a href="#drugs-${d.cat}" data-opendrug="${d.id}">${esc(d.name)}</a>` : ""; } const h = loByKey[k]; return h ? loLink(h.lo.text.length > 80 ? h.lo.text.slice(0, 78).replace(/[\s,;:]+\S*$/, "") + "…" : h.lo.text, k) : ""; };
    return `<section class="rated"><h3 class="subhead">Ratings updated from this round</h3><ul class="dlos">${rows.slice(0, 12).map(([k, [, to]]) => `<li>${pill(to)}${name(k)}</li>`).join("")}</ul>${rows.length > 12 ? `<p class="lvhint">and ${rows.length - 12} more.</p>` : ""}</section>`;
  }
  function endHTML() {
    const miss = missedItems(), firsts = new Map();
    for (const r of QS.results) if (!firsts.has(r.it.id)) firsts.set(r.it.id, r);
    const firstRight = [...firsts.values()].filter(r => r.ok && !r.hinted).length, withHint = [...firsts.values()].filter(r => r.ok && r.hinted).length, s = stats();
    let sub = "";
    if (QS.mode === "daily" && !QS.early) sub = `Daily 10 done · ${s.streak}-day streak${meta.daily.best > s.streak ? ` (best ${meta.daily.best})` : ""}`;
    if ((QS.mode === "adaily" || QS.mode === "idaily") && !QS.early) { const g = GMODE[QS.mode][0], a = gStats(g); sub = `${GRP[g].name} Daily 10 done · ${a.streak}-day streak${a.best > a.streak ? ` (best ${a.best})` : ""}`; }
    if (QS.mode === "sprint") sub = QS.right > QS.prevBest ? (QS.prevBest ? `New best! Previous best was ${QS.prevBest}.` : "First sprint done. That's the score to beat.") : `Your best is ${meta.sprintBest}.`;
    const h = QS.timed ? `${QS.right} right${QS.early ? " (stopped early)" : ` in ${QS.timed} seconds`}` : `${firstRight} of ${firsts.size} right first time`;
    if (withHint && !QS.timed) sub = (sub ? sub + " · " : "") + `${withHint} more right with a hint`;
    const plain = html => html.replace(/<small>.*?<\/small>/g, "").replace(/<[^>]+>/g, "");
    const saved = QS.early && !QS.timed && histList().find(x => x.uid === QS.uid && x.resume);
    return `<div class="qz"><header class="week-head"><div class="eyebrow">${esc(QS.title)} · ${QS.early ? "ended early" : "finished"}</div><h2>${h}</h2>${sub ? `<div class="meta"><span>${sub}</span></div>` : ""}</header>
      ${saved ? `<div class="resume"><span>${leftIn(saved.resume)} questions left. They're saved in your quiz history.</span><button class="btn pri" data-carry="${QS.uid}">Carry on</button></div>` : ""}
      <div class="fb-actions">${miss.length ? `<button class="btn pri" id="q-retry">Retry ${miss.length === 1 ? "the 1" : `the ${miss.length}`} I missed or needed a hint for</button>` : ""}${QS.more ? `<button class="btn${miss.length ? "" : " pri"}" id="q-more">${/^(daily|extra|[ai]daily|[ai]extra)$/.test(QS.mode) ? "10 more" : "Another round"}</button>` : ""}${QS.past.length && !QS.timed ? `<button class="btn ghost" id="q-review">Review all ${QS.past.length} questions</button>` : ""}<button class="btn ghost" id="q-home">Quiz home</button></div>
      ${ratedHTML()}
      ${miss.length ? `<section class="misses"><h3 class="subhead">Worth another look</h3>${miss.map(it => { const r = QS.results.find(x => x.it === it); const hinted = QS.results.some(x => x.it === it && x.hinted) && !QS.results.some(x => x.it === it && !x.ok); return `<div class="miss"><b>${plain(r.q.prompt)}${hinted ? `<span class="hinted">hint used</span>` : ""}</b><span>${esc(r.q.answerText)}</span>${r.q.why ? `<span class="mwhy">${r.q.why}</span>` : ""}${r.q.lo && loByKey[r.q.lo] ? loLink("Open the notes", r.q.lo) : ""}</div>`; }).join("")}</section>` : `<p class="pending-note">Clean sweep: nothing to repeat.</p>`}
    </div>`;
  }
  function renderQuiz(top) {
    const v = $("#view");
    if (state.qscreen === "session" && QS) v.innerHTML = QS.done && QS.view == null ? endHTML() : sessionHTML();
    else if (state.qscreen === "custom") v.innerHTML = customHTML();
    else if (state.qscreen === "sprint") v.innerHTML = sprintHTML();
    else if (GRP[state.qscreen]) v.innerHTML = gHTML(state.qscreen);
    else if (state.qscreen === "iexam") v.innerHTML = examHTML();
    else if (GMODE[state.qscreen] && GMODE[state.qscreen][1] === "custom") v.innerHTML = gCustomHTML(GMODE[state.qscreen][0]);
    else if (state.qscreen === "due") v.innerHTML = dueHTML(null);
    else if (GMODE[state.qscreen] && GMODE[state.qscreen][1] === "due") v.innerHTML = dueHTML(GMODE[state.qscreen][0]);
    else if (state.qscreen === "hist") v.innerHTML = histHTML();
    else if (state.qscreen === "histone") v.innerHTML = histOneHTML();
    else { state.qscreen = "home"; v.innerHTML = homeHTML(); }
    logView(); saveRound();
    if (top) { $("#main").scrollTop = 0; if (window.innerWidth <= 860) window.scrollTo(0, 0); }
    const c = state.qscreen === "session" && QS && !QS.done && QS.view == null ? QS.cur : null;
    if (!c) { const f = QS && QS.view != null && $("#q-fwd"); if (f) f.focus({ preventScroll: true }); return; }
    if (!c.answered && (c.q.kind === "typed" || c.q.kind === "list")) { const inp = $("#qans") || $("#qlist"); if (inp) inp.focus({ preventScroll: !top }); }
    else if (c.answered && !QS.timed) { const nb = $("#q-next"); if (nb) nb.focus({ preventScroll: true }); const fb = $(".fb"); if (fb && fb.scrollIntoView) fb.scrollIntoView({ block: "nearest" }); }
  }
  function saveCfg() { store.set("qcfg", qcfg); store.set("acfg", acfg); store.set("icfg", icfg); store.set("xcfg", xcfg); const m = $("#main").scrollTop, y = window.scrollY; renderQuiz(); $("#main").scrollTop = m; window.scrollTo(0, y); return true; }
  const toggleIn = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };

  // Returns true when the click belonged to the quiz.
  function quizClick(e) {
    const t = e.target;
    const qm = t.closest("[data-qmode]"); if (qm) { goMode(qm.dataset.qmode); return true; }
    const hc = t.closest("[data-carry]"); if (hc) { carryOn(hc.dataset.carry); return true; }
    const ho = t.closest("[data-hist]"); if (ho) { state.histUid = ho.dataset.hist; state.qscreen = "histone"; showQuiz(true); return true; }
    const qd = t.closest("[data-qdrug]"); if (qd) { const d = drugById[qd.dataset.qdrug]; if (d) openDrugs(d.cat, d.id); return true; }
    const ql = t.closest("[data-quizlo]"); if (ql) { startLoQuiz(ql.dataset.quizlo); return true; }
    const qdr = t.closest("[data-quizdrug]"); if (qdr) { startDrugQuiz(qdr.dataset.quizdrug); return true; }
    if (t.closest("#quiz-week")) { startWeekQuiz(state.week); return true; }
    if (!t.closest(".qz") || t.closest("[data-opendrug]")) return false;
    const o = t.closest("[data-opt]"); if (o) { submit({ choice: +o.dataset.opt }); return true; }
    const la = t.closest("[data-learn]"); if (la) { learnAction(la.dataset.learn); return true; }
    const st = t.closest("[data-step]"); if (st) { place(+st.dataset.step); return true; }
    const up = t.closest("[data-unplace]"); if (up) { unplace(+up.dataset.unplace); return true; }
    const lm = t.closest("[data-lmatch]"); if (lm) { const [k, i] = lm.dataset.lmatch.split(":").map(Number); listMatch(k, i); return true; }
    const lx = t.closest("[data-lxtra]"); if (lx) { listXtra(+lx.dataset.lxtra); return true; }
    const lad = t.closest("[data-ladd]"); if (lad) { listOwn(+lad.dataset.ladd); return true; }
    const lan = t.closest("[data-laddnote]"); if (lan) { listOwnNote(+lan.dataset.laddnote); return true; }
    const ln = t.closest("[data-lxnote]"); if (ln) { listXnote(+ln.dataset.lxnote); return true; }
    const lu = t.closest("[data-lalias-undo]"); if (lu) { listAliasUndo(+lu.dataset.laliasUndo); return true; }
    const ls = t.closest("[data-lunsave]"); if (ls) { const [w, j] = ls.dataset.lunsave.split(":"); listUnsave(w, +j); return true; }
    const b = t.closest("button[id]");
    switch (b && b.id) {
      case "q-listdone": submit({ list: true }); return true;
      case "q-check": if (QS.cur.placed.length === QS.cur.q.steps.length) submit({ order: QS.cur.placed }); return true;
      case "q-reset": QS.cur.placed = []; renderQuiz(); return true;
      case "q-skip": submit({ skip: true }); return true;
      case "q-hint": useHint(); return true;
      case "q-next": if (Date.now() - (QS.cur ? QS.cur.at : 0) > 250) { nextQuestion(); renderQuiz(true); } return true;
      case "q-override": override(); return true;
      case "q-prev": case "q-prev2": reviewGo(-1); return true;
      case "q-fwd": reviewGo(1); return true;
      case "q-current": QS.view = null; renderQuiz(true); return true;
      case "q-review": QS.view = 0; renderQuiz(true); return true;
      case "q-end": finish(true); renderNav(); renderQuiz(true); return true;
      case "q-retry": { const items = missedItems(); startSession({ mode: "retry", title: "Missed questions", items: shuffle(items), mcq: QS.mcq, spec: { k: "retry", parent: QS.spec || null }, focus: QS.focus, more: QS.more }); return true; }
      case "q-more": QS.more(); return true;
      case "q-home": state.qscreen = "home"; renderNav(); renderQuiz(true); return true;
      case "q-resume": state.qscreen = "session"; renderNav(); renderQuiz(true); return true;
      case "q-start": startCustom(); return true;
      case "g-start": startGCustom(b.dataset.g); return true;
      case "x-start": startExamQuiz(); return true;
      case "q-due-go": if (b.dataset.g) startGDue(b.dataset.g); else startDue(); return true;
      case "h-retry": histRetry(); return true;
      case "h-again": { const e = histList().find(x => x.uid === state.histUid), m = e && sessionHooks(e.spec).more; if (m) m(); return true; }
      case "q-sprint-go": startSprint(); return true;
    }
    const sc = t.closest("[data-qscope]"); if (sc) { qcfg.scope = sc.dataset.qscope; return saveCfg(); }
    const lv = t.closest("[data-qlevel]"); if (lv) { const l = +lv.dataset.qlevel; if (!(qcfg.levels.length === 1 && qcfg.levels[0] === l)) toggleIn(qcfg.levels, l); qcfg.levels.sort(); renderNav(); return saveCfg(); }
    const wk = t.closest("[data-qweek]"); if (wk) { toggleIn(qcfg.weeks, wk.dataset.qweek); return saveCfg(); }
    const grp = id => (weekGroups().find(g => g[0] === id) || [, , []])[2];
    const ya = t.closest("[data-qall]"); if (ya) { qcfg.weeks = [...new Set([...qcfg.weeks, ...grp(ya.dataset.qall).filter(w => WEEK_N[w.id]).map(w => w.id)])]; return saveCfg(); }
    const yn = t.closest("[data-qnone]"); if (yn) { const ids = new Set(grp(yn.dataset.qnone).map(w => w.id)); qcfg.weeks = qcfg.weeks.filter(w => !ids.has(w)); return saveCfg(); }
    const sy = t.closest("[data-qsys]"); if (sy) { toggleIn(qcfg.systems, sy.dataset.qsys); return saveCfg(); }
    const ca = t.closest("[data-qcat]"); if (ca) { toggleIn(qcfg.cats, ca.dataset.qcat); return saveCfg(); }
    const qs = t.closest("[data-qstat]"); if (qs) { qcfg.status = statusPick(qcfg).slice(); toggleIn(qcfg.status, qs.dataset.qstat); delete qcfg.learning; return saveCfg(); }
    const fa = t.closest("[data-qfam]"); if (fa) { const f = fa.dataset.qfam; if (!(qcfg.fams.length === 1 && qcfg.fams[0] === f)) toggleIn(qcfg.fams, f); return saveCfg(); }
    const qn = t.closest("[data-qn]"); if (qn) { qcfg.n = qn.dataset.qn === "all" ? "all" : +qn.dataset.qn; return saveCfg(); }
    const dn = t.closest("[data-duen]"); if (dn) { qcfg.dueN = dn.dataset.duen === "all" ? "all" : +dn.dataset.duen; return saveCfg(); }
    const gb = t.closest("[data-gk]"); if (gb) return gSet(gb.dataset.g, gb.dataset.gk, gb.dataset.gv);
    const xb = t.closest("[data-xk]"); if (xb) return xSet(xb.dataset.xk, xb.dataset.xv);
    return true;
  }
  document.addEventListener("submit", e => { if (e.target.id === "qform") { e.preventDefault(); submit({ text: $("#qans").value }); } if (e.target.id === "qlistform") { e.preventDefault(); listEnter(); } });
  // Search quiz box: counts update as you type (without redrawing the box); Enter starts the quiz.
  let termT;
  document.addEventListener("input", e => {
    if (e.target.id !== "q-term") return;
    clearTimeout(termT); termT = setTimeout(() => { qcfg.term = e.target.value; store.set("qcfg", qcfg); refreshCustom(); }, 180);
  });
  document.addEventListener("keydown", e => {
    if (e.target.id !== "q-term" || e.key !== "Enter") return;
    e.preventDefault(); clearTimeout(termT); qcfg.term = e.target.value; store.set("qcfg", qcfg);
    if (poolFor(qcfg).length) startCustom(); else refreshCustom();
  });
  document.addEventListener("keydown", e => {
    if (state.year !== "quiz" || state.query.trim() || state.qscreen !== "session" || !QS) return;
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target.matches && e.target.matches("input, textarea"))) return;
    if (canLookBack() && (e.key === "ArrowLeft" || (QS.view != null && e.key === "ArrowRight"))) { e.preventDefault(); reviewGo(e.key === "ArrowLeft" ? -1 : 1); return; }
    if (QS.view != null || QS.done || !QS.cur) return;
    const c = QS.cur;
    if (!c.answered && (e.key === "h" || e.key === "H")) { e.preventDefault(); useHint(); return; }
    if (!c.answered && /^[1-9]$/.test(e.key)) {
      const i = +e.key - 1;
      if (c.q.kind === "mcq" && i < c.q.opts.length) { e.preventDefault(); submit({ choice: i }); }
      else if (c.q.kind === "order") { const rest = c.q.perm.filter(x => !c.placed.includes(x)); if (i < rest.length) { e.preventDefault(); place(rest[i]); } }
    } else if (c.answered && !QS.timed && e.key === "Enter" && !(e.target.closest && e.target.closest("button, a"))) {
      e.preventDefault(); if (Date.now() - c.at > 250) { nextQuestion(); renderQuiz(true); }
    }
  });


  /* ---------------- Progress ---------------- */
  // Every bar, ring and percentage comes from progressOf(scope). Ratings (LOs and drugs): Confident = 1, Shaky = ½,
  // Not yet or unrated = 0. Quiz questions: spaced-repetition box / 4, so a question counts fully once mastered.
  // Overall is the average of Year 1, Year 2, Drugs and Quiz. Elements carry data-prog/data-pk so
  // updateProgressUI() can redraw them in place after any rating or answer.
  const SCOPE_KEYS = { y1: [], y2: [], anat: [], icm: [], drugs: [] };
  for (const y of YEARS) for (const w of DATA[y]) { const keys = w.los.map(lo => lo.key); SCOPE_KEYS["week:" + w.id] = keys; SCOPE_KEYS[y].push(...keys); }
  for (const c of DRUGS) { const keys = c.items.map(d => "drug:" + d.id); SCOPE_KEYS["dcat:" + c.id] = keys; SCOPE_KEYS.drugs.push(...keys); }
  const QUIZ_SCOPE = {};
  function quizItemsFor(k, id, scope) {
    return QUIZ_SCOPE[scope] ||= k === "quiz" ? POOL : k === "qfam" ? POOL.filter(it => it.fam === id) : k === "qweek" ? POOL.filter(it => it.weeks.includes(id) || it.gw.anat.includes(id) || it.gw.icm.includes(id))
      : k === "qdcat" ? POOL.filter(it => it.cat === id) : k === "qdrug" ? POOL.filter(it => it.drug && it.drug.id === id)
      : k === "qyear" ? (GRP[id] ? POOL.filter(it => inG(it, id)) : POOL.filter(it => it.weeks.some(w => weeksById[w].year === id))) : k === "qlevel" ? POOL.filter(it => it.lvl === +id) : [];
  }
  function progressOf(scope) {
    const i = scope.indexOf(":"), k = i < 0 ? scope : scope.slice(0, i), id = i < 0 ? "" : scope.slice(i + 1);
    if (k === "total") { const parts = ["y1", "y2", "anat", "icm", "drugs", "quiz"].map(progressOf); return { kind: "total", n: 1, parts, score: parts.reduce((a, p) => a + p.score, 0) / parts.length }; }
    let ok = 0, warn = 0, bad = 0;
    if (k === "quiz" || ["qfam", "qweek", "qdcat", "qdrug", "qyear", "qlevel"].includes(k)) {
      const items = quizItemsFor(k, id, scope); let sum = 0;
      for (const it of items) { const e = srs[it.id]; if (!e) continue; if (e[0] >= 4) ok++; else if (e[0] > 0) warn++; else bad++; sum += Math.min(e[0], 4) / 4; }
      return { kind: "quiz", n: items.length, ok, warn, bad, score: items.length ? sum / items.length : 0 };
    }
    const keys = SCOPE_KEYS[scope] || [];
    for (const key of keys) { const v = conf[key]; if (v === 3) ok++; else if (v === 2) warn++; else if (v === 1) bad++; }
    return { kind: "rating", n: keys.length, ok, warn, bad, score: keys.length ? (ok + warn / 2) / keys.length : 0 };
  }
  const pct = s => s <= 0 ? "0%" : s < 0.005 ? "<1%" : Math.round(s * 100) + "%";
  function progText(p) {
    if (p.kind === "total") return ["Year 1", "Year 2", "Anatomy", "Drugs", "Quiz"].map((l, i) => `${l} ${pct(p.parts[i].score)}`).join(" · ");
    const rest = p.n - p.ok - p.warn - p.bad;
    return p.kind === "quiz" ? `${p.ok} mastered · ${p.warn} learning · ${p.bad} to redo · ${rest} not tried` : `${p.ok} confident · ${p.warn} shaky · ${p.bad} not yet · ${rest} unrated`;
  }
  function barHTML(p, thin) {
    const w = x => (p.n ? x / p.n * 100 : 0).toFixed(2) + "%";
    const fill = p.kind === "total" ? `<i class="b-acc" style="width:${(p.score * 100).toFixed(2)}%"></i>` : `<i class="b-ok" style="width:${w(p.ok)}"></i><i class="b-warn" style="width:${w(p.warn)}"></i><i class="b-bad" style="width:${w(p.bad)}"></i>`;
    return `<span class="pbar${thin ? " thin" : ""}" aria-hidden="true">${fill}</span>`;
  }
  // pk: "bar" | "pct" | "ring" | "row" (label, %, bar, counts) | "mini" (bar + %)
  function prog(pk, scope, label = "") {
    const p = progressOf(scope), attrs = `data-prog="${scope}" data-pk="${pk}"${label ? ` data-label="${esc(label)}"` : ""}`;
    const tip = esc(`${label ? label + ": " : ""}${pct(p.score)}${p.kind === "total" ? "" : " · " + progText(p)}`);
    if (pk === "pct") return `<span class="ppct" ${attrs}>${pct(p.score)}</span>`;
    if (pk === "bar") return `<span class="pwrap" ${attrs} title="${tip}">${barHTML(p, true)}</span>`;
    if (pk === "ring") {
      const c = 2 * Math.PI * 8.4;
      return `<svg class="ring" viewBox="0 0 22 22" ${attrs} aria-label="${tip}" role="img"><circle class="bg" cx="11" cy="11" r="8.4"/><circle class="fg" cx="11" cy="11" r="8.4" stroke-dasharray="${(p.score * c).toFixed(2)} ${c.toFixed(2)}"/></svg>`;
    }
    if (pk === "mini") return p.n ? `<span class="pmini" ${attrs} title="${tip}">${barHTML(p, true)}<b>${pct(p.score)}</b></span>` : `<span class="pmini none" ${attrs}>none yet</span>`;
    return `<div class="prow" ${attrs}><div class="prow-top"><span>${esc(label)}</span><b>${pct(p.score)}</b></div>${barHTML(p)}<div class="prow-nums">${progText(p)}</div></div>`;
  }
  function updateProgressUI() {
    for (const el of document.querySelectorAll("[data-prog]")) if (el.isConnected) el.outerHTML = prog(el.dataset.pk, el.dataset.prog, el.dataset.label || "");
    const ov = $("#open-progress"); if (ov) ov.setAttribute("aria-pressed", state.year === "progress");
    const mc = $("#mcount"); if (mc) mc.textContent = masteredCount();
  }

  function openProgress() {
    state.year = "progress"; state.query = ""; $("#q").value = "";
    renderNav(); renderProgress();
  }
  function renderProgress() {
    const s = stats();
    const line = (attrs, num, name, a, b) => `<button class="pline" ${attrs}><span class="nm"><span class="num">${num}</span>${esc(name)}</span>${a}${b}</button>`;
    const head = (a, b) => `<div class="plist-head"><span></span><span>${a}</span><span>${b}</span></div>`;
    const year = (y, title) => `<section class="psec" id="psec-${y}"><h3>${title}</h3>
        <div class="prows">${prog("row", y, "Learning outcome ratings")}${prog("row", "qyear:" + y, y === "icm" ? "Quiz questions on these systems" : "Quiz questions on these weeks")}</div>
        <div class="plist">${head("Ratings", "Quiz")}${DATA[y].map(w => line(`data-goweek="${w.id}"`, w.num, w.title, prog("mini", "week:" + w.id), prog("mini", "qweek:" + w.id))).join("")}</div></section>`;
    $("#view").innerHTML = `
      <header class="week-head"><div class="eyebrow">Progress</div><h2>Your progress</h2>
        <div class="fb-actions"><button class="btn" data-hnav="mastered">See what you've mastered</button></div>
        <div class="meta"><span>Ratings: <b>Confident</b> counts fully, <b>Shaky</b> half. Quiz: each question counts fully once mastered (right on 4 spaced reviews in a row). Overall is the average of Year 1, Year 2, Anatomy, Drugs and Quiz.</span></div></header>
      <section class="psec" id="psec-total">${prog("row", "total", "Overall")}
        <div class="prows">${prog("row", "y1", "Year 1 learning outcomes")}${prog("row", "y2", "Year 2 learning outcomes")}${prog("row", "anat", "Anatomy learning outcomes")}${prog("row", "icm", "ICM learning outcomes")}${prog("row", "drugs", "Drugs")}${prog("row", "quiz", "Quiz questions")}</div></section>
      ${year("y1", "Year 1")}${year("y2", "Year 2")}${year("anat", "Anatomy")}${year("icm", "ICM")}
      <section class="psec" id="psec-drugs"><h3>Drugs</h3>
        <div class="prows">${prog("row", "drugs", "Drug ratings")}${prog("row", "qfam:drug", "Drug quiz questions")}</div>
        <div class="plist">${head("Ratings", "Quiz")}${DRUGS.map(c => line(`data-gocat="${c.id}"`, c.items.length, c.title, prog("mini", "dcat:" + c.id), prog("mini", "qdcat:" + c.id))).join("")}</div></section>
      <section class="psec" id="psec-quiz"><h3>Quiz</h3>
        <div class="prows">${prog("row", "quiz", "All questions")}${["sa", "num", "list", "lad", "drug"].map(f => prog("row", "qfam:" + f, FAM_LABEL[f])).join("")}</div>
        <div class="prows">${[1, 2, 3].map(l => prog("row", "qlevel:" + l, LEVEL_LABEL[l] + " level")).join("")}</div>
        <div class="stats">${stat(s.due, "due for review")}${stat(s.streak, "day streak")}${stat(s.seen, "answers given")}${stat(meta.sprintBest || 0, "sprint best")}</div></section>
      <p class="foot-note">Tap a week or drug group to open it. Rate LOs and drugs with the Not yet / Shaky / Confident buttons on each card.</p>`;
    $("#main").scrollTop = 0;
    if (window.innerWidth <= 860) window.scrollTo(0, 0);
    logView();
  }

  /* ---------------- Home dashboard ---------------- */
  function openHome() {
    state.year = "home"; state.query = ""; $("#q").value = "";
    renderNav(); renderHome();
  }
  // The week to feature: this teaching week, else the next one to start, else the latest with notes.
  function homeWeek() {
    if (NOW) return { w: NOW, when: "This week" };
    const next = DATA.y2.find(w => w.date && new Date(w.date + "T00:00:00") > TODAY);
    if (next) return { w: next, when: "Next up" };
    const w = quizWeek(); return w ? { w, when: "Latest week" } : null;
  }
  function weekAccuracy() {
    const by = {};
    for (const id in srs) { const it = ITEM[id]; if (!it || !it.lo) continue; const w = weekOf(it.lo), a = by[w] ||= [0, 0]; a[0] += srs[id][2]; a[1] += srs[id][3]; }
    return Object.entries(by).filter(([, a]) => a[0] >= 5).map(([w, a]) => ({ w: weeksById[w], acc: a[1] / a[0], n: a[0] })).sort((x, y) => x.acc - y.acc);
  }
  function renderHome() {
    const s = stats(), hw = homeWeek(), hr = TODAY.getHours();
    const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    const today = TODAY.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const last = visibleWeek(store.get("last", null));
    const flagged = DATA.y1.concat(DATA.y2).flatMap(w => w.los).filter(lo => conf[lo.key] === 1 || conf[lo.key] === 2);
    const trouble = weekAccuracy().slice(0, 4);
    const upcoming = DATA.y2.filter(w => w.date && new Date(w.date + "T00:00:00") > TODAY).slice(0, 4);
    const idx = NOW ? DATA.y2.indexOf(NOW) + 1 : 0;
    const btn = (attrs, label, pri) => `<button class="btn${pri ? " pri" : ""}" ${attrs}>${label}</button>`;
    const wkTitle = w => `<span class="num">${w.num}</span>${esc(w.title)}`;

    const thisWeek = hw ? `<section class="dcard wide">
        <div class="eyebrow">${hw.when}${hw.w.date ? ` · w/c ${fmtDate(hw.w.date)}` : ""}${idx ? ` · week ${idx} of ${DATA.y2.length}` : ""}</div>
        <h3 class="dtitle">${wkTitle(hw.w)}</h3>
        <div class="meta">${hw.w.system ? `<span>${esc(hw.w.system)}</span>` : ""}<span><b>${hw.w.los.length}</b> learning outcomes</span><span>${hw.w.partial ? "Anatomy notes only" : hw.w.hasNotes ? "Notes ready" : "Notes coming soon"}</span></div>
        <div class="prows">${prog("row", "week:" + hw.w.id, "Your ratings")}${WEEK_N[hw.w.id] ? prog("row", "qweek:" + hw.w.id, "Quiz questions") : ""}</div>
        <div class="fb-actions">${btn(`data-goweek="${hw.w.id}"`, "Open the notes", true)}${WEEK_N[hw.w.id] ? btn(`data-quizweek="${hw.w.id}"`, `Quiz this week · ${WEEK_N[hw.w.id]}`) : ""}</div>
      </section>` : "";

    const daily = (mode, name, done) => modeRow(mode, name, done ? "done ✓" : "to do", done ? "Done today. Tap for 10 more" : "");
    const todayCard = `<section class="dcard">
        <div class="dcard-head"><h3>Today</h3><span>${s.streak ? `${s.streak}-day streak` : "Start a streak today"}${meta.daily.best > 1 ? ` · best ${meta.daily.best}` : ""}</span></div>
        <div class="menu">${daily("daily", "Daily 10", s.doneToday)}${(cp => modeRow("cont", "Continue learning", cp.close ? `${cp.close} new` : "", contText(cp), { disabled: !cp.items.length }))(contPlan())}${daily("adaily", "Anatomy Daily 10", gStats("anat").doneToday)}${daily("idaily", "ICM Daily 10", gStats("icm").doneToday)}${modeRow("due", "Review due", `${s.due} due`, "", { disabled: !s.due })}</div>
      </section>`;

    const progressCard = `<section class="dcard">
        <h3>Progress</h3>
        ${prog("row", "total", "Overall")}
        <div class="dminis">${[["y1", "Year 1"], ["y2", "Year 2"], ["anat", "Anatomy"], ["icm", "ICM"], ["drugs", "Drugs"], ["quiz", "Quiz"]].map(([sc, l]) => `<div><span>${l}</span>${prog("mini", sc)}</div>`).join("")}</div>
        <div class="fb-actions">${btn(`id="home-progress"`, "See all progress")}${btn(`data-hnav="mastered"`, "What I've mastered")}</div>
      </section>`;

    const rq = resumable();
    const quizBack = rq ? `<div class="dresume"><span class="eyebrow">Quiz${rq.live ? " in progress" : " left unfinished"}</span>
        <span class="dl-name">${esc(rq.title)}</span><span class="dl-sub">${rq.n} answered · ${rq.right} right · ${rq.left} left${rq.when ? ` · ${whenText(rq.when)}` : ""}</span>
        <div class="fb-actions">${btn(`data-carry="${rq.live ? "live" : rq.uid}"`, "Carry on with the quiz", true)}</div></div>` : "";
    const continueCard = last || rq ? `<section class="dcard">
        <h3>Pick up where you left off</h3>
        ${quizBack}
        ${last ? `<div class="dweeks"><button class="dlink" data-goweek="${last.id}"><span class="dl-name">${wkTitle(last)}</span><span class="dl-sub">Notes · ${YEAR_LABEL[last.year]} · ${last.los.length} LOs</span>${prog("mini", "week:" + last.id)}</button></div>
        ${WEEK_N[last.id] && !rq ? `<div class="fb-actions">${btn(`data-quizweek="${last.id}"`, last.yr ? "Quiz this system" : `Quiz week ${last.num}`)}</div>` : ""}` : ""}
      </section>` : "";
    const recent = histList().slice(0, 4);
    const histCard = `<section class="dcard">
        <h3>Recent quizzes</h3>
        ${recent.length ? `<div class="dweeks">${recent.map(e => `<button class="dlink hlink" data-hist="${e.uid}"><span class="dl-name">${esc(e.title)}</span><span class="dl-sub">${whenText(e.ended)} · ${histScore(e)}${e.resume ? " · unfinished" : ""}</span><span class="hpct">${histPct(e)}</span></button>`).join("")}</div>`
          : `<p class="dnote">Your quizzes will show here once you've done one, with the score and every question.</p>`}
        <div class="fb-actions">${btn(`data-qmode="hist"`, "Quiz history")}</div>
      </section>`;

    const focusCard = `<section class="dcard">
        <h3>Weak spots</h3>
        ${flagged.length ? `<ul class="dlos">${flagged.slice(0, 4).map(lo => `<li><span class="pill ${conf[lo.key] === 1 ? "bad" : "warn"}">${CONF_LABEL[conf[lo.key]]}</span>${loLink(lo.text.length > 90 ? lo.text.slice(0, 88).replace(/[\s,;:]+\S*$/, "") + "…" : lo.text, lo.key)}</li>`).join("")}</ul>
          <div class="fb-actions">${btn(`data-qmode="shaky"`, `Drill shaky LOs · ${flagged.length}`, false)}</div>` : ""}
        ${trouble.length ? `<div class="dweeks">${trouble.map(t => `<button class="dlink" data-quizweek="${t.w.id}"><span class="dl-name">${wkTitle(t.w)}</span><span class="dl-sub">${Math.round(t.acc * 100)}% right · ${t.n} answers · tap to quiz it again</span></button>`).join("")}</div>` : ""}
        ${flagged.length || trouble.length ? "" : `<p class="dnote">Mark LOs <b>Not yet</b> or <b>Shaky</b> as you revise, and answer a few questions on a week. Your weakest LOs and weeks collect here.</p>`}
      </section>`;

    const comingCard = upcoming.length ? `<section class="dcard">
        <h3>Coming up</h3>
        <div class="dweeks">${upcoming.map(w => `<button class="dlink" data-goweek="${w.id}"><span class="dl-name">${wkTitle(w)}</span><span class="dl-sub">w/c ${fmtDate(w.date)} · ${w.partial ? "anatomy notes only" : w.hasNotes ? "notes ready" : "notes coming"}</span></button>`).join("")}</div>
      </section>` : "";

    $("#view").innerHTML = `
      <header class="week-head"><div class="eyebrow">${today}</div><h2>${greet}</h2>
        <div class="meta"><span>Year 2${idx ? ` · week ${idx} of ${DATA.y2.length}` : ""}</span><span><b>${pct(progressOf("total").score)}</b> overall</span></div></header>
      ${thisWeek}
      <div class="dash"><div class="dcol">${todayCard}${histCard}${focusCard}</div><div class="dcol">${continueCard}${progressCard}${comingCard}</div></div>`;
    $("#main").scrollTop = 0;
    if (window.innerWidth <= 860) window.scrollTo(0, 0);
    logView();
  }

  /* ---------------- Mastered ---------------- */
  // LOs and drugs rated Confident (by you or by the quiz) and quiz questions mastered (box 4+: right on 4 spaced reviews
  // in a row). The quiz button re-tests mastered questions; a wrong answer sends one back to the start.
  const isMastered = id => { const e = srs[id]; return !!e && e[0] >= 4; };
  function masteredData() {
    const los = [], drugs = [], qs = []; let nearly = 0;
    for (const y of YEARS) for (const w of DATA[y]) if (!(w.link && y === "anat")) for (const lo of w.los) if (conf[lo.key] === 3) los.push({ w, lo });
    for (const c of DRUGS) for (const d of c.items) if (conf["drug:" + d.id] === 3) drugs.push({ c, d });
    for (const it of POOL) { const e = srs[it.id]; if (!e) continue; if (e[0] >= 4) qs.push(it); else if (e[0] === 3) nearly++; }
    return { los, drugs, qs, nearly };
  }
  function masteredCount() {
    let los = 0, qs = 0;
    for (const k in conf) if (conf[k] === 3 && loByKey[k]) los++;
    for (const id in srs) if (ITEM[id] && srs[id][0] >= 4) qs++;
    return `${los} LO${los === 1 ? "" : "s"} · ${qs} question${qs === 1 ? "" : "s"}`;
  }
  // A fixed description of each question (the quiz builds the real wording fresh each time).
  function qLabel(it) {
    const d = it.drug, dn = d && esc(lc1(d.name)), be = d && (isPl(d) ? "are" : "is");
    switch (it.t) {
      case "sa": return [esc(it.q), esc(it.model)];
      case "num": return [esc(it.q), esc(it.shown)];
      case "list": return [esc(it.title), esc(it.items.map(x => x[0]).join(it.ordered ? " → " : "; "))];
      case "order": return [`Put in order: ${esc(it.title)}`, esc(it.steps.join(" → "))];
      case "next": return [`What comes next: ${esc(it.title)}`, `${it.steps.length} steps`];
      case "duse": return [`What ${dn} ${be} used for`, esc(d.uses.map(u => u.t).join("; "))];
      case "dhow": return [`How ${dn} work${isPl(d) ? "" : "s"}`, esc(d.how)];
      case "dse": return [`Main side effects of ${dn}`, esc(d.se.join("; "))];
      case "dci": return [`When ${dn} ${be} avoided or used with caution`, esc(d.ci.map(x => x.c).join("; "))];
      case "dwhy": return [`Why ${dn} ${be} avoided in each of these`, esc(d.ci.map(x => x.c).join("; "))];
    }
    return [esc(it.id), ""];
  }
  const qGroup = it => it.drug ? "d:" + it.cat : it.gw.icm[0] || it.weeks[0] || "other";
  function openMastered(tab) {
    state.year = "mastered"; state.query = ""; $("#q").value = "";
    if (tab) state.mtab = tab;
    renderNav(); renderMastered();
  }
  function startMasteredQuiz() {
    const items = POOL.filter(it => isMastered(it.id));
    startSession({ mode: "mastered", title: "Mastered check", items: choose(items, 20), empty: "Nothing mastered yet.", spec: { k: "mastered" }, more: startMasteredQuiz });
  }
  function renderMastered() {
    const m = masteredData(), tab = state.mtab || "los", T0 = dayNum();
    const totalLos = new Set([...SCOPE_KEYS.y1, ...SCOPE_KEYS.y2, ...SCOPE_KEYS.anat, ...SCOPE_KEYS.icm]).size, totalDrugs = DRUGS.reduce((a, c) => a + c.items.length, 0);
    const card = (id, n, of, label) => `<button class="mcount" data-mtab="${id}" aria-pressed="${tab === id}"><b>${n.toLocaleString("en-GB")}</b><span>${label}</span><span class="mof">of ${of.toLocaleString("en-GB")}</span><span class="pbar thin"><i class="b-ok" style="width:${(of ? n / of * 100 : 0).toFixed(2)}%"></i></span></button>`;
    const when = t => t ? new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
    const src = k => fromQuiz(k) ? '<span class="msrc quiz">from quiz</span>' : '<span class="msrc">your rating</span>';
    const doubt = items => { const v = items.length ? quizVerdict(items) : 0; return v && v < 3 ? `<span class="msrc warn">quiz says ${CONF_LABEL[v].toLowerCase()}</span>` : ""; };
    const since = k => confT[k] && confT[k][1] ? `<span>since ${when(confT[k][1])}</span>` : "";
    const empty = html => `<p class="pending-note">${html}</p>`;
    let body = "";
    if (tab === "los") {
      if (!m.los.length) body = empty("No learning outcomes yet. Rate one <b>Confident</b> on its card, or master its quiz questions and the quiz marks it for you.");
      else {
        const by = new Map(); for (const h of m.los) { if (!by.has(h.w)) by.set(h.w, []); by.get(h.w).push(h.lo); }
        let yr = null;
        for (const [w, list] of by) {
          if (w.year !== yr) { yr = w.year; body += `<h3 class="mhead">${YEAR_LABEL[yr]}</h3>`; }
          body += `<section class="mgroup"><button class="mweek" data-goweek="${w.id}"><span class="num">${w.num}</span>${esc(w.title)}<span class="mct">${list.length} of ${w.los.length} LOs</span></button><ul class="mlist">${list.map(lo => {
            const items = RATE_ITEMS[lo.key] || [], mq = items.filter(it => isMastered(it.id)).length;
            return `<li>${loLink(lo.text, lo.key)}<span class="mmeta">${src(lo.key)}${doubt(items)}${items.length ? `<span>${mq} of ${items.length} quiz question${items.length === 1 ? "" : "s"} mastered</span>` : ""}${since(lo.key)}</span></li>`;
          }).join("")}</ul></section>`;
        }
      }
    } else if (tab === "drugs") {
      if (!m.drugs.length) body = empty("No drugs yet. Rate a drug <b>Confident</b> on its card, or master its drug drills.");
      else {
        const by = new Map(); for (const h of m.drugs) { if (!by.has(h.c)) by.set(h.c, []); by.get(h.c).push(h.d); }
        for (const [c, list] of by) body += `<section class="mgroup"><button class="mweek" data-gocat="${c.id}">${esc(c.title)}<span class="mct">${list.length} of ${c.items.length} drugs</span></button><ul class="mlist">${list.map(d => {
          const k = "drug:" + d.id, items = RATE_ITEMS[k] || [], mq = items.filter(it => isMastered(it.id)).length;
          return `<li><span><button class="linkish" data-opendrug="${d.id}">${esc(d.name)}</button>${d.ex ? ` <small class="mex">${esc(d.ex)}</small>` : ""}</span><span class="mmeta">${src(k)}${doubt(items)}<span>${mq} of ${items.length} drills mastered</span>${since(k)}</span></li>`;
        }).join("")}</ul></section>`;
      }
    } else {
      if (!m.qs.length) body = empty("No questions mastered yet. A question counts once you've got it right on 4 spaced reviews in a row, which takes about two to three weeks of reviews.");
      else {
        const order = new Map(), totals = {};
        DATA.y1.concat(DATA.y2, DATA.anat, DATA.icm).forEach((w, i) => order.set(w.id, i)); DRUGS.forEach((c, i) => order.set("d:" + c.id, 1000 + i));
        for (const it of POOL) { const g = qGroup(it); totals[g] = (totals[g] || 0) + 1; }
        const by = new Map(); for (const it of m.qs) { const g = qGroup(it); if (!by.has(g)) by.set(g, []); by.get(g).push(it); }
        const groups = [...by.entries()].sort((a, b) => (order.get(a[0]) ?? 9999) - (order.get(b[0]) ?? 9999));
        const open = m.qs.length <= 25;
        for (const [g, list] of groups) {
          const w = weeksById[g], c = g.startsWith("d:") && catById[g.slice(2)];
          const title = w ? `<span class="num">${YEAR_SHORT[w.year]} ${w.num}</span>${esc(w.title)}` : c ? `<span class="num">Drugs</span>${esc(c.title)}` : "Other";
          list.sort((a, b) => srs[a.id][1] - srs[b.id][1]);
          body += `<details class="mgroup"${open ? " open" : ""}><summary class="mweek">${title}<span class="mct">${list.length} of ${totals[g]}</span></summary><ul class="mlist">${list.map(it => {
            const [q, a] = qLabel(it), due = srs[it.id][1] - T0;
            return `<li><span class="mq">${q}</span>${a ? `<span class="ma">${a}</span>` : ""}<span class="mmeta"><span>${FAM_LABEL[it.fam]}</span><span>${due <= 0 ? "review due now" : `next review in ${due} day${due === 1 ? "" : "s"}`}</span>${it.lo && loByKey[it.lo] ? loLink("notes", it.lo) : it.drug ? `<button class="linkish" data-opendrug="${it.drug.id}">drug card</button>` : ""}</span></li>`;
          }).join("")}</ul></details>`;
        }
      }
    }
    const tip = { los: "Learning outcomes rated <b>Confident</b>, by you or by the quiz.", drugs: "Drugs rated <b>Confident</b>, by you or by their drug drills.", qs: "Questions you've got right on 4 spaced reviews in a row. Any you get wrong go back to the start." }[tab];
    $("#view").innerHTML = `
      <header class="week-head">${histBackLink({ v: "mastered" }, ["progress", "home", "quiz", "week"])}<div class="eyebrow">Mastered</div><h2>What you've mastered</h2>
        <div class="meta"><span>${m.los.length + m.drugs.length + m.qs.length ? `${m.qs.length} quiz question${m.qs.length === 1 ? "" : "s"} mastered${m.nearly ? `, and <b>${m.nearly}</b> more one right answer away` : ""}.` : "Nothing yet: this fills up as you rate cards Confident and master quiz questions."}</span></div></header>
      <div class="mcounts">${card("los", m.los.length, totalLos, "Learning outcomes")}${card("drugs", m.drugs.length, totalDrugs, "Drugs")}${card("qs", m.qs.length, POOL.length, "Quiz questions")}</div>
      <div class="mtools"><p class="lvhint">${tip}</p>${m.qs.length ? `<button class="btn" id="q-mastered">Re-test what I've mastered · ${Math.min(20, m.qs.length)}</button>` : ""}</div>
      ${body}`;
    $("#main").scrollTop = 0;
    if (window.innerWidth <= 860) window.scrollTo(0, 0);
    logView();
  }

  /* ---------------- Back / forward ---------------- */
  // In-app history: every view (week, drug group, search, quiz screen) is an entry with its scroll position.
  // Re-rendering the same view updates its entry; going somewhere new pushes one and drops anything forward of it.
  const hist = { stack: [], i: -1, restoring: false, clearing: false };
  function snapshot() {
    if (state.query.trim()) return { v: "search", q: state.query, year: state.year };
    if (state.year === "progress") return { v: "progress" };
    if (state.year === "home") return { v: "home" };
    if (state.year === "mastered") return { v: "mastered", tab: state.mtab || "los" };
    if (state.year === "drugs") return { v: "drugs", cat: state.cat, drug: state.drug || null };
    if (state.year === "quiz") return { v: "quiz", screen: state.qscreen, hist: state.histUid };
    return { v: "week", week: state.week, filter: state.filter };
  }
  function sameView(a, b) {
    if (!a || !b || a.v !== b.v) return false;
    return a.v === "search" || a.v === "progress" || a.v === "home" || a.v === "mastered" || (a.v === "drugs" ? a.cat === b.cat : a.v === "quiz" ? a.screen === b.screen : a.week === b.week);
  }
  const curScroll = () => window.innerWidth <= 860 ? window.scrollY : $("#main").scrollTop;
  function setScroll(y) { if (window.innerWidth <= 860) window.scrollTo(0, y); else $("#main").scrollTop = y; }
  function entryLabel(e) {
    if (e.v === "search") return `Search “${e.q.trim()}”`;
    if (e.v === "progress") return "Progress";
    if (e.v === "home") return "Home";
    if (e.v === "mastered") return "Mastered";
    if (e.v === "drugs") return e.drug && drugById[e.drug] ? drugById[e.drug].name : (catById[e.cat] || DRUGS[0]).title;
    if (e.v === "quiz") return e.screen === "session" && QS ? "Quiz: " + QS.title + (QS.done ? " (results)" : "") : { custom: "Custom quiz", sprint: "60-second sprint", anat: "Anatomy quiz", acustom: "Custom anatomy quiz", due: "Review due", adue: "Anatomy review due", icm: "ICM quiz", icustom: "Custom ICM quiz", iexam: "ICM examination quiz", idue: "ICM review due", hist: "Quiz history", histone: "Quiz history" }[e.screen] || "Quiz home";
    const w = weeksById[e.week]; return w ? `${w.num} ${w.title}` : "Back";
  }
  // Where Back would go from `view`, whether or not `view` has been recorded yet.
  function backTarget(view) { const cur = hist.stack[hist.i]; return cur && !sameView(cur, view) ? cur : hist.stack[hist.i - 1]; }
  function histBackLink(view, kinds) {
    const t = backTarget(view);
    return t && kinds.includes(t.v) ? `<button class="backlink" data-histback>← Back to ${esc(entryLabel(t))}</button>` : "";
  }
  function syncHash(s) {
    const h = s.v === "week" ? "#" + s.week : s.v === "drugs" ? "#drugs-" + s.cat : s.v === "quiz" ? "#quiz" : s.v === "progress" ? "#progress" : s.v === "home" ? "#home" : s.v === "mastered" ? "#mastered" : null;
    if (h && location.hash !== h) history.replaceState(null, "", h);
  }
  function logView() {
    edCheck();
    if (hist.restoring) return;
    const s = snapshot(), cur = hist.stack[hist.i], prev = hist.stack[hist.i - 1], clearing = hist.clearing;
    hist.clearing = false; syncHash(s);
    if (cur && sameView(cur, s)) { Object.assign(cur, s); return updateNavUI(); }
    if (clearing && cur && cur.v === "search" && prev && sameView(prev, s)) {  // search cleared: step back rather than add an entry
      hist.stack.splice(hist.i); hist.i--; Object.assign(prev, s); setScroll(prev.scroll || 0); return updateNavUI();
    }
    hist.stack.splice(hist.i + 1);
    hist.stack.push({ ...s, scroll: 0 });
    if (hist.stack.length > 100) hist.stack.shift();
    hist.i = hist.stack.length - 1;
    updateNavUI();
  }
  function go(delta) {
    const j = hist.i + delta, e = hist.stack[j]; if (!e) return;
    keepScroll();
    const y = e.scroll || 0;
    hist.i = j; hist.restoring = true;
    try {
      if (e.v === "search") { state.year = e.year; state.query = e.q; $("#q").value = e.q; render(); }
      else if (e.v === "drugs") openDrugs(e.cat);
      else if (e.v === "progress") openProgress();
      else if (e.v === "home") openHome();
      else if (e.v === "mastered") openMastered(e.tab);
      else if (e.v === "quiz") { state.qscreen = e.screen === "session" && !QS ? "home" : e.screen; if (e.hist) state.histUid = e.hist; showQuiz(false); }
      else { state.filter = e.filter || "All"; openWeek(e.week); }
    } finally { hist.restoring = false; }
    syncHash(snapshot());  // views that don't set the address themselves (home, progress, mastered, quiz)
    setScroll(y); updateNavUI();
  }
  function updateNavUI() {
    const nav = $("#histnav"), b = $("#nav-back"), f = $("#nav-fwd"), prev = hist.stack[hist.i - 1], next = hist.stack[hist.i + 1];
    nav.hidden = !prev && !next;
    b.disabled = !prev; f.disabled = !next;
    b.querySelector("span").textContent = prev ? entryLabel(prev) : "Back";
    b.title = prev ? "Back to " + entryLabel(prev) : "Nothing to go back to";
    f.title = next ? "Forward to " + entryLabel(next) : "Nothing to go forward to";
    b.setAttribute("aria-label", b.title); f.setAttribute("aria-label", f.title);
  }
  const keepScroll = () => { const e = hist.stack[hist.i]; if (e && !hist.restoring) e.scroll = curScroll(); };
  // Positions are saved on scroll and again at the moment of any tap or key press, before a view can change.
  $("#main").addEventListener("scroll", keepScroll, { passive: true });
  window.addEventListener("scroll", keepScroll, { passive: true });
  document.addEventListener("pointerdown", keepScroll, true);
  document.addEventListener("keydown", keepScroll, true);

  document.addEventListener("click", e => {
    if (editClick(e)) return;
    if (e.target.closest("#nav-back, [data-histback]")) { go(-1); return; }
    if (e.target.closest("#nav-fwd")) { go(1); return; }
    const golo = e.target.closest("[data-golo]");
    if (golo) { e.preventDefault(); const hit = loByKey[golo.dataset.golo]; if (hit) { const from = golo.closest(".drug"), cur = hist.stack[hist.i]; if (from && cur && cur.v === "drugs") cur.drug = from.id.slice(5); openWeek(hit.w.id, golo.dataset.golo); } return; }
    if (e.target.closest("#open-progress, #home-progress")) { openProgress(); return; }
    if (e.target.closest("#go-home")) { openHome(); return; }
    if (e.target.closest("#go-mastered")) { openMastered(); return; }
    const mt = e.target.closest("[data-mtab]"); if (mt) { state.mtab = mt.dataset.mtab; renderNav(); renderMastered(); return; }
    if (e.target.closest("#q-mastered")) { startMasteredQuiz(); return; }
    const hn = e.target.closest("[data-hnav]");
    if (hn) { const v = hn.dataset.hnav; if (v === "home") openHome(); else if (v === "progress") openProgress(); else if (v === "mastered") openMastered(); else if (v.startsWith("week:")) { state.filter = "All"; openWeek(v.slice(5)); } else goMode(v); return; }
    const qw = e.target.closest("[data-quizweek]"); if (qw) { startWeekQuiz(qw.dataset.quizweek); return; }
    const yg = e.target.closest("[data-yeargo]"); if (yg) { $("#yr-" + yg.dataset.yeargo).click(); return; }
    const gw = e.target.closest("[data-goweek]"); if (gw) { state.filter = "All"; openWeek(gw.dataset.goweek); return; }
    const gc = e.target.closest("[data-gocat]"); if (gc) { openDrugs(gc.dataset.gocat); return; }
    const ps = e.target.closest("[data-psec]"); if (ps) { const el = document.getElementById("psec-" + ps.dataset.psec); if (el) el.scrollIntoView({ block: "start" }); return; }
    if (quizClick(e)) return;
    const dlink = e.target.closest("[data-drug]");
    if (dlink) { e.preventDefault(); const el = document.getElementById("drug-" + dlink.dataset.drug); if (el) { el.scrollIntoView({ block: "start" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } return; }
    const od = e.target.closest("[data-opendrug]");
    if (od) { const d = drugById[od.dataset.opendrug]; if (d) openDrugs(d.cat, d.id); return; }
    const cbtn = e.target.closest(".weeks button[data-cat]");
    if (cbtn) { openDrugs(cbtn.dataset.cat); return; }
    const yb = e.target.closest(".years button");
    if (yb && yb.dataset.year === "quiz") { if (state.year === "quiz" && !state.query.trim()) state.qscreen = "home"; showQuiz(true); return; }
    if (yb && yb.dataset.year === "drugs") { if (state.year !== "drugs" || state.query) openDrugs(state.cat); return; }
    if (yb) { const y = yb.dataset.year; if (y !== state.year) { const last = store.get("last-" + y, null); openWeek(last && weeksById[last] ? last : (y === "y2" && NOW ? NOW.id : DATA[y][0].id)); } return; }
    const wb = e.target.closest(".weeks button");
    if (wb) { state.filter = "All"; openWeek(wb.dataset.week); store.set("last-" + state.year, wb.dataset.week); return; }
    const chip = e.target.closest(".chip");
    if (chip) { state.filter = chip.dataset.filter; renderWeek(); return; }
    const cb = e.target.closest(".conf");
    if (cb) {
      const k = cb.dataset.key, v = +cb.dataset.v;
      confT[k] = [conf[k] === v ? 0 : v, nowS(), confT[k] ? confT[k][2] || 0 : 0, 0]; rebuildConf();
      store.set("conf", confT); schedulePush("state");
      const qr = cb.parentElement.querySelector(".qrated"); if (qr) qr.remove();
      const scroll = $("#main").scrollTop, wy = window.scrollY;
      for (const b of cb.parentElement.querySelectorAll(".conf")) b.setAttribute("aria-pressed", conf[k] === +b.dataset.v);
      updateProgressUI();
      $("#main").scrollTop = scroll; window.scrollTo(0, wy);
      return;
    }
    const tg = e.target.closest("[data-toggle]");
    if (tg) { const card = tg.closest(".lo"); if (card.classList.contains("editing")) return; const c = card.classList.toggle("closed"); card.classList.remove("reveal-hint"); tg.setAttribute("aria-expanded", !c); return; }
    if (e.target.closest("#hide-notes")) { state.hideNotes = !state.hideNotes; store.set("hide", state.hideNotes); renderWeek(); return; }
    if (e.target.closest("#open-all")) { for (const c of document.querySelectorAll(".lo")) { c.classList.remove("closed", "reveal-hint"); c.querySelector("[data-toggle]").setAttribute("aria-expanded", true); } return; }
    const res = e.target.closest(".res");
    if (res) { openWeek(res.dataset.week, res.dataset.goto); return; }
  });

  let qt;
  $("#q").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { state.query = e.target.value; if (!state.query.trim()) hist.clearing = true; render(); }, 120); });
  $("#q").addEventListener("keydown", e => { if (e.key === "Escape") { e.target.value = ""; state.query = ""; hist.clearing = true; render(); } });
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (id === "quiz") { if (state.year !== "quiz") showQuiz(true); return; }
    if (id === "progress") { if (state.year !== "progress") openProgress(); return; }
    if (id === "home") { if (state.year !== "home") openHome(); return; }
    if (id === "mastered") { if (state.year !== "mastered") openMastered(); return; }
    if (id.startsWith("drugs")) { const c = id.slice(6); if (state.year !== "drugs" || c !== state.cat) openDrugs(c); return; }
    if (weeksById[id] && id !== state.week) openWeek(id);
  });

  initSync();
  updateProgressUI();
  const fromHash = location.hash.slice(1);
  { const s = store.get("qround", null);  // carry on the round that was open when the app was closed (whatever page opens)
    if (s && Array.isArray(s.queue)) { try { const R = restoreSession(s); if (R.cur || R.queue.length) { QS = R; if (!QS.cur) nextQuestion(); } else store.set("qround", null); } catch (err) { console.warn("Couldn't restore the quiz round", err); } } }
  if (fromHash === "quiz") { showQuiz(true); return; }
  if (fromHash === "progress") { openProgress(); return; }
  if (fromHash === "mastered") { openMastered(); return; }
  if (fromHash.startsWith("drugs") && DRUGS.length) { openDrugs(fromHash.slice(6)); return; }
  if (weeksById[fromHash]) openWeek(fromHash); else openHome();
})();
