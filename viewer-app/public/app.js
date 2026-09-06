const appEl = document.getElementById("app");
const contextBarEl = document.getElementById("context-bar");

// A window's tab loads this same app in an iframe with ?embed=1 in the URL — that flag stays
// put across hash navigation inside the iframe (query strings aren't touched by hash changes),
// so it hides the topbar/sidebar/context-bar for the whole life of that tab (the outer window
// manager supplies its own tab strip instead — see the window-manager section below).
if (new URLSearchParams(location.search).get("embed") === "1") {
  document.documentElement.classList.add("embed");

  // Opening an attempt always moves to a brand-new window rather than navigating in place —
  // used both for real link clicks and for whole-row clicks on a table row (see .row-link
  // below), so both paths behave identically.
  function navigateEmbedHash(href) {
    if (/\/attempts\/[^/]+$/.test(href)) {
      window.parent.postMessage({ type: "open-window", hash: href }, window.location.origin);
    } else {
      window.location.hash = href;
    }
  }

  // Except the attempt-switcher pills (.attempt-nav), where you're already viewing one attempt
  // and just paging to a sibling, which should stay in the same tab.
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest('a[href^="#/"]');
      if (!a || a.closest(".attempt-nav")) return;
      const href = a.getAttribute("href");
      if (/\/attempts\/[^/]+$/.test(href)) {
        e.preventDefault();
        navigateEmbedHash(href);
      }
    },
    true
  );

  // Whole submissions-table rows are clickable, not just the "Attempt N" link text — except
  // when the click actually landed on a real link (e.g. a cross-reference to a different
  // attempt in another column), which should go where it points instead of the row's own href.
  document.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row-link[data-href]");
    if (!tr || e.target.closest("a")) return;
    navigateEmbedHash(tr.dataset.href);
  });
}

const PHASES = ["design", "terraform", "test"];
const PHASE_LABEL = { design: "Design doc", terraform: "Terraform", test: "Test & evidence", "given-app": "Code Analysis" };

// The Obsidian vault root is now the "Claude Projects" folder itself
// (C:\Users\david\Downloads\Claude Projects) — this project lives directly under it at
// "System Design", so that's the only prefix file paths in obsidian:// links need.
const OBSIDIAN_VAULT_NAME = "Claude Projects";
const OBSIDIAN_PATH_PREFIX = "System Design";

function obsidianUri(relativePath) {
  const withoutExt = relativePath.replace(/\.md$/, "");
  return `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT_NAME)}&file=${encodeURIComponent(
    `${OBSIDIAN_PATH_PREFIX}/${withoutExt}`
  )}`;
}

// Small diamond glyph used everywhere a file reference can be opened directly in Obsidian —
// no separate "Open in Obsidian" button needed, just this icon next to the filename.
const OBSIDIAN_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 1.5 14 8 8 14.5 2 8Z" stroke-linejoin="round"/></svg>';

function obsidianIconLink(relativePath, title = "Open in Obsidian") {
  return `<a class="obsidian-icon-link" href="${obsidianUri(relativePath)}" title="${escapeHtml(
    title
  )}" aria-label="${escapeHtml(title)}">${OBSIDIAN_ICON_SVG}</a>`;
}

// Terraform (unlike a single markdown file) is normally edited across a whole folder of files
// at once, not one note at a time in Obsidian — so alongside the usual per-file Obsidian links,
// the folder itself gets a button that opens it directly in VS Code, a real editor built for
// multi-file work. This is a button that POSTs to /api/open-folder, not a plain file:// link —
// browsers block top-level navigation from an http(s) page to file:// as a security measure, so
// a real <a> link here just silently fails; the server launches VS Code itself instead (see
// that endpoint and its VSCODE_COMMAND resolution).
const FOLDER_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M1.5 3.5h4l1.3 1.6h7.7v7.4h-13Z" stroke-linejoin="round"/></svg>';

function openFolderLinkHtml(relativePath, label = "Open in VS Code") {
  return `<button type="button" class="obsidian-icon-link open-folder-link" data-folder-path="${escapeHtml(
    relativePath
  )}" title="${escapeHtml(`Open ${relativePath}/ in VS Code`)}" aria-label="${escapeHtml(
    label
  )}">${FOLDER_ICON_SVG}<span>${escapeHtml(label)}</span></button>`;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".open-folder-link");
  if (!btn || btn.disabled) return;
  const relPath = btn.dataset.folderPath;
  const original = btn.innerHTML;
  // Disabled the instant the click registers (not just once the request resolves) — the
  // request itself is fast, but Windows won't reliably pop the VS Code window to the front (see
  // server.js's tryFocusVSCodeWindow), so there's no obvious visual cue otherwise, and it was
  // easy to mash the button a few times wondering if the first click landed.
  btn.disabled = true;
  btn.classList.remove("open-folder-success");
  btn.innerHTML = `${FOLDER_ICON_SVG}<span>Opening…</span>`;
  postJson("/api/open-folder", { path: relPath })
    .then(() => {
      btn.classList.add("open-folder-success");
      btn.innerHTML = `${FOLDER_ICON_SVG}<span>Opened — check your taskbar</span>`;
    })
    .catch((err) => {
      btn.innerHTML = `${FOLDER_ICON_SVG}<span>${escapeHtml(err.message || "Couldn't open")}</span>`;
    })
    .finally(() => {
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove("open-folder-success");
        btn.disabled = false;
      }, 3000);
    });
});

// Small refresh glyph for panes showing content that's live-edited elsewhere (in Obsidian) —
// re-fetches and redraws in place instead of requiring a full page reload.
const RELOAD_ICON_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M13.3 8a5.3 5.3 0 1 1-1.55-3.75M13.3 2.2v3.6h-3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function reloadButtonHtml(id, title = "Reload from disk") {
  return `<button type="button" class="obsidian-icon-link pane-reload-btn" id="${id}" title="${escapeHtml(
    title
  )}" aria-label="${escapeHtml(title)}">${RELOAD_ICON_SVG}</button>`;
}

// redraw is the page's own draw function — re-fetching and re-rendering the whole page in
// place (no showLoading() flash) is simpler and more correct than surgically patching one
// pane, since several things on the page (e.g. the grading button's enabled state) depend on
// the same fetched data.
function wireReloadButton(id, redraw) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", () => {
    btn.classList.add("spinning");
    btn.disabled = true;
    redraw();
  });
}

// Toggles one pane's body between its normal (code/findings) view and a diff-vs-previous-
// attempt view. onShowCode re-wires whatever event listeners the code view needs (finding
// markers, line jumps) since they're lost when innerHTML is replaced by the diff markup.
function wireDiffToggle({ toggleId, bodyId, getCodeHtml, getDiffHtml, onShowCode }) {
  const btn = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  if (!btn || !body) return;
  let showingDiff = false;
  btn.addEventListener("click", () => {
    showingDiff = !showingDiff;
    body.innerHTML = showingDiff ? getDiffHtml() : getCodeHtml();
    btn.textContent = showingDiff ? "Show code" : "Show diff";
    btn.classList.toggle("active", showingDiff);
    if (!showingDiff && onShowCode) onShowCode();
  });
}

const VERDICT_LABEL = {
  fail: "Fail",
  "passed-with-gaps": "Passed with gaps",
  "solid-pass": "Solid pass",
  "strong-pass": "Strong pass",
  pass: "Pass",
  "not-run": "Not run",
};

function verdictBadge(verdict) {
  if (!verdict) return `<span class="verdict verdict-unknown">not available</span>`;
  const cls = `verdict-${verdict}`;
  const label = VERDICT_LABEL[verdict] || verdict;
  return `<span class="verdict ${cls}">${escapeHtml(label)}</span>`;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(md) {
  if (md === null || md === undefined) return null;
  return marked.parse(md);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${url}`);
  return data;
}

// Used by attempt pages for two things: knowing whether this is the latest attempt (the
// ask-about-feedback prompt only makes sense there — an older, superseded attempt's feedback
// isn't worth a standing discuss-it button) and building the attempt-switcher strip. Attempts
// come back in ascending order, so the last one is the latest.
async function fetchPhaseAttempts(slug, phase) {
  const data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
  return data.phases?.[phase]?.attempts || [];
}

// A row of pill links for jumping between this phase's attempts without going back through
// the phase page — highlights whichever one you're currently on.
// routeSegment defaults to phase but can differ — test-check/test-verify are two separate
// top-level routes over the same underlying "test" phase data.
function attemptNavHtml(slug, phase, phaseAttempts, currentFolder, routeSegment = phase) {
  if (phaseAttempts.length <= 1) return "";
  const sorted = [...phaseAttempts].sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0));
  return `<div class="attempt-nav">${sorted
    .map((att) => {
      const label = `Attempt ${escapeHtml(att.attempt_number ?? "?")}`;
      if (att.folder === currentFolder) return `<span class="attempt-nav-item active">${label}</span>`;
      return `<a class="attempt-nav-item" href="#/problems/${encodeURIComponent(slug)}/${routeSegment}/attempts/${encodeURIComponent(
        att.folder
      )}">${label}</a>`;
    })
    .join("")}</div>`;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${url}`);
  return data;
}

// Animated "waiting on Claude" indicator — three pulsing dots next to a label.
function loadingHtml(label) {
  return `<span class="claude-loading"><span class="loading-dots"><span></span><span></span><span></span></span>${escapeHtml(
    label
  )}</span>`;
}

function countBySeverity(findings) {
  const out = { minor: 0, major: 0, critical: 0 };
  for (const f of findings || []) {
    if (out[f.severity] !== undefined) out[f.severity]++;
  }
  return out;
}

function findingCountsLabel(findings) {
  if (!findings) return "no data";
  if (findings.length === 0) return "no findings";
  const c = countBySeverity(findings);
  const parts = [];
  if (c.critical) parts.push(`${c.critical} critical`);
  if (c.major) parts.push(`${c.major} major`);
  if (c.minor) parts.push(`${c.minor} minor`);
  return parts.join(", ") || "no findings";
}

// Weighted severity bucket for aggregate badges (e.g. a file tab's issue count).
// Any critical present -> red. Otherwise a volume-weighted score decides blue vs yellow,
// so e.g. a handful of minors reads as more urgent than just one. Returns a severity
// name ("minor"/"major"/"critical") reused as a CSS bucket — not a literal claim that
// the file only has findings of that severity.
function severityBucket(counts) {
  if (counts.critical > 0) return "critical";
  const score = counts.minor * 1 + counts.major * 4;
  if (score === 0) return null;
  if (score <= 2) return "minor";
  if (score <= 7) return "major";
  return "critical";
}

// ---------- Copy-to-clipboard (global, wired once) ----------

function copyBtn(text, opts = {}) {
  const { label = "Copy", green = false } = opts;
  return `<button type="button" class="copy-btn${green ? " copy-btn-green" : ""}" data-copy-text="${escapeHtml(
    text
  )}">${escapeHtml(label)}</button>`;
}

function promptBox(text, opts = {}) {
  return `<div class="prompt-box">
    ${copyBtn(text, opts)}
    <pre class="prompt-text">${escapeHtml(text)}</pre>
  </div>`;
}

// Shared clipboard write, used both by the delegated .copy-btn click handler below and by any
// flow that wants to copy something automatically (e.g. a generated prompt) without making the
// user press a second, separate "copy" button on top of the button that generated it.
function copyTextToClipboard(text) {
  return new Promise((resolve) => {
    const fallbackCopy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        resolve(ok);
      } catch {
        resolve(false);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => resolve(true), fallbackCopy);
    } else {
      fallbackCopy();
    }
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  const text = btn.dataset.copyText || "";
  const original = btn.textContent;
  const flash = (msg, ok) => {
    btn.textContent = msg;
    btn.classList.toggle("copied", ok);
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("copied");
    }, 1400);
  };
  copyTextToClipboard(text).then((ok) => flash(ok ? "Copied!" : "Copy failed", ok));
});

// The prompt-picker panel below opens on hover/focus — convenient, but that also means it can
// open just by mousing past the trigger. This is the deliberate close: clicking ✕ force-hides
// the panel (data-closed, overriding :hover/:focus-within in CSS) until the trigger button
// itself is clicked again, which clears it — a stray hover afterward won't reopen it.
document.addEventListener("click", (e) => {
  const closeBtn = e.target.closest(".prompt-picker-close");
  if (closeBtn) {
    closeBtn.closest(".prompt-picker")?.setAttribute("data-closed", "true");
    return;
  }
  const trigger = e.target.closest(".prompt-picker-btn");
  if (trigger) trigger.closest(".prompt-picker")?.removeAttribute("data-closed");
});

// Computes and applies the panel's fixed position, clamped fully inside the current viewport —
// this is what actually fixes a small window pane hiding/covering the panel (see the CSS
// comment on .prompt-picker-panel). Runs on hover/focus rather than once at render time, since
// the trigger button's on-screen position can change (scrolling, window resizing) between then
// and when it's actually opened.
function positionPromptPickerPanel(picker) {
  const btn = picker.querySelector(".prompt-picker-btn");
  const panel = picker.querySelector(".prompt-picker-panel");
  if (!btn || !panel) return;
  const btnRect = btn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const margin = 8;
  const panelWidth = panel.offsetWidth || 400;
  const panelHeight = panel.offsetHeight || 200;

  // Right-align to the button by default (matches the old layout), but clamp so it never
  // extends past either edge of a narrow viewport.
  let left = btnRect.right - panelWidth;
  left = Math.min(left, vw - panelWidth - margin);
  left = Math.max(left, margin);

  // Below the button by default; flip above if there's not enough room below but there is above.
  let top = btnRect.bottom + 6;
  if (top + panelHeight > vh - margin && btnRect.top - 6 - panelHeight >= margin) {
    top = btnRect.top - 6 - panelHeight;
  } else {
    top = Math.min(top, vh - panelHeight - margin);
  }
  top = Math.max(top, margin);

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}
document.addEventListener("mouseover", (e) => {
  const picker = e.target.closest(".prompt-picker");
  if (picker) positionPromptPickerPanel(picker);
});
document.addEventListener("focusin", (e) => {
  const picker = e.target.closest(".prompt-picker");
  if (picker) positionPromptPickerPanel(picker);
});

// The "Submit ... & copy grading prompt" button (performAction, above) fills its status area
// with a fairly tall block — the prompt text, headless-run button, paste-back box — that then
// just sits there in the page permanently, easy to trigger by mistake and then stuck looking
// at. This lets it collapse to a one-line summary without losing what's in it (the copied
// prompt, any headless-run status) — expanding again just un-hides the same DOM, nothing reruns.
document.addEventListener("click", (e) => {
  const toggle = e.target.closest(".job-status-toggle");
  if (!toggle) return;
  const statusEl = toggle.closest(".job-status");
  if (!statusEl) return;
  const minimized = statusEl.classList.toggle("job-status-minimized");
  toggle.textContent = minimized ? "﹀" : "︿";
  const label = minimized ? "Expand" : "Minimize";
  toggle.title = label;
  toggle.setAttribute("aria-label", label);
});

// ---------- Context bar (persistent breadcrumb) ----------
//
// Color-coded by phase (same hues as everywhere else — cards, buttons) plus a labeled chip,
// so which section you're in (problem / design / terraform / test) is visible at a glance
// without having to read the breadcrumb text — this is the one element that's always on
// screen while scrolling, so it's the natural place to keep that oriented.
const PHASE_CHIP_LABEL = { problem: "Problem", design: "Design", terraform: "Terraform", test: "Test & evidence" };

function setContext(segments, phase = "") {
  // segments: [{label, href?}], last segment has no href (current page)
  contextBarEl.dataset.phase = phase || "";
  const chip = phase
    ? `<span class="phase-chip phase-chip-${escapeHtml(phase)}">${escapeHtml(PHASE_CHIP_LABEL[phase] || phase)}</span>`
    : "";
  const crumbs = segments
    .map((s, i) => {
      const isLast = i === segments.length - 1;
      const text = escapeHtml(s.label);
      if (isLast || !s.href) {
        return `<span class="context-current">${text}</span>`;
      }
      return `<a href="${s.href}">${text}</a><span class="context-sep">/</span>`;
    })
    .join("");
  contextBarEl.innerHTML = chip + crumbs;
}

// ---------- Collapsible ----------

function collapsible(title, bodyHtml, opts = {}) {
  const { open = false, accent = "neutral", tag = "", filePath = null } = opts;
  return `
    <details class="collapsible accent-${accent}" ${open ? "open" : ""}>
      <summary>
        <span class="collapsible-title">${escapeHtml(title)}</span>
        ${filePath ? obsidianIconLink(filePath) : ""}
        ${tag ? `<span class="collapsible-tag">${tag}</span>` : ""}
        <span class="collapsible-chevron" aria-hidden="true"></span>
      </summary>
      <div class="collapsible-body">${bodyHtml}</div>
    </details>`;
}

// ---------- Findings: indexing, filtering, per-file scoping ----------

// Assigns a stable numeric _id to each finding (index into the original attempt_json
// array) so the same finding can be referenced consistently between the sidebar list,
// inline code markers, and inline comment bubbles.
function indexFindings(findings) {
  return (findings || []).map((f, i) => ({ ...f, _id: i }));
}

function findingsForFile(indexed, matchesFile) {
  return indexed.filter((f) => f.location && matchesFile(f.location.file));
}

function findingsWithoutLocation(indexed) {
  return indexed.filter((f) => !f.location);
}

// Per-file aggregate counts for Terraform's file tabs: total issue count + a
// volume-weighted severity bucket used to color the tab badge.
function fileFindingCounts(indexed) {
  const map = {};
  for (const f of indexed) {
    if (!f.location) continue;
    const file = f.location.file.replace(/^terraform\//, "");
    if (!map[file]) map[file] = { minor: 0, major: 0, critical: 0 };
    if (map[file][f.severity] !== undefined) map[file][f.severity]++;
  }
  const out = {};
  for (const [file, counts] of Object.entries(map)) {
    out[file] = { total: counts.minor + counts.major + counts.critical, bucket: severityBucket(counts) };
  }
  return out;
}

// ---------- Findings sidebar list (severity-sorted, click-to-jump) ----------

function renderFindingsListHtml(indexedSubset, opts = {}) {
  const { emptyMessage = "No findings recorded." } = opts;
  if (!indexedSubset || indexedSubset.length === 0) {
    return `<p class="missing-note">${escapeHtml(emptyMessage)}</p>`;
  }
  const order = { minor: 0, major: 1, critical: 2 };
  const sorted = [...indexedSubset].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return `<ul class="findings-list findings-list-interactive">${sorted
    .map((f) => {
      const badge = `<span class="badge badge-${f.severity}">${escapeHtml(f.severity)}</span>`;
      const blocking =
        f.severity === "critical" && f.blocking
          ? `<span class="badge badge-blocking">blocking</span>`
          : f.severity === "critical"
          ? `<span class="badge" style="background:var(--panel-2);color:var(--text-dim)">non-blocking</span>`
          : "";
      const loc = f.location
        ? `<span class="finding-loc">${escapeHtml(f.location.file)}${
            f.location.line_start
              ? `:${f.location.line_start}${
                  f.location.line_end && f.location.line_end !== f.location.line_start ? `-${f.location.line_end}` : ""
                }`
              : ""
          }</span>`
        : `<span class="finding-loc finding-loc-none">no specific line</span>`;
      const clickable = f.location ? ` data-finding-id="${f._id}"` : "";
      return `<li class="${f.location ? "finding-jump" : ""}"${clickable}>${badge}${blocking} ${escapeHtml(
        f.description
      )}<br/>${loc}</li>`;
    })
    .join("")}</ul>`;
}

function wireFindingsJump(containerEl, indexedSubset, paneId) {
  if (!containerEl) return;
  containerEl.querySelectorAll("[data-finding-id]").forEach((li) => {
    const id = Number(li.dataset.findingId);
    const finding = indexedSubset.find((f) => f._id === id);
    if (!finding || !finding.location) return;
    li.addEventListener("click", () => {
      jumpToLine(paneId, finding.location.line_start, finding.location.line_end);
      const bubble = document.getElementById(`bubble-${paneId}-${id}`);
      if (bubble) bubble.hidden = false;
    });
  });
}

function wireFindingsToggle() {
  const btn = document.getElementById("findings-toggle");
  const splitView = document.querySelector(".split-view");
  if (!btn || !splitView) return;
  btn.addEventListener("click", () => {
    const collapsed = splitView.classList.toggle("findings-collapsed");
    btn.textContent = collapsed ? "⟨" : "⟩";
    btn.title = collapsed ? "Expand findings panel" : "Collapse findings panel";
  });
}

// Minimizes the whole compare pane (both code and findings) down to just its header bar —
// separate from wireFindingsToggle, which only collapses the findings side.
function wireSplitViewMinimize() {
  const btn = document.getElementById("split-view-minimize");
  const splitView = document.getElementById("split-view");
  if (!btn || !splitView) return;
  btn.addEventListener("click", () => {
    const minimized = splitView.classList.toggle("split-view-minimized");
    btn.textContent = minimized ? "Expand" : "Minimize";
  });
}

function splitViewHeader(title) {
  return `<div class="split-view-header">
    <h2>${escapeHtml(title)}</h2>
    <button type="button" class="btn-secondary" id="split-view-minimize">Minimize</button>
  </div>`;
}

// ---------- Feedback-question prompt picker ----------
//
// A small hoverable button, at the top-right of every page that has one, that offers one or
// more ready-made prompts — a grading handoff, a question about feedback, whatever's relevant
// to that page — framed to guide/clarify rather than just hand over the fix or the answer,
// where that applies. Every page's prompt(s) live here, in the same place, styled the same
// way, so there's one consistent spot to look instead of a different pattern per page. When
// there's more than one applicable prompt (e.g. test & evidence has both the script feedback
// and the real-run evidence to ask about), a small tab strip lets you pick which one first.

// Open-ended by design — no blank to fill in before sending. This is meant to be pasted
// into a fresh session that may have no vault/file access at all, so the actual feedback and
// artifact text are embedded inline rather than just referenced by path.
function askAboutPrompt({ artifactLabel, feedbackRel, feedbackContent, artifactRel, artifactContent }) {
  return `I'd like to talk through some feedback I got on my ${artifactLabel}. Pasting both below in case you don't have direct file access.

--- Feedback (${feedbackRel}) ---
${feedbackContent || "(not provided)"}

--- ${artifactLabel} it's about (${artifactRel}) ---
${artifactContent || "(not provided)"}

Review both and get ready to discuss — I'll ask about specific findings, push back on ones I disagree with, or ask you to walk me through the reasoning. Don't just hand me a corrected version outright; guide me toward understanding it myself, the way you would if I were still working on this.`;
}

// ---------- Reference-answer prompt (the deliberate "just show me the correct answer" escape
// hatch — every other prompt in this app is feedback-on-your-attempt by design; this is the one
// place that intentionally isn't, for when you're done iterating and want to be sure nothing
// was missed) ----------
//
// CODE-tagged and written straight into the same attempt folder as a new file (like feedback),
// via the same prepare-less pattern Check uses: no snapshot to create, just a prompt this app
// builds client-side plus the existing save-files endpoint for paste-back/headless writes.
// attemptRel/problemRel/extraReads are vault-relative paths (no leading slash); extraContext is
// optional freeform text appended to the "what to read" instructions (e.g. which design/
// terraform attempt this one targets).
function referenceAnswerPromptText({ artifactLabel, attemptRel, problemRel, extraReads = [], extraContext = "", outputFile }) {
  const reads = [`"${problemRel}"`, ...extraReads.map((r) => `"${r}"`), "rules.md's grading standard (what a strong-pass actually requires)"].join(
    ", "
  );
  return `I've already gotten feedback on my ${artifactLabel} for this problem, and I've reviewed it — but I want
to see a complete, fully correct reference answer too, to make sure I'm not leaving anything unturned. Not
feedback on what I wrote — a real answer, written independently, as if you were solving this problem yourself
from scratch.

Read ${reads}.${extraContext ? ` ${extraContext}` : ""} Do not read or reference my actual submitted attempt
in "${attemptRel}/" itself — write this independently rather than as a corrected version of mine.

Write the complete reference answer to "${attemptRel}/${outputFile}" — thorough, not a sketch or an outline,
addressing every requirement and completion condition explicitly, the way something earning a strong-pass
would.

If you have direct file access to this vault (Claude Code, Cowork), write that file there directly and you're
done. If this is a plain chat session with no file access, instead reply with just this one fenced code block,
using the exact filename as the block's language tag, and nothing else outside it:

\`\`\`${outputFile}
<content>
\`\`\`

I'll paste your reply back into the vault viewer, which extracts and saves it itself.`;
}

// Shared trigger+picker+wiring for the reference-answer button used identically on all four
// attempt pages (design/terraform/given-app/check) — o: {promptArgs (for referenceAnswerPromptText),
// saveFilesUrl, hasReference, onSaved (called after a successful headless run or paste-back save,
// same "refresh in place" pattern as everywhere else)}.
function referenceAnswerPickerHtml(id, o) {
  const options = [
    {
      description:
        "Writes a complete, fully correct reference answer from scratch — not feedback on your draft — so you can check nothing was missed.",
      prompt: referenceAnswerPromptText(o.promptArgs),
      pasteBack: () => async (files) => {
        await postJson(o.saveFilesUrl, { files });
        o.onSaved();
        return "Saved. Refreshing…";
      },
      onHeadlessDone: () => {
        o.onSaved();
        return "Refreshing…";
      },
    },
  ];
  return { html: promptPickerHtml(id, "Copy prompt for the reference answer", options, { tag: "code" }), options };
}

// Shown once a reference answer has actually been written — same .pane chrome as everywhere
// else. bodyHtml is caller-provided since the content type differs (markdown prose for design/
// given-app/terraform's single reference.md, annotated code for the test script's).
function referenceAnswerSectionHtml(filePath, bodyHtml) {
  return `<div class="section">
    <h2>Reference answer</h2>
    <div class="pane">
      <div class="pane-header">
        <span class="pane-header-label">${escapeHtml(filePath.split("/").pop())}</span>
        <span class="pane-header-actions">${obsidianIconLink(filePath)}</span>
      </div>
      <div class="pane-body">${bodyHtml}</div>
    </div>
  </div>`;
}

// Concatenates multiple files (e.g. all .tf files) into one text block for embedding in a
// prompt, each labeled with its own filename.
function joinFileContents(files) {
  return (files || []).map((f) => `## ${f.path ?? f.name}\n${f.content}`).join("\n\n");
}

// ---------- Paste-back (the workaround for a plain claude.ai tab with no vault file access) ----------
//
// Every grading-style prompt asks Claude to write files directly if it can, or fall back to
// replying with each file as its own ```filename block if it can't (see pasteBackInstructionsText
// and server.js's pasteBackInstructions). This is the other half: parse those blocks back out of
// a pasted reply and save them via a server endpoint that (unlike a browser tab) has real file
// access. opts.pasteBack on an option is a function returning the save function to call.

function pasteBackHtml(id) {
  return `
    <details class="paste-back">
      <summary>Claude couldn't write the files? Paste its reply here instead</summary>
      <textarea class="text-input paste-back-textarea" id="${id}-textarea" rows="6" placeholder="Paste Claude's full reply here — this looks for &#96;&#96;&#96;filename code blocks in it."></textarea>
      <div class="action-row">
        <button type="button" class="btn-primary" id="${id}-save">Parse &amp; save</button>
      </div>
      <div id="${id}-status"></div>
    </details>`;
}

// CODE = needs real file (or shell) access to actually finish the step — Claude Code, not a
// plain claude.ai tab. WEB = pure discussion/text, works anywhere. YOU = the user does this
// step themselves, no Claude prompt involved at all. Shown next to every prompt trigger so it's
// obvious up front which ones a plain web tab can actually complete.
function tagPillHtml(tag) {
  const label = { code: "CODE", web: "WEB", you: "YOU" }[tag] || tag.toUpperCase();
  return `<span class="tag-pill tag-pill-${tag}" title="${
    tag === "code"
      ? "Needs real file access — Claude Code, not a plain web chat."
      : tag === "you"
      ? "You do this step yourself."
      : "Works in any Claude chat, including a plain web tab."
  }">${label}</span>`;
}

// Some steps carry more than one tag — e.g. "review the feedback" is both YOU (you're the one
// asking/pushing back) and WEB (any chat can host that discussion), distinct from a pure WEB
// step like clarification (Cowork answering scope questions) or a pure CODE one (grading).
function tagPillsHtml(tags) {
  return (Array.isArray(tags) ? tags : [tags]).map(tagPillHtml).join(" ");
}

// The one-click alternative to copy/paste — has the local server run this exact prompt against
// the Claude Code CLI headlessly (no chat UI), since it already has real file access. Requires
// the `claude` CLI installed and authenticated on this machine; the paste-back box underneath
// stays as a fallback for when it isn't.
function headlessRunHtml(id) {
  return `
    <div class="headless-run">
      <button type="button" class="btn-primary" id="${id}-run">▶ Run automatically with Claude Code</button>
      <span class="status-line">Needs the Claude Code CLI installed locally.</span>
      <div id="${id}-run-status"></div>
    </div>`;
}

// onDone() -> string|void: extra status HTML to show on success (e.g. a link to reload the
// resulting attempt page).
function wireHeadlessRun(id, prompt, onDone) {
  const btn = document.getElementById(`${id}-run`);
  const statusEl = document.getElementById(`${id}-run-status`);
  if (!btn || !statusEl) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    statusEl.innerHTML = `<p class="status-line">${loadingHtml("Running Claude Code…")}</p>`;
    try {
      await postJson("/api/run-headless", { prompt });
      statusEl.innerHTML = `<p class="status-line">Done.${onDone ? ` ${onDone()}` : ""}</p>`;
    } catch (err) {
      statusEl.innerHTML = `<p class="warn-banner">${escapeHtml(err.message)}</p>`;
      btn.disabled = false;
    }
  });
}

function parsePastedFiles(text) {
  const files = {};
  const re = /```([^\n`]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text || ""))) {
    const name = m[1].trim();
    if (/^[\w.-]+$/.test(name)) files[name] = m[2].replace(/\n$/, "");
  }
  return files;
}

// saveFn(files) -> Promise<string|void>: performs the save, optionally returning extra status
// HTML (e.g. a link to reload the resulting attempt page).
function wirePasteBack(id, saveFn) {
  const btn = document.getElementById(`${id}-save`);
  const textarea = document.getElementById(`${id}-textarea`);
  const statusEl = document.getElementById(`${id}-status`);
  if (!btn || !textarea || !statusEl) return;
  btn.addEventListener("click", async () => {
    const files = parsePastedFiles(textarea.value);
    if (Object.keys(files).length === 0) {
      statusEl.innerHTML = `<p class="warn-banner">Couldn't find any \`\`\`filename code blocks in that text.</p>`;
      return;
    }
    btn.disabled = true;
    statusEl.innerHTML = `<p class="status-line">${loadingHtml("Saving…")}</p>`;
    try {
      const extra = await saveFn(files);
      statusEl.innerHTML = `<p class="status-line">Saved ${Object.keys(files)
        .map((f) => `<code>${escapeHtml(f)}</code>`)
        .join(", ")}.${extra ? ` ${extra}` : ""}</p>`;
    } catch (err) {
      statusEl.innerHTML = `<p class="warn-banner">${escapeHtml(err.message)}</p>`;
      btn.disabled = false;
    }
  });
}

// Every prompt this app ever hands you ends up rendered the same way — a copy button and an
// "Open Claude in a new tab" link side by side, with the actual text underneath so you can
// read/edit it before pasting. One shared renderer means that's true uniformly, instead of the
// "action" kind having both buttons while "prompt"/"dynamic" only had a bare copy button. When
// opts.pasteBackId is set, it also renders the paste-back box below the prompt — the caller is
// responsible for calling wirePasteBack(opts.pasteBackId, saveFn) right after this HTML lands.
function promptResultHtml(prompt, opts = {}) {
  if (!prompt) {
    return `<p class="missing-note">${escapeHtml(opts.missingText || "Nothing to copy yet.")}</p>`;
  }
  return `
    <div class="action-row">
      ${copyBtn(prompt, { label: opts.copyLabel || "Copy this prompt", green: true })}
      <a class="btn-secondary" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Open Claude in a new tab →</a>
    </div>
    <pre class="prompt-picker-preview">${escapeHtml(prompt)}</pre>
    ${opts.headlessId ? headlessRunHtml(opts.headlessId) : ""}
    ${opts.pasteBackId ? pasteBackHtml(opts.pasteBackId) : ""}
  `;
}

// Performs a mutating "snapshot current/ into a new attempt & get a grading prompt" action and
// renders the result into statusEl — shared by the direct action button (below, used where
// there's exactly one such action on a page: Design, Terraform) and could back a picker option
// too if a page ever needs more than one.
async function performAction(o, statusEl, btn) {
  btn.disabled = true;
  statusEl.innerHTML = `<p class="status-line">${loadingHtml("Creating the attempt…")}</p>`;
  try {
    const reqBody = o.buildBody ? o.buildBody() : {};
    const { folder, prompt } = await postJson(o.prepareUrl, reqBody);
    // Copies immediately rather than making you press a second button to get what you already
    // asked for — the "Copy again" button below is only a fallback in case the browser blocked
    // the automatic clipboard write.
    const copied = await copyTextToClipboard(prompt);
    const headlessId = `${btn.id}-headless`;
    const pasteBackId = `${btn.id}-pasteback`;
    const reloadLink = `Reload <a href="${o.attemptHrefPrefix}${encodeURIComponent(folder)}">this attempt's page</a> to see it.`;
    statusEl.classList.remove("job-status-minimized");
    statusEl.innerHTML = `
      <div class="job-status-header">
        <span class="job-status-summary">Created <strong>${escapeHtml(folder)}</strong>.</span>
        <button type="button" class="job-status-toggle" title="Minimize" aria-label="Minimize">︿</button>
      </div>
      <div class="job-status-full">
        <p class="status-line">${
          copied ? "Copied to your clipboard." : "Couldn't copy automatically — use the button below."
        } Run this with Claude Code (below), or paste it into a Claude session with access
        to this vault (Claude Code, Cowork) yourself — either way it writes the feedback and
        <code>attempt.json</code> into that attempt folder. Reload
        <a href="${o.attemptHrefPrefix}${encodeURIComponent(folder)}">this attempt's page</a> once it's done.</p>
        ${promptResultHtml(prompt, {
          copyLabel: copied ? "Copy again" : "Copy grading prompt",
          headlessId: o.saveFilesUrlPrefix ? headlessId : null,
          pasteBackId: o.saveFilesUrlPrefix ? pasteBackId : null,
        })}
      </div>`;
    if (o.saveFilesUrlPrefix) {
      // onSubmitted (when the page provides one) re-renders the page straight into its
      // Submissions tab instead of leaving a "go reload it yourself" link — the whole point of
      // running headlessly is not having to babysit it.
      wireHeadlessRun(headlessId, prompt, () => {
        if (o.onSubmitted) {
          o.onSubmitted();
          return "Done — refreshing the submissions list below.";
        }
        return reloadLink;
      });
      wirePasteBack(pasteBackId, async (files) => {
        await postJson(`${o.saveFilesUrlPrefix}${encodeURIComponent(folder)}/save-files`, { files });
        if (o.onSubmitted) {
          o.onSubmitted();
          return "Done — refreshing the submissions list below.";
        }
        return reloadLink;
      });
    }
  } catch (err) {
    statusEl.innerHTML = `<p class="warn-banner">${escapeHtml(err.message)}</p>`;
    btn.disabled = false;
  }
}

// A single, always-visible button that performs a mutating action directly on click — no
// hover-panel-then-click-again indirection. The hover-reveal prompt-picker pattern makes sense
// for non-mutating "here's a prompt" options (you're just previewing text), but for a mutating
// "create an attempt" action it was adding a click to get to the one thing the button does.
function actionButtonHtml(id, label, disabled) {
  return `<button type="button" class="btn-primary" id="${id}"${
    disabled ? " disabled" : ""
  }>${escapeHtml(label)} ${tagPillHtml("code")}</button>`;
}
function actionBodyHtml(id, o) {
  return `
    <p class="status-line">${escapeHtml(o.description)}</p>
    ${o.extraFieldHtml || ""}
    <div id="${id}-status" class="job-status"></div>
  `;
}
function wireActionButton(id, o) {
  const btn = document.getElementById(id);
  const statusEl = document.getElementById(`${id}-status`);
  if (!btn || !statusEl) return;
  btn.addEventListener("click", () => performAction(o, statusEl, btn));
}

// Two kinds of tab a prompt-picker option can be:
//   "prompt"  (default) — a static ready-made prompt to copy.
//   "dynamic" — a prompt computed straight from already-fetched data (e.g. "test the most
//               recent Terraform attempt"), no user input needed — just refreshed on render.
// (Mutating "create an attempt" actions use the direct action button above instead, not a
// picker option — see actionButtonHtml.)
function optionBodyHtml(o, pickerId, idx) {
  if (o.kind === "dynamic") {
    return `
      <p class="prompt-picker-desc">${escapeHtml(o.description)}</p>
      ${o.extraFieldHtml || ""}
      <div id="${pickerId}-dynamic-${idx}"></div>
    `;
  }
  return `
    <p class="prompt-picker-desc">${escapeHtml(o.description)}</p>
    ${promptResultHtml(o.prompt, {
      missingText: o.missingText,
      headlessId: o.pasteBack ? `${pickerId}-headless-${idx}` : null,
      pasteBackId: o.pasteBack ? `${pickerId}-pasteback-${idx}` : null,
    })}
  `;
}

function dynamicResultHtml(o, result, headlessId, pasteBackId) {
  return promptResultHtml(result, { copyLabel: o.copyLabel, missingText: o.missingText, headlessId, pasteBackId });
}

// Available on every attempt, not just the latest — you should be able to ask about any past
// attempt's feedback, not only the most recent one. Always rendered (muted when there's no
// feedback text to build a prompt from) rather than disappearing entirely, so a clean/no-
// findings attempt still has the button, just grayed out like anywhere else nothing's ready.
function feedbackOptionsOrPlaceholder(feedbackOptions) {
  return feedbackOptions.length
    ? feedbackOptions
    : [
        {
          label: "Ask about this feedback",
          description: "Discuss this attempt's feedback without getting the fix handed to you outright.",
          prompt: "",
          missingText: "No feedback text recorded for this attempt.",
        },
      ];
}
function feedbackPromptOrNote(feedbackOptions, hasFeedback) {
  return promptPickerHtml(
    "feedback-prompt-picker",
    "Copy prompt to discuss this feedback",
    feedbackOptionsOrPlaceholder(feedbackOptions),
    { muted: !hasFeedback, tag: "web" }
  );
}

// muted: render the trigger as a plain, low-key button instead of the eye-catching green CTA —
// use this when the single option underneath has nothing actionable yet (e.g. no attempt to
// build a prompt from), so an empty/explanatory panel doesn't masquerade as a normal action.
function promptPickerHtml(id, buttonLabel, options, opts = {}) {
  const single = options.length === 1;
  return `
    <div class="prompt-picker" id="${id}">
      <button type="button" class="prompt-picker-btn${opts.muted ? " prompt-picker-btn-muted" : ""}">${escapeHtml(
    buttonLabel
  )}${opts.tag ? ` ${tagPillHtml(opts.tag)}` : ""}</button>
      <div class="prompt-picker-panel">
        <button type="button" class="prompt-picker-close" title="Close" aria-label="Close">✕</button>
        ${
          single
            ? ""
            : `<div class="prompt-picker-tabs">${options
                .map(
                  (o, i) =>
                    `<button type="button" class="prompt-picker-tab${i === 0 ? " active" : ""}" data-idx="${i}">${escapeHtml(
                      o.label
                    )}</button>`
                )
                .join("")}</div>`
        }
        <div class="prompt-picker-body">${optionBodyHtml(options[0], id, 0)}</div>
      </div>
    </div>`;
}

function wirePromptPicker(id, options) {
  const root = document.getElementById(id);
  if (!root) return;
  const tabs = root.querySelectorAll(".prompt-picker-tab");
  const body = root.querySelector(".prompt-picker-body");

  function wireOption(idx) {
    const o = options[idx];
    if (o.kind === "dynamic") {
      const wrap = document.getElementById(`${id}-dynamic-${idx}`);
      if (!wrap) return;
      const headlessId = `${id}-dynamic-headless-${idx}`;
      const pasteBackId = `${id}-dynamic-pasteback-${idx}`;
      const refresh = () => {
        const result = o.getResult();
        const enabled = result && o.pasteBack;
        wrap.innerHTML = dynamicResultHtml(o, result, enabled ? headlessId : null, enabled ? pasteBackId : null);
        if (enabled) {
          wireHeadlessRun(headlessId, result, o.onHeadlessDone);
          wirePasteBack(pasteBackId, o.pasteBack(result));
        }
      };
      if (o.fieldId) document.getElementById(o.fieldId)?.addEventListener("change", refresh);
      refresh();
    } else if (o.pasteBack && o.prompt) {
      wireHeadlessRun(`${id}-headless-${idx}`, o.prompt, o.onHeadlessDone);
      wirePasteBack(`${id}-pasteback-${idx}`, o.pasteBack());
    }
  }
  wireOption(0);

  function select(i) {
    tabs.forEach((t) => t.classList.toggle("active", Number(t.dataset.idx) === i));
    body.innerHTML = optionBodyHtml(options[i], id, i);
    wireOption(i);
  }
  tabs.forEach((t) => t.addEventListener("click", () => select(Number(t.dataset.idx))));
}

// ---------- Line diff (attempt vs. its previous attempt) ----------
//
// Every attempt is a full snapshot rather than a delta, so a diff between two attempts is
// just a text diff between two complete files — no history reconstruction needed. LCS-based
// line diff (classic DP backtrack); the files here (design docs, Terraform configs) are small
// enough that the O(n*m) table is trivial.

function computeLineDiff(oldText, newText) {
  const a = (oldText ?? "").split("\n");
  const b = (newText ?? "").split("\n");
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", line: a[i] });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", line: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", line: b[j] });
    j++;
  }
  return ops;
}

function renderDiffPane(oldText, newText) {
  const ops = computeLineDiff(oldText, newText);
  if (ops.every((op) => op.type === "same")) {
    return `<p class="missing-note" style="padding:16px">No changes from the previous attempt.</p>`;
  }
  const rows = ops
    .map((op) => {
      const marker = op.type === "add" ? "+" : op.type === "del" ? "−" : "";
      const cls = op.type === "add" ? "diff-add" : op.type === "del" ? "diff-del" : "diff-same";
      return `<div class="diff-line ${cls}"><span class="diff-marker">${marker}</span><span class="diff-text">${escapeHtml(
        op.line
      )}</span></div>`;
    })
    .join("");
  return `<div class="diff-pane">${rows}</div>`;
}

// ---------- Annotated, line-numbered code pane ----------
//
// Renders the graded artifact with line numbers. Lines covered by a finding get a
// persistent severity-colored highlight and a small marker; clicking the marker (or the
// matching sidebar item) toggles an inline comment bubble right under that line — like
// inline PR review comments. Findings whose lines have room to breathe (no other finding
// close by) auto-expand their bubble; dense clusters stay collapsed until clicked, so nothing
// overlaps or crowds the code.

function renderAnnotatedCode(content, paneId, fileFindings) {
  const lines = (content ?? "").split("\n");
  const severityRank = { minor: 1, major: 2, critical: 3 };
  const sortedByLine = [...fileFindings].sort((a, b) => a.location.line_start - b.location.line_start);

  const lineSeverity = {};
  sortedByLine.forEach((f) => {
    for (let n = f.location.line_start; n <= f.location.line_end; n++) {
      if (!lineSeverity[n] || severityRank[f.severity] > severityRank[lineSeverity[n]]) lineSeverity[n] = f.severity;
    }
  });

  const markersAtLine = {};
  sortedByLine.forEach((f) => {
    (markersAtLine[f.location.line_end] ||= []).push(f);
  });

  // Auto-expand a bubble only when there's vertical room before the next finding.
  let lastReservedLine = -Infinity;
  const autoExpand = {};
  sortedByLine.forEach((f) => {
    autoExpand[f._id] = f.location.line_start - lastReservedLine >= 4;
    if (autoExpand[f._id]) lastReservedLine = f.location.line_end + 3;
  });

  const markerGlyph = { minor: "●", major: "▲", critical: "!" };

  const rows = lines
    .map((line, i) => {
      const n = i + 1;
      const sev = lineSeverity[n];
      const trimmed = line.trim();
      const isComment = trimmed.startsWith("#") || trimmed.startsWith("//");
      const text = escapeHtml(line).length ? escapeHtml(line) : " ";
      const markers = markersAtLine[n] || [];
      const markerHtml = markers
        .map(
          (f) =>
            `<button type="button" class="finding-marker sev-${f.severity}" data-marker-id="${paneId}-${f._id}" title="${escapeHtml(
              f.description
            )}">${markerGlyph[f.severity] || "●"}</button>`
        )
        .join("");
      const bubblesHtml = markers
        .map((f) => {
          const hidden = autoExpand[f._id] ? "" : " hidden";
          const blockingBadge =
            f.severity === "critical"
              ? f.blocking
                ? `<span class="badge badge-blocking">blocking</span>`
                : `<span class="badge" style="background:var(--panel-2);color:var(--text-dim)">non-blocking</span>`
              : "";
          return `<div class="finding-bubble sev-${f.severity}" id="bubble-${paneId}-${f._id}"${hidden}>
            <span class="badge badge-${f.severity}">${escapeHtml(f.severity)}</span>${blockingBadge}
            <span class="bubble-text">${escapeHtml(f.description)}</span>
          </div>`;
        })
        .join("");
      return `<div class="code-line${isComment ? " code-comment" : ""}${
        sev ? ` sev-line sev-line-${sev}` : ""
      }" id="ln-${paneId}-${n}" data-line="${n}"><span class="ln-num">${n}</span><span class="ln-text">${text}</span>${markerHtml}</div>${bubblesHtml}`;
    })
    .join("");

  return `<div class="code-pane annotated" id="${paneId}">${rows}</div>`;
}

function wireAnnotatedCode(paneId) {
  const pane = document.getElementById(paneId);
  if (!pane) return;
  pane.addEventListener("click", (e) => {
    const marker = e.target.closest(".finding-marker");
    if (!marker) return;
    const bubble = document.getElementById(`bubble-${marker.dataset.markerId}`);
    if (bubble) bubble.hidden = !bubble.hidden;
  });
}

function jumpToLine(paneId, lineStart, lineEnd) {
  const pane = document.getElementById(paneId);
  if (!pane) return false;
  pane.querySelectorAll(".code-line.highlight").forEach((el) => el.classList.remove("highlight"));
  const end = lineEnd ?? lineStart;
  let first = null;
  for (let n = lineStart; n <= end; n++) {
    const el = document.getElementById(`ln-${paneId}-${n}`);
    if (el) {
      el.classList.add("highlight");
      if (!first) first = el;
    }
  }
  if (first) {
    first.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }
  return false;
}

// ---------- Problem tab bar (Description / Design / Terraform / Test / Submissions) ----------
//
// The same five destinations render as tabs at the top of each of those pages — clicking one
// is a normal hash navigation (this app already re-renders without a full page reload on
// every route, so it behaves like an in-page tab switch already), just visually unified
// instead of each page looking like an unrelated destination.

function problemTabsHtml(slug, active) {
  const enc = encodeURIComponent(slug);
  const tabs = [
    { key: "problem", label: "Description", href: `#/problems/${enc}` },
    { key: "background", label: "Background", href: `#/problems/${enc}/background` },
    { key: "given-app", label: "Code Analysis", href: `#/problems/${enc}/given-app` },
    { key: "design", label: "Design", href: `#/problems/${enc}/design` },
    { key: "terraform", label: "Terraform", href: `#/problems/${enc}/terraform` },
    { key: "test-check", label: "Check", href: `#/problems/${enc}/test-check` },
    { key: "test-verify", label: "Verify", href: `#/problems/${enc}/test-verify` },
    { key: "submissions", label: "Submissions", href: `#/problems/${enc}/submissions` },
  ];
  return `<div class="problem-tabs">${tabs
    .map((t) => `<a class="problem-tab${t.key === active ? " active" : ""}" href="${t.href}">${escapeHtml(t.label)}</a>`)
    .join("")}</div>`;
}

// ---------- Problem sidebar (persistent flyout — all problems, from any page) ----------

const sidebarListEl = document.getElementById("problem-sidebar-list");

function sidebarProblemItemHtml(p, activeSlug) {
  const tier = p.tier !== null ? `Tier ${p.tier}` : "Tier unknown";
  const status = PHASES.map((phase) => {
    const ph = p.phases[phase];
    if (!ph || ph.attempt_count === 0) return `${phase}: none`;
    return `${phase}: ${phaseLatestLabel(phase, ph.latest)}`;
  }).join(" · ");
  const active = p.slug === activeSlug ? " active" : "";
  return `<a class="sidebar-problem-item${active}" href="#/problems/${encodeURIComponent(p.slug)}">
    <span class="sidebar-problem-title">${escapeHtml(p.slug)}</span>
    <span class="sidebar-problem-sub">${escapeHtml(tier)} — ${escapeHtml(status)}</span>
  </a>`;
}

// A lightweight "new problem" prompt lives at the top of the sidebar so starting one doesn't
// require leaving whatever page you're on. The optional feedback field exists specifically so
// a jarring difficulty jump can be flagged before the next problem is issued, not discovered
// after — it's folded into the same startPromptText() the Home page action uses. Same headless
// option as everywhere else, standing in for a Cowork conversation (see rules.md's Tooling
// split) rather than a Claude Code one.
function newProblemFormHtml() {
  return `
    <div class="sidebar-new-problem">
      <button type="button" id="sidebar-new-problem-btn" class="btn-primary" style="width:100%">+ New problem</button>
      <div id="sidebar-new-problem-form" class="sidebar-new-problem-form" hidden>
        <label class="field-label" for="sidebar-new-problem-feedback">Anything to flag first? (optional)</label>
        <textarea id="sidebar-new-problem-feedback" class="text-input" rows="3" placeholder="e.g. the last one felt like a big jump in complexity — ease up, or I want to focus on caching next"></textarea>
        <div id="sidebar-new-problem-prompt"></div>
      </div>
    </div>`;
}

function wireNewProblemForm() {
  const btn = document.getElementById("sidebar-new-problem-btn");
  const form = document.getElementById("sidebar-new-problem-form");
  const feedbackEl = document.getElementById("sidebar-new-problem-feedback");
  const promptWrap = document.getElementById("sidebar-new-problem-prompt");
  if (!btn || !form) return;
  const headlessId = "sidebar-new-problem-headless";
  const refresh = () => {
    promptWrap.innerHTML = promptResultHtml(startPromptText(feedbackEl.value), {
      copyLabel: "Copy start prompt",
      headlessId,
    });
    wireHeadlessRun(headlessId, startPromptTextHeadless(feedbackEl.value), () => {
      loadSidebar(null);
      if (!location.hash || location.hash === "#/" || location.hash === "#/problems") renderHome();
      return "Refreshing the problem list…";
    });
  };
  btn.addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) refresh();
  });
  feedbackEl.addEventListener("input", refresh);
}

async function loadSidebar(activeSlug) {
  if (!sidebarListEl) return;
  let problems = [];
  try {
    problems = (await fetchJson("/api/data")).problems;
  } catch {
    /* leave the list empty rather than blocking the page that actually matters */
  }
  sidebarListEl.innerHTML =
    newProblemFormHtml() +
    (problems.length
      ? problems.map((p) => sidebarProblemItemHtml(p, activeSlug)).join("")
      : `<p class="missing-note" style="padding:10px">No problems yet.</p>`);
  wireNewProblemForm();
}

function wireSidebarChrome() {
  const toggleBtn = document.getElementById("sidebar-toggle");
  const closeBtn = document.getElementById("sidebar-close");
  const backdrop = document.getElementById("sidebar-backdrop");
  const open = () => document.body.classList.add("sidebar-open");
  const close = () => document.body.classList.remove("sidebar-open");
  toggleBtn?.addEventListener("click", () => {
    document.body.classList.contains("sidebar-open") ? close() : open();
  });
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
}
wireSidebarChrome();

// ---------- Submissions page (all attempts across all 3 phases, flat list) ----------
//
// Each row links straight to the attempt itself — no inline preview-then-click-through step.
// It's a plain hash link, so the same embed-mode interceptor that opens any other attempt link
// in a new window (see near the top of this file) handles it automatically.

function submissionRowHtml(slug, entry) {
  const verdictHtml =
    entry.phase === "test"
      ? `Script ${verdictBadge(entry.script_verdict)} Functional ${verdictBadge(entry.functional_test_result)}`
      : verdictBadge(entry.verdict);
  const routeSegment =
    entry.phase === "test"
      ? entry.functional_test_result && entry.functional_test_result !== "not-run"
        ? "test-verify"
        : "test-check"
      : entry.phase;
  const attemptHref = `#/problems/${encodeURIComponent(slug)}/${routeSegment}/attempts/${encodeURIComponent(entry.folder)}`;
  return `<tr class="row-link" data-href="${escapeHtml(attemptHref)}">
    <td><span class="phase-chip phase-chip-${entry.phase}">${escapeHtml(PHASE_LABEL[entry.phase])}</span></td>
    <td><a href="${attemptHref}">Attempt ${escapeHtml(entry.attempt_number ?? "?")}</a></td>
    <td>${escapeHtml(entry.date ?? "—")}</td>
    <td>${verdictHtml}</td>
  </tr>`;
}

async function renderSubmissionsPage(slug) {
  showLoading();
  setContext([{ label: "Home", href: "#/" }, { label: slug, href: `#/problems/${encodeURIComponent(slug)}` }, { label: "Submissions" }]);
  let data;
  try {
    data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
  } catch (err) {
    return showError(err);
  }

  const all = [];
  for (const phase of PHASES) {
    for (const a of data.phases[phase].attempts) all.push({ phase, ...a });
  }
  all.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.attempt_number ?? 0) - (a.attempt_number ?? 0));

  appEl.innerHTML = `
    <div class="crumb"><a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(
    slug
  )}</a> / Submissions</div>
    ${problemTabsHtml(slug, "submissions")}
    <h1>Submissions — ${escapeHtml(slug)}</h1>
    ${
      all.length === 0
        ? `<p class="missing-note">No graded attempts yet in any phase.</p>`
        : `<div class="attempt-table-wrap"><table class="attempt-table">
             <thead><tr><th>Phase</th><th>Attempt</th><th>Date</th><th>Verdict</th></tr></thead>
             <tbody>${all.map((a) => submissionRowHtml(slug, a)).join("")}</tbody>
           </table></div>`
    }
  `;
}

// ---------- Window manager (outer doc only) — always-on grid of windows, each with its own
// draggable tab strip, each tab an iframe'd instance of this same app (?embed=1#<hash>). ----------
//
// Tab strips live in the OUTER document as real DOM (not inside the iframes), so dragging a
// tab never has to cross a frame boundary — only the page CONTENT is iframe'd, same reasoning
// as the old split-view (avoids refactoring every render function to target an arbitrary
// container), but now every window can hold multiple tabs and tabs can move between windows.
// Opening an attempt always creates a new window (see the embed-mode click interceptor further
// down); everything else navigates in place within the current tab. Dragging a tab over another
// window shows a drop indicator — left/right thirds split that window, the center third (or the
// tab strip itself) merges the tab in as a new tab there.

let windows = [];
let nextWinId = 1;
let focusedWinId = null;
let dragState = null;
let windowManagerBooted = false;

// Persists the open windows/tabs across a full page reload — without this, reloading always
// dumped you back to a single Home tab, since the outer document's own URL never reflects
// per-tab state (navigation only ever changes a tab's iframe, via postMessage — see the
// "update-tab" listener below). localStorage, not the URL, is the source of truth for restoring.
const WINDOW_STATE_KEY = "vault-viewer-window-state";

function saveWindowState() {
  try {
    localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({ windows, focusedWinId }));
  } catch {
    /* private browsing, storage full, etc. — state just won't survive a reload */
  }
}

function loadWindowState() {
  try {
    const raw = localStorage.getItem(WINDOW_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.windows) || parsed.windows.length === 0) return null;
    for (const w of parsed.windows) {
      if (!Array.isArray(w.tabs) || w.tabs.length === 0) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function titleForHash(hash) {
  const parts = decodeURIComponent((hash || "").replace(/^#\/?/, "")).split("/").filter(Boolean);
  if (parts[0] === "process") return "Process";
  if (parts[0] !== "problems" || !parts[1]) return "Home";
  const slug = parts[1];
  const seg = parts[2];
  if (!seg) return slug;
  if (seg === "submissions") {
    return parts[4] ? `${slug} · Submissions · ${parts[4]}` : `${slug} · Submissions`;
  }
  const label =
    {
      background: "Background",
      design: "Design",
      "given-app": "Code Analysis",
      terraform: "Terraform",
      "test-check": "Check",
      "test-verify": "Verify",
    }[seg] || seg;
  if (parts[3] === "attempts" && parts[4]) {
    const m = parts[4].match(/attempt-(\d+)/);
    return `${slug} · ${label} · Attempt ${m ? m[1] : parts[4]}`;
  }
  return `${slug} · ${label}`;
}

function newWindowObj(hash) {
  const tab = { id: nextWinId++, hash, title: titleForHash(hash) };
  return { id: nextWinId++, tabs: [tab], activeTabId: tab.id };
}

function openNewWindow(hash) {
  const win = newWindowObj(hash);
  windows.push(win);
  focusedWinId = win.id;
  renderWindows();
}

function addTabToWindow(winId, hash) {
  const win = windows.find((w) => w.id === winId);
  if (!win) return;
  const tab = { id: nextWinId++, hash, title: titleForHash(hash) };
  win.tabs.push(tab);
  win.activeTabId = tab.id;
  focusedWinId = winId;
  renderWindows();
}

function activateTab(winId, tabId) {
  const win = windows.find((w) => w.id === winId);
  if (!win) return;
  win.activeTabId = tabId;
  focusedWinId = winId;
  renderWindows();
}

function closeTab(winId, tabId) {
  const win = windows.find((w) => w.id === winId);
  if (!win) return;
  win.tabs = win.tabs.filter((t) => t.id !== tabId);
  if (win.tabs.length === 0) {
    windows = windows.filter((w) => w.id !== winId);
  } else if (win.activeTabId === tabId) {
    win.activeTabId = win.tabs[win.tabs.length - 1].id;
  }
  if (windows.length === 0) windows.push(newWindowObj("#/"));
  renderWindows();
}

// fromWinId/tabId is where the dragged tab currently lives. opts is either {toWinId} (merge as
// a tab into that window — dropped on its tab strip, or the center third of its body) or
// {splitWinId, side} (dropped on the left/right third of that window's body — creates a brand
// new window immediately before/after it holding just this tab).
function moveTab(fromWinId, tabId, opts) {
  const fromWin = windows.find((w) => w.id === fromWinId);
  if (!fromWin) return;
  const tabIdx = fromWin.tabs.findIndex((t) => t.id === tabId);
  if (tabIdx === -1) return;
  const [tab] = fromWin.tabs.splice(tabIdx, 1);
  const fromEmptied = fromWin.tabs.length === 0;
  if (fromEmptied) {
    windows = windows.filter((w) => w.id !== fromWinId);
  } else if (fromWin.activeTabId === tabId) {
    fromWin.activeTabId = fromWin.tabs[fromWin.tabs.length - 1].id;
  }

  if (opts.toWinId != null) {
    let targetWin = windows.find((w) => w.id === opts.toWinId);
    if (!targetWin) targetWin = fromEmptied && opts.toWinId === fromWinId ? { id: opts.toWinId, tabs: [], activeTabId: null } : null;
    if (!targetWin) {
      windows.push({ id: opts.toWinId, tabs: [], activeTabId: null });
      targetWin = windows[windows.length - 1];
    }
    targetWin.tabs.push(tab);
    targetWin.activeTabId = tab.id;
  } else {
    const idx = windows.findIndex((w) => w.id === opts.splitWinId);
    const newWin = { id: nextWinId++, tabs: [tab], activeTabId: tab.id };
    windows.splice(opts.side === "left" ? Math.max(idx, 0) : idx + 1, 0, newWin);
  }
  focusedWinId = opts.toWinId ?? opts.splitWinId;
  renderWindows();
}

function ensureDropIndicatorEl() {
  let el = document.getElementById("drop-indicator");
  if (!el) {
    el = document.createElement("div");
    el.id = "drop-indicator";
    el.className = "drop-indicator";
    document.body.appendChild(el);
  }
  return el;
}
function showDropIndicator(targetEl, zone) {
  const ind = ensureDropIndicatorEl();
  const rect = targetEl.getBoundingClientRect();
  let left = rect.left;
  let width = rect.width;
  if (zone === "left") width = rect.width / 2;
  else if (zone === "right") {
    left = rect.left + rect.width / 2;
    width = rect.width / 2;
  }
  ind.style.left = `${left}px`;
  ind.style.top = `${rect.top}px`;
  ind.style.width = `${width}px`;
  ind.style.height = `${rect.height}px`;
  ind.classList.add("visible");
}
function hideDropIndicator() {
  document.getElementById("drop-indicator")?.classList.remove("visible");
}

function windowTabbarHtml(win) {
  return (
    win.tabs
      .map(
        (t) => `
    <div class="wtab${t.id === win.activeTabId ? " active" : ""}" draggable="true" data-win="${win.id}" data-tab="${t.id}">
      <span class="wtab-title">${escapeHtml(t.title)}</span>
      <button type="button" class="wtab-close" data-win="${win.id}" data-tab="${t.id}" title="Close tab" aria-label="Close tab">✕</button>
    </div>`
      )
      .join("") + `<button type="button" class="wtab-add" data-win="${win.id}" title="New tab" aria-label="New tab">+</button>`
  );
}

function createWindowEl(win) {
  const el = document.createElement("div");
  el.className = "window";
  el.dataset.winId = win.id;
  el.innerHTML = `<div class="window-tabbar"></div><div class="window-body"><iframe class="window-frame" data-hash=""></iframe></div>`;
  el.addEventListener("mousedown", () => {
    focusedWinId = win.id;
  });

  const body = el.querySelector(".window-body");
  body.addEventListener("dragover", (e) => {
    if (!dragState) return;
    e.preventDefault();
    const rect = body.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const third = rect.width / 3;
    const zone = x < third ? "left" : x > rect.width - third ? "right" : "center";
    body.dataset.dropZone = zone;
    showDropIndicator(body, zone);
  });
  body.addEventListener("dragleave", (e) => {
    if (!body.contains(e.relatedTarget)) {
      delete body.dataset.dropZone;
      hideDropIndicator();
    }
  });
  body.addEventListener("drop", (e) => {
    e.preventDefault();
    hideDropIndicator();
    if (!dragState) return;
    const zone = body.dataset.dropZone || "center";
    delete body.dataset.dropZone;
    const targetWinId = Number(el.dataset.winId);
    if (zone === "center") moveTab(dragState.winId, dragState.tabId, { toWinId: targetWinId });
    else moveTab(dragState.winId, dragState.tabId, { splitWinId: targetWinId, side: zone });
    dragState = null;
  });
  return el;
}

function updateWindowTabbar(el, win) {
  const bar = el.querySelector(".window-tabbar");
  bar.innerHTML = windowTabbarHtml(win);
  bar.querySelectorAll(".wtab").forEach((tabEl) => {
    tabEl.addEventListener("click", (e) => {
      if (e.target.closest(".wtab-close")) return;
      activateTab(win.id, Number(tabEl.dataset.tab));
    });
    tabEl.addEventListener("dragstart", (e) => {
      dragState = { winId: win.id, tabId: Number(tabEl.dataset.tab) };
      tabEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "tab");
    });
    tabEl.addEventListener("dragend", () => {
      tabEl.classList.remove("dragging");
      dragState = null;
      hideDropIndicator();
    });
  });
  bar.querySelectorAll(".wtab-close").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(Number(btn.dataset.win), Number(btn.dataset.tab));
    });
  });
  bar.querySelector(".wtab-add")?.addEventListener("click", () => addTabToWindow(win.id, "#/"));
  bar.addEventListener("dragover", (e) => {
    if (!dragState) return;
    e.preventDefault();
    bar.classList.add("tabbar-drop-target");
  });
  bar.addEventListener("dragleave", () => bar.classList.remove("tabbar-drop-target"));
  bar.addEventListener("drop", (e) => {
    e.preventDefault();
    bar.classList.remove("tabbar-drop-target");
    if (!dragState) return;
    moveTab(dragState.winId, dragState.tabId, { toWinId: win.id });
    dragState = null;
  });
}

function updateWindowIframe(el, win) {
  const iframe = el.querySelector(".window-frame");
  const activeTab = win.tabs.find((t) => t.id === win.activeTabId);
  if (!activeTab) return;
  if (iframe.dataset.hash !== activeTab.hash) {
    iframe.src = `/?embed=1${activeTab.hash}`;
    iframe.dataset.hash = activeTab.hash;
  }
}

function renderWindows() {
  const grid = document.getElementById("window-grid");
  if (!grid) return;
  const wantedIds = windows.map((w) => String(w.id));
  Array.from(grid.children).forEach((el) => {
    if (!wantedIds.includes(el.dataset.winId)) el.remove();
  });
  windows.forEach((win, idx) => {
    let el = grid.querySelector(`.window[data-win-id="${win.id}"]`);
    if (!el) el = createWindowEl(win);
    if (grid.children[idx] !== el) grid.insertBefore(el, grid.children[idx] || null);
    updateWindowTabbar(el, win);
    updateWindowIframe(el, win);
  });
  saveWindowState();
}

// Navigation clicked in the outer doc itself (the sidebar, the brand link, the new-problem
// form) — there's no single "current page" out here, so it applies to whichever window was
// last focused (clicked into), same as how a browser's address bar always targets whichever
// tab has focus.
function navigateInFocusedWindow(hash) {
  const win = windows.find((w) => w.id === focusedWinId) || windows[windows.length - 1];
  if (!win) {
    openNewWindow(hash);
    return;
  }
  const tab = win.tabs.find((t) => t.id === win.activeTabId);
  tab.hash = hash;
  tab.title = titleForHash(hash);
  renderWindows();
}

function initWindowManager() {
  if (windowManagerBooted) return;
  windowManagerBooted = true;
  const restored = loadWindowState();
  if (restored) {
    windows = restored.windows;
    // Recomputed rather than trusting a stored counter — safe even if that value were ever
    // stale, and still guarantees no collision with any id already in the restored windows.
    let maxId = 0;
    for (const w of windows) {
      maxId = Math.max(maxId, w.id);
      for (const t of w.tabs) maxId = Math.max(maxId, t.id);
    }
    nextWinId = maxId + 1;
    focusedWinId = windows.some((w) => w.id === restored.focusedWinId) ? restored.focusedWinId : windows[0].id;
  } else {
    const initialHash = window.location.hash && window.location.hash !== "#/" ? window.location.hash : "#/";
    windows = [newWindowObj(initialHash)];
    focusedWinId = windows[0].id;
  }
  loadSidebar(null);
  renderWindows();
  document.getElementById("window-add-btn")?.addEventListener("click", () => openNewWindow("#/"));
}

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
  if (e.data.type === "open-window") {
    openNewWindow(e.data.hash);
  } else if (e.data.type === "update-tab") {
    const frame = Array.from(document.querySelectorAll(".window-frame")).find((f) => f.contentWindow === e.source);
    if (!frame) return;
    const winId = Number(frame.closest(".window")?.dataset.winId);
    const win = windows.find((w) => w.id === winId);
    const tab = win?.tabs.find((t) => t.id === win.activeTabId);
    if (!tab) return;
    tab.hash = e.data.hash;
    tab.title = titleForHash(e.data.hash);
    frame.dataset.hash = e.data.hash;
    const el = frame.closest(".window");
    if (el) updateWindowTabbar(el, win);
    saveWindowState();
  }
});

document.addEventListener("click", (e) => {
  if (document.documentElement.classList.contains("embed")) return;
  const a = e.target.closest('a[href^="#/"]');
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href");
  if (/\/attempts\/[^/]+$/.test(href)) openNewWindow(href);
  else navigateInFocusedWindow(href);
});

// ---------- Router (runs inside each window's embedded iframe only — the outer document never
// renders a page directly, it only manages windows/tabs; see above) ----------

const routes = [
  { pattern: /^#\/$/, handler: renderHome },
  { pattern: /^#\/process$/, handler: renderProcessPage },
  { pattern: /^#\/problems$/, handler: renderHome },
  { pattern: /^#\/problems\/([^/]+)$/, handler: renderProblemDetail },
  { pattern: /^#\/problems\/([^/]+)\/background$/, handler: renderBackgroundPage },
  { pattern: /^#\/problems\/([^/]+)\/design$/, handler: renderDesignPhasePage },
  { pattern: /^#\/problems\/([^/]+)\/design\/attempts\/([^/]+)$/, handler: renderDesignAttemptPage },
  { pattern: /^#\/problems\/([^/]+)\/given-app$/, handler: renderGivenAppPage },
  { pattern: /^#\/problems\/([^/]+)\/given-app\/attempts\/([^/]+)$/, handler: renderGivenAppAttemptPage },
  { pattern: /^#\/problems\/([^/]+)\/terraform$/, handler: renderTerraformPhasePage },
  { pattern: /^#\/problems\/([^/]+)\/terraform\/attempts\/([^/]+)$/, handler: renderTerraformAttemptPage },
  { pattern: /^#\/problems\/([^/]+)\/test-check$/, handler: renderTestCheckPage },
  { pattern: /^#\/problems\/([^/]+)\/test-check\/attempts\/([^/]+)$/, handler: renderTestCheckAttemptPage },
  { pattern: /^#\/problems\/([^/]+)\/test-verify$/, handler: renderTestVerifyPage },
  { pattern: /^#\/problems\/([^/]+)\/test-verify\/attempts\/([^/]+)$/, handler: renderTestVerifyAttemptPage },
  { pattern: /^#\/problems\/([^/]+)\/submissions$/, handler: renderSubmissionsPage },
];

function router() {
  if (!document.documentElement.classList.contains("embed")) {
    initWindowManager();
    return;
  }
  document.body.classList.remove("sidebar-open");
  const hash = window.location.hash || "#/";

  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      const slugMatch = hash.match(/^#\/problems\/([^/]+)/);
      loadSidebar(slugMatch ? decodeURIComponent(slugMatch[1]) : null);
      route.handler(...match.slice(1));
      window.parent.postMessage({ type: "update-tab", hash }, window.location.origin);
      return;
    }
  }
  loadSidebar(null);
  contextBarEl.innerHTML = "";
  appEl.innerHTML = `<div class="error-box">Unknown page: ${escapeHtml(hash)}</div>`;
  window.parent.postMessage({ type: "update-tab", hash }, window.location.origin);
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);

function showLoading() {
  appEl.innerHTML = `<div class="loading">Loading…</div>`;
}

function showError(err) {
  appEl.innerHTML = `<div class="error-box">Something went wrong: ${escapeHtml(err.message || String(err))}</div>`;
}

// ---------- Prompt generation (Home actions) ----------

function startPromptText(feedback) {
  const feedbackLine = feedback && feedback.trim() ? `\n\nOne more thing before you pick it: ${feedback.trim()}` : "";
  return `I'm ready for a new problem. Please issue one per rules.md's loop (step 1) — pick the next tier/topic based on progress.md. Before finalizing it, sanity-check the difficulty jump from my most recent attempts — if it's a big leap in complexity, say so and offer an easier option instead of just handing me the harder one.${feedbackLine}`;
}

// Headless is one-shot (-p, print and exit) — there's no one there to answer the difficulty-jump
// question startPromptText() deliberately invites, so left as-is it just talks about the problem
// and stops without ever writing problem.md (that's what happened when this was first wired up).
// This wraps the same prompt with a directive footer that only matters for a non-interactive run:
// make the safe default call yourself instead of pausing, note it inline, and actually write the
// files (problem.md, scaffolding, and step 2's background.md) rather than ending on a question.
function startPromptTextHeadless(feedback) {
  return `${startPromptText(feedback)}

This is a one-shot, non-interactive run — there's no one here to answer a follow-up question, so don't end on one or wait for confirmation. If you'd normally flag a difficulty jump or ask which topic to focus on, make the sensible, tier-appropriate default call yourself and note that judgment call as a line in problem.md, then write problem.md and the scaffolding per rules.md step 1 — if this problem needs a given-app, that includes writing given-app-spec.md AND generating the actual given-app code itself in this same pass, not just the spec; there's no separate hand-off to wait on. Continue straight into step 2 as well — curate background.md per rules.md's "Background — priming resources" section — instead of asking whether to.`;
}

function phaseLatestLabel(phase, latest) {
  if (!latest) return "no attempts yet";
  if (phase === "test") return `script ${latest.script_verdict ?? "?"}, functional ${latest.functional_test_result ?? "?"}`;
  return latest.verdict ?? "?";
}

function resumePromptText(recent) {
  const { slug, tier, phase, attempt } = recent;
  return `Resume ${slug} (tier ${tier ?? "?"}) — most recent activity: ${phase} attempt ${attempt.attempt_number} on ${
    attempt.date
  } (${phaseLatestLabel(phase, attempt)}). Pick up from here per rules.md's loop.`;
}

function askPromptText(p) {
  const status = PHASES.map((phase) => `${phase}: ${phaseLatestLabel(phase, p.phases?.[phase]?.latest)}`).join(", ");
  return `I have a question about ${p.slug} (tier ${p.tier ?? "?"}) — ${status}. Let's discuss, no changes yet.`;
}

// WEB-tagged, like startPromptText/askPromptText — Cowork already has direct vault file access
// (see rules.md's Tooling split), so this writes background.md itself, no paste-back/headless
// plumbing needed. See rules.md's "Background — priming resources" for the content standard
// this prompt is built from (variety of sources/teaching styles, real links only, notes not
// full summaries) — if that section changes, this prompt needs the same update, and vice versa.
function backgroundPromptText(slug) {
  return `I'm about to start on ${slug}. Before the clarification round, curate a short priming reading/watching list per rules.md's loop (step 2) and "Background — priming resources" section.

Read ${slug}/problem.md first, then find roughly 4-8 real, working resources covering: the core technology/pattern this problem is built around, the shape of the architecture involved (not just one piece of it), and at least one resource that gets into a realistic corner case or failure mode relevant to this problem's wrinkle.

If you have live web search available, actually use it to find and verify current resources rather than relying only on training-data memory — that's how you find the real third-party content this list needs, not just what you're already confident exists.

Variety is the point, not a nice-to-have — this list is unusable if it's mostly one publisher:
- Official cloud-provider documentation (AWS docs, an AWS blog post, etc.) is fine in more than one entry, but never as a bare link to the whole page — nobody's reading all of IAM to prime for one problem. Every docs entry MUST name the specific section/heading, or even the specific paragraphs, actually worth reading, right in its relevance note (e.g. "just the 'Identity-based policies' and 'Resource-based policies' sections, not the rest of the page"). Most of the list should still be real third-party content: engineering blogs from other companies, conference talks (re:Invent, KubeCon, Strange Loop, etc.), YouTube channels, newsletters — named creators/publishers, not just "the vendor's own docs" restated in different words.
- No two resources from the same channel, author, or publication.
- Mix formats — don't hand back all articles or all videos.

If you genuinely can't verify a good third-party resource for some angle (no web search available, nothing you're confident is real), say so explicitly in that entry rather than filling the slot with another unscoped docs.aws.amazon.com link or a fabricated URL — a shorter, honest list beats a padded, homogeneous one.

For each: its type (video/article), title, a real link, and a one-line note on why it's relevant. A short AI summary alongside a link is fine when it genuinely helps orient (e.g. which part of a long video matters here) — but it's a supplement, never a replacement for actually watching/reading it, and never a fabricated link.

Write it to ${slug}/background.md as a one-line intro followed by the flat resource list.`;
}

async function renderBackgroundPage(slug) {
  showLoading();
  setContext([{ label: "Home", href: "#/" }, { label: slug, href: `#/problems/${encodeURIComponent(slug)}` }, { label: "Background" }]);
  let data;
  try {
    data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
  } catch (err) {
    return showError(err);
  }

  const promptOptions = [
    {
      description:
        "Curates a short, varied reading/watching list (videos + articles) to prime the tech, architecture, and a realistic corner case this problem involves — before you start the clarification round.",
      prompt: backgroundPromptText(slug),
    },
  ];

  const bodyHtml = data.background_md
    ? `<div class="pane">
         <div class="pane-header">
           <span class="pane-header-label">background.md</span>
           <span class="pane-header-actions">${obsidianIconLink(`${slug}/background.md`)}</span>
         </div>
         <div class="pane-body" style="padding:20px">${renderMarkdown(data.background_md)}</div>
       </div>`
    : `<p class="missing-note">No background.md yet — copy the prompt above and run it in Cowork to get a priming list before you dive into clarification questions.</p>`;

  appEl.innerHTML = `
    <div class="crumb"><a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(
    slug
  )}</a> / Background</div>
    ${problemTabsHtml(slug, "background")}
    <div class="page-header-row">
      <h1>Background — ${escapeHtml(slug)}</h1>
      ${promptPickerHtml("background-actions-picker", "Copy prompt for a priming list", promptOptions, { tag: "web" })}
    </div>
    <p class="status-line">A short, varied set of external resources to prime your understanding before the
    clarification round and design doc — not a substitute for either, just a head start (rules.md step 2).</p>
    ${bodyHtml}
  `;

  wirePromptPicker("background-actions-picker", promptOptions);
}

// ---------- Process page (vault-wide, not per-problem) — a sequential timeline through
// rules.md's loop, one step at a time. ----------
//
// Kept here as the single source of truth for what each step reads/writes/who does it, so the
// timeline can't silently drift from the actual grading prompts. If a step's inputs/outputs
// change here, the corresponding prompt (server.js's design/terraform prepare, or
// checkScriptPromptText/runTestPromptText below) needs the same update, and vice versa.
//
// tag matches the CODE/WEB/YOU pills used everywhere else in the app: "code" = needs real file
// (or shell) access, "web" = pure discussion/text, "you" = the user does this step, no prompt.
const PROCESS_TIMELINE = [
  {
    tag: "web",
    phase: "problem",
    title: "1 · Issue the problem",
    summary:
      "Cowork states the functional requirements, scale/constraints, and explicit completion conditions, and generates the routine scaffolding at the same time — so step 7 always has an empty design-doc.md waiting to be written into, not a blank folder. If this problem needs a given-app, the actual code gets generated in this same pass too, not deferred to a separate hand-off — by the time this step is done, given-app/ already has real code in it, visible on the Code Analysis tab.",
    reads: ["progress.md / progress.json — to pick the next tier/topic"],
    writes: [
      "problem.md (requirements + completion conditions)",
      "scaffolding: an empty phases/design/current/design-doc.md, and a basic Terraform skeleton (provider block, variables.tf stub) in phases/terraform/current/",
      "given-app-spec.md, the actual given-app code, and generated.md — a short done-note — if this problem needs a given-app",
    ],
  },
  {
    tag: "web",
    phase: "problem",
    title: "2 · Background — priming resources (Background tab)",
    summary:
      "Before the clarification round, Cowork curates a short, varied reading/watching list — real videos and articles from different sources/teaching styles, not a pile from one channel — covering the core tech, the shape of the architecture involved, and a realistic corner case tied to this problem's wrinkle. The goal is a running start, not a substitute for the design doc's own thinking; a one-line note per resource says why it's there, an AI summary is only ever a supplement to the real thing.",
    reads: ["problem.md — to know what tech/architecture the priming should cover"],
    writes: ["background.md (curated resources: videos + articles, varied sources, one-line relevance notes, optional short AI summaries)"],
  },
  {
    tag: "web",
    phase: "problem",
    title: "3 · Clarification round",
    summary:
      "Right after the problem's issued, you ask questions about what it means or what's in scope. Cowork answers scope questions directly, but declines anything that's actually a design decision in disguise.",
    reads: ["problem.md"],
    writes: ["clarifications.json (optional, append-only log of the Q&A)"],
  },
  {
    tag: "you",
    phase: "neutral",
    title: "4 · Write your comprehension summary (Code Analysis tab)",
    summary:
      "This is part of the practice, not busywork Claude does for you — same pattern as the design doc: you write it yourself, solo, describing what the generated code actually does (endpoints/behavior, notable implementation choices, quirks). Claude Code doesn't write this for you; it only grades it, next step.",
    reads: ["given-app-spec.md", "every generated file in given-app/"],
    writes: ["given-app/current/description.md (freely overwritten until graded)"],
  },
  {
    tag: "code",
    phase: "neutral",
    title: "5 · Grade the comprehension summary",
    summary:
      "Checked against the actual generated code, not just the spec — a summary that gets the given-app's real behavior wrong (an endpoint, a data-handling detail, a deliberate quirk) is a finding, same as any other. Findings ordered minor → major → critical, rolled up to one verdict. Snapshots current/ into a new, immutable attempt.",
    reads: ["given-app/current/description.md", "every generated file in given-app/", "given-app-spec.md", "rules.md's grading standard"],
    writes: ["given-app/attempts/attempt-N/ — description.md snapshot, description-feedback.md, attempt.json"],
  },
  {
    tag: ["web", "you"],
    phase: "neutral",
    title: "6 · Review the comprehension feedback",
    summary:
      "Discuss any finding you don't understand or disagree with, same as reviewing design/Terraform feedback — not a rubber stamp. Available on every attempt, not just the latest.",
    reads: ["description-feedback.md", "description.md it's about"],
    writes: ["nothing — pure discussion"],
    loop: "Not satisfied? Revise current/description.md and grade again (back to step 5) — each grade is a new, independent attempt, not an edit to this one.",
  },
  {
    tag: "you",
    phase: "design",
    title: "7 · Write the design doc",
    summary:
      "You write it yourself, solo, within the timebox, into the design-doc.md step 1 already created. Only debugging-class questions get answered here — not design choices.",
    reads: ["problem.md", "given-app/current/description.md, or your own read of the code, if this problem has one"],
    writes: ["phases/design/current/design-doc.md (freely overwritten until graded)"],
  },
  {
    tag: "code",
    phase: "design",
    title: "8 · Grade the design doc",
    summary:
      "Findings ordered minor → major → critical, rolled up to one verdict. Snapshots current/ into a new, immutable attempt — grading is the only thing that creates one.",
    reads: ["design-doc.md", "problem.md", "given-app/current/description.md, if any", "rules.md's grading standard"],
    writes: ["phases/design/attempts/attempt-N/ — design-doc.md snapshot, design-feedback.md, attempt.json"],
  },
  {
    tag: ["web", "you"],
    phase: "design",
    title: "9 · Review the design feedback",
    summary:
      "Discuss any finding you don't understand or disagree with — this is guided discussion, not a rubber stamp or a rewrite handed to you. Available on every attempt, not just the latest.",
    reads: ["design-feedback.md", "design-doc.md it's about"],
    writes: ["nothing — pure discussion"],
    loop: "Not satisfied? Revise current/design-doc.md and grade again (back to step 8) — each grade is a new, independent attempt, not an edit to this one.",
  },
  {
    tag: "you",
    phase: "terraform",
    title: "10 · Implement the Terraform",
    summary: "You implement the graded design attempt — the corrected one, not your original draft — in phases/terraform/current/.",
    reads: ["the graded design attempt (not the original draft)"],
    writes: ["phases/terraform/current/*.tf"],
  },
  {
    tag: "code",
    phase: "terraform",
    title: "11 · Grade the Terraform",
    summary:
      "Checked against the design doc it implements, plus code quality/security/networking. Static validation (terraform validate/fmt, a scanner) runs first and folds straight into the findings.",
    reads: ["the .tf/.tfvars files (module subfolders included)", "the design attempt it implements", "problem.md", "static validation output"],
    writes: ["phases/terraform/attempts/attempt-N/ — terraform/ snapshot, terraform-feedback.md, attempt.json{implements}"],
  },
  {
    tag: ["web", "you"],
    phase: "terraform",
    title: "12 · Review the Terraform feedback",
    summary: "Same as step 9, for the Terraform attempt — discuss findings before deciding whether to revise or move on.",
    reads: ["terraform-feedback.md", "the .tf files it's about"],
    writes: ["nothing — pure discussion"],
    loop: "Not satisfied? Revise phases/terraform/current/ and grade again (back to step 11).",
  },
  {
    tag: "code",
    phase: "test",
    title: "13 · Write the test script",
    summary:
      "Claude Code writes the functional test script — no separate hand-off prompt needed for this, the same CODE-tagged run (headless or interactive) that graded the Terraform can continue straight into this. It must assert against the problem's stated completion conditions specifically, not a looser proxy.",
    reads: ["the graded terraform attempt", "the design doc it implements", "problem.md's stated completion conditions"],
    writes: ["phases/test/attempts/attempt-N/test-script.* (the attempt folder is created here)"],
  },
  {
    tag: "code",
    phase: "test",
    title: "14 · Grade the test script",
    summary: "Graded against the same standard as everything else in this project — does it test the claimed behavior, bounded runtime, fails safe. Stops before any apply.",
    reads: ["the test script just written", "rules.md's grading standard"],
    writes: ["test-script-feedback.md", "partial attempt.json (script_verdict set, functional_test_result: not-run)"],
  },
  {
    tag: ["web", "you"],
    phase: "test",
    title: "15 · Review the Check feedback",
    summary: "Discuss the test script's own grading — is it actually sound and safe to run against real infra — before spending anything.",
    reads: ["test-script-feedback.md", "the test script it's about"],
    writes: ["nothing — pure discussion"],
  },
  {
    tag: "code",
    phase: "test",
    title: "16 · Verify — deploy, run for real, destroy",
    summary:
      "Applies the terraform, runs the already-checked script against the live system, captures the real result, then destroys. The one step that spends real money — always a watched, deliberate run, never automatic.",
    reads: ["the checked test attempt", "the terraform attempt it deploys"],
    writes: ["test-evidence.md, test-evidence.json", "completed attempt.json{functional_test_result}"],
  },
  {
    tag: ["web", "you"],
    phase: "test",
    title: "17 · Review the Verify evidence",
    summary: "Discuss what actually happened in the real run — the output, the numbers, whether it really met the stated completion conditions.",
    reads: ["test-evidence.md", "the test script that produced it"],
    writes: ["nothing — pure discussion"],
  },
  {
    tag: "code",
    phase: "problem",
    title: "18 · Update progress",
    summary:
      "Reflects whatever phase(s) were just graded. Most single attempts don't need progress.md touched at all — the detail lives in the attempt folders themselves.",
    reads: ["the latest attempt.json for each phase just graded"],
    writes: ["progress.json (attempt count/latest verdict, every time)", "progress.md (only on a real narrative change)"],
    loop: "Blocking criticals stay flagged but never block starting a new problem — back to step 1, any time.",
  },
];

function processStepCardHtml(n, idx) {
  return `
    <div class="process-stage accent-${n.phase}">
      <div class="process-stage-header">
        ${tagPillsHtml(n.tag)}
        <div class="process-stage-title">${escapeHtml(n.title)}</div>
      </div>
      <p class="status-line">${escapeHtml(n.summary)}</p>
      <div class="process-stage-io">
        <div class="process-io-col">
          <span class="process-io-label">Reads</span>
          <ul>${n.reads.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
        </div>
        <div class="process-io-col">
          <span class="process-io-label">Writes</span>
          <ul>${n.writes.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
        </div>
      </div>
      ${n.loop ? `<div class="process-stage-loop">↩ ${escapeHtml(n.loop)}</div>` : ""}
    </div>`;
}

// Global rather than wired per-render — renderProcessPage() runs again on every hash change
// into #/process, which would otherwise stack up a fresh listener each time. Checking for the
// timeline rail's presence is enough to know whether we're actually on that page right now,
// with no separate "unmount" step needed when navigating away.
document.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const rail = document.querySelector(".process-timeline-rail");
  if (!rail) return;
  const btn = document.getElementById(e.key === "ArrowLeft" ? "process-prev" : "process-next");
  if (btn && !btn.disabled) {
    e.preventDefault();
    btn.click();
  }
});

async function renderProcessPage() {
  showLoading();
  setContext([{ label: "Home", href: "#/" }, { label: "Process" }]);
  let current = 0;

  function draw() {
    const n = PROCESS_TIMELINE[current];
    appEl.innerHTML = `
      <h1>How each problem flows</h1>
      <p class="status-line">Step by step through rules.md's loop — what each step reads, what it produces, and
      who does it. This is the source of truth the actual grading prompts are built from — if one changes, the
      other should too.</p>
      <div class="process-timeline-rail">
        ${PROCESS_TIMELINE.map(
          (s, i) => `
          <button type="button" class="process-timeline-dot accent-${s.phase}${i === current ? " active" : ""}" data-idx="${i}"
            title="${escapeHtml(s.title)}">${i + 1}</button>`
        ).join("")}
      </div>
      ${processStepCardHtml(n, current)}
      <div class="process-timeline-nav">
        <button type="button" class="btn-secondary" id="process-prev"${current === 0 ? " disabled" : ""}>← Previous</button>
        <span class="status-line">Step ${current + 1} of ${PROCESS_TIMELINE.length}</span>
        <button type="button" class="btn-primary" id="process-next"${
          current === PROCESS_TIMELINE.length - 1 ? " disabled" : ""
        }>Next →</button>
      </div>
    `;
    document.getElementById("process-prev")?.addEventListener("click", () => {
      current = Math.max(0, current - 1);
      draw();
    });
    document.getElementById("process-next")?.addEventListener("click", () => {
      current = Math.min(PROCESS_TIMELINE.length - 1, current + 1);
      draw();
    });
    document.querySelectorAll(".process-timeline-dot").forEach((btn) => {
      btn.addEventListener("click", () => {
        current = Number(btn.dataset.idx);
        draw();
      });
    });
  }
  draw();
}

// ---------- Home ----------

async function renderHome() {
  showLoading();
  setContext([{ label: "Home" }]);
  let data;
  try {
    data = await fetchJson("/api/data");
  } catch (err) {
    return showError(err);
  }

  appEl.innerHTML = `
    <h1>System Design + Terraform Practice</h1>
    <p class="status-line">
      Read-only viewer + grading over this vault's problems.
      ${data.problems.length} problem${data.problems.length === 1 ? "" : "s"} found on disk.
    </p>
    <div class="action-grid">
      <button class="action-btn accent-btn-problem" data-action="start">
        <span>Start new problem ${tagPillsHtml(["web", "code"])}</span>
        <span class="sub">Cowork, or run automatically</span>
      </button>
      <button class="action-btn accent-btn-design" data-action="resume">
        <span>Resume where I left off ${tagPillHtml("web")}</span>
        <span class="sub">Most recently-graded attempt</span>
      </button>
      <button class="action-btn accent-btn-test" data-action="ask">
        <span>Ask about a problem ${tagPillHtml("web")}</span>
        <span class="sub">Copy a ready-made prompt</span>
      </button>
    </div>
    <div class="action-result" id="action-result"></div>

    <div class="section">
      <h2>History</h2>
      ${renderProblemCards(data.problems)}
    </div>
  `;

  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleHomeAction(btn.dataset.action, data));
  });
}

function renderProblemCards(problems) {
  if (problems.length === 0) {
    return `<p class="missing-note">No problem folders found under the vault root.</p>`;
  }
  return `<div class="list-rows">${problems
    .map((p) => {
      const tier = p.tier !== null ? `Tier ${p.tier}` : "Tier unknown";
      const status = PHASES.map((phase) => {
        const ph = p.phases[phase];
        if (!ph || ph.attempt_count === 0) return `${phase}: none`;
        return `${phase}: ${phaseLatestLabel(phase, ph.latest)} (${ph.attempt_count})`;
      }).join(" · ");
      return `
        <a class="list-row accent-problem" href="#/problems/${encodeURIComponent(p.slug)}">
          <div class="list-row-main">
            <span class="list-row-title">${escapeHtml(p.slug)}</span>
            <span class="list-row-sub">${escapeHtml(status)}</span>
          </div>
          <div class="list-row-right">${escapeHtml(tier)}</div>
        </a>`;
    })
    .join("")}</div>`;
}

function mostRecentAttempt(data) {
  let best = null;
  for (const p of data.problems || []) {
    for (const phase of PHASES) {
      const latest = p.phases?.[phase]?.latest;
      if (!latest || !latest.date) continue;
      if (!best || latest.date >= best.attempt.date) {
        best = { slug: p.slug, tier: p.tier, phase, attempt: latest };
      }
    }
  }
  return best;
}

function handleHomeAction(action, data) {
  const resultEl = document.getElementById("action-result");

  if (action === "start") {
    const prompt = startPromptText();
    resultEl.innerHTML = `
      <div class="card accent-card-problem">
        <h3>Starting a new problem</h3>
        <p>Paste the prompt below into Cowork, or run it automatically below — either way it
        writes a new <code>&lt;problem-slug&gt;/problem.md</code> per <code>rules.md</code>'s
        loop, step 1 (running it automatically adds a couple of instructions so a one-shot run
        commits to writing the files instead of stalling on a question nobody's there to
        answer). Once it exists, it'll show up here in the history below.</p>
        ${promptResultHtml(prompt, { copyLabel: "Copy start prompt", headlessId: "home-start-headless" })}
      </div>`;
    wireHeadlessRun("home-start-headless", startPromptTextHeadless(), () => {
      renderHome();
      return "Refreshing the history below…";
    });
    return;
  }

  if (action === "ask") {
    if (data.problems.length === 0) {
      resultEl.innerHTML = `<div class="card accent-card-test"><p class="missing-note">No problems yet to ask about.</p></div>`;
      return;
    }
    resultEl.innerHTML = `
      <div class="card accent-card-test">
        <h3>Ask about a problem</h3>
        <p>Pick one below — the button copies a ready-made prompt for Cowork.</p>
      </div>
      ${data.problems
        .map((p) => {
          const tier = p.tier !== null ? `Tier ${p.tier}` : "Tier unknown";
          return `
            <div class="card accent-card-test">
              <div class="card-title-row">
                <strong>${escapeHtml(p.slug)}</strong>
                <span class="tier-badge">${escapeHtml(tier)}</span>
              </div>
              ${promptBox(askPromptText(p), { label: "Ask about this problem", green: true })}
            </div>`;
        })
        .join("")}`;
    return;
  }

  if (action === "resume") {
    const recent = mostRecentAttempt(data);
    if (!recent) {
      resultEl.innerHTML = `
        <div class="card">
          <h3>Nothing to resume</h3>
          <p>No graded attempts found yet in any problem's <code>phases/</code> folders. Use
          "Start new problem" to kick off the first one.</p>
        </div>`;
      return;
    }
    const { slug, tier, phase, attempt } = recent;
    const verdictRow =
      phase === "test"
        ? `<span class="verdict-item">Test script ${verdictBadge(attempt.script_verdict)}</span>
           <span class="verdict-item">Functional test ${verdictBadge(attempt.functional_test_result)}</span>`
        : `<span class="verdict-item">${escapeHtml(PHASE_LABEL[phase])} ${verdictBadge(attempt.verdict)}</span>`;
    const routeSegment =
      phase === "test"
        ? attempt.functional_test_result && attempt.functional_test_result !== "not-run"
          ? "test-verify"
          : "test-check"
        : phase;
    resultEl.innerHTML = `
      <div class="card accent-card-design">
        <h3>Most recently graded attempt</h3>
        <p><strong>${escapeHtml(slug)}</strong> (tier ${tier ?? "?"}) — ${escapeHtml(
      PHASE_LABEL[phase]
    )} attempt ${escapeHtml(attempt.attempt_number)} on ${escapeHtml(attempt.date)}.</p>
        <div class="verdict-row">${verdictRow}</div>
        <p><a href="#/problems/${encodeURIComponent(slug)}/${routeSegment}/attempts/${encodeURIComponent(
      attempt.folder
    )}">Open this attempt →</a></p>
        ${promptBox(resumePromptText(recent), { label: "Resume here", green: true })}
        <p class="missing-note">Note: this reflects the most recently graded attempt across all
        three phases. Check the problem's page for the full picture across design/terraform/test.</p>
      </div>`;
  }
}

// ---------- Problem detail ----------

async function renderProblemDetail(slug) {
  showLoading();
  setContext([{ label: "Home", href: "#/" }, { label: slug }], "problem");
  let data;
  try {
    data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
  } catch (err) {
    return showError(err);
  }

  const problemBody = data.problem_md
    ? renderMarkdown(data.problem_md)
    : `<p class="missing-note">problem.md not found for this problem.</p>`;

  const askOptions = [
    {
      description: "Discuss this problem so far — no changes yet, and this won't hand you the answer outright.",
      prompt: askPromptText({
        slug: data.slug,
        tier: data.tier,
        phases: Object.fromEntries(
          PHASES.map((phase) => {
            const attempts = data.phases[phase]?.attempts || [];
            return [phase, { latest: attempts.length ? attempts[attempts.length - 1] : null }];
          })
        ),
      }),
    },
  ];

  appEl.innerHTML = `
    <div class="crumb"><a href="#/">Home</a> / ${escapeHtml(slug)}</div>
    ${problemTabsHtml(slug, "problem")}
    <div class="page-header-row">
      <h1>${escapeHtml(slug)}</h1>
      ${promptPickerHtml("problem-actions-picker", "Copy prompt to ask about this problem", askOptions, { tag: "web" })}
    </div>
    <p class="status-line">${data.tier !== null ? `Tier ${data.tier}` : "Tier unknown"}</p>

    <div class="problem-statement-panel">
      <div class="problem-statement-header">
        <span>problem.md</span>
        ${obsidianIconLink(`${slug}/problem.md`)}
      </div>
      <div class="problem-statement-body">${problemBody}</div>
    </div>
  `;

  wirePromptPicker("problem-actions-picker", askOptions);
}

// ---------- Shared: phase breadcrumbs + attempt history list ----------

function phaseCrumb(slug, phase, extra) {
  const segs = [
    { label: "Home", href: "#/" },
    { label: slug, href: `#/problems/${encodeURIComponent(slug)}` },
    { label: PHASE_LABEL[phase], href: `#/problems/${encodeURIComponent(slug)}/${phase}` },
  ];
  if (extra) segs.push({ label: extra });
  return segs;
}

function attemptHistoryList(slug, phase, attempts, routeSegment = phase) {
  if (!attempts || attempts.length === 0) {
    return `<p class="missing-note">No attempts yet — grade to create the first one.</p>`;
  }
  const sorted = [...attempts].sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0)).reverse();
  const attemptHref = (a) =>
    `#/problems/${encodeURIComponent(slug)}/${routeSegment}/attempts/${encodeURIComponent(a.folder)}`;

  if (phase === "test") {
    const rows = sorted
      .map(
        (a) => `<tr class="row-link" data-href="${escapeHtml(attemptHref(a))}">
          <td><a href="${attemptHref(a)}">Attempt ${escapeHtml(a.attempt_number ?? "?")}</a></td>
          <td>${escapeHtml(a.date ?? "—")}</td>
          <td>${verdictBadge(a.script_verdict)}</td>
          <td>${verdictBadge(a.functional_test_result)}</td>
          <td>${
            a.tests
              ? `<a href="#/problems/${encodeURIComponent(slug)}/terraform/attempts/${encodeURIComponent(
                  a.tests
                )}">${escapeHtml(a.tests)}</a>`
              : `<span class="missing-note">—</span>`
          }</td>
        </tr>`
      )
      .join("");
    return `<div class="attempt-table-wrap"><table class="attempt-table">
      <thead><tr><th>Attempt</th><th>Date</th><th>Script</th><th>Functional</th><th>Tests (Terraform)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  if (phase === "terraform") {
    const rows = sorted
      .map(
        (a) => `<tr class="row-link" data-href="${escapeHtml(attemptHref(a))}">
          <td><a href="${attemptHref(a)}">Attempt ${escapeHtml(a.attempt_number ?? "?")}</a></td>
          <td>${escapeHtml(a.date ?? "—")}</td>
          <td>${verdictBadge(a.verdict)}</td>
          <td>${
            a.implements
              ? `<a href="#/problems/${encodeURIComponent(slug)}/design/attempts/${encodeURIComponent(
                  a.implements
                )}">${escapeHtml(a.implements)}</a>`
              : `<span class="missing-note">—</span>`
          }</td>
        </tr>`
      )
      .join("");
    return `<div class="attempt-table-wrap"><table class="attempt-table">
      <thead><tr><th>Attempt</th><th>Date</th><th>Verdict</th><th>Implements (Design)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  const rows = sorted
    .map(
      (a) => `<tr class="row-link" data-href="${escapeHtml(attemptHref(a))}">
        <td><a href="${attemptHref(a)}">Attempt ${escapeHtml(a.attempt_number ?? "?")}</a></td>
        <td>${escapeHtml(a.date ?? "—")}</td>
        <td>${verdictBadge(a.verdict)}</td>
      </tr>`
    )
    .join("");
  return `<div class="attempt-table-wrap"><table class="attempt-table">
    <thead><tr><th>Attempt</th><th>Date</th><th>Verdict</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// Two subtabs under a phase's own tab — "Current" (the live draft/files) and "Submissions"
// (that phase's attempt list) — so attempt history isn't a huge always-visible block on every
// visit; it's tucked one click away, same as LeetCode's Submissions tab. This is an in-page
// toggle rather than a route (both bodies are built up front and swapped by JS) specifically so
// the bubble indicator can slide smoothly between them instead of a full page reload.
function phaseSubTabsHtml(idPrefix, active) {
  return `<div class="phase-sub-tabs" id="${idPrefix}-subtabs">
    <div class="phase-sub-tab-bubble"></div>
    <a href="#" class="phase-sub-tab${active === "current" ? " active" : ""}" data-key="current">Current</a>
    <a href="#" class="phase-sub-tab${active === "submissions" ? " active" : ""}" data-key="submissions">Submissions</a>
  </div>
  <div id="${idPrefix}-subtab-body"></div>`;
}

// bodies: { current: { html, onShow }, submissions: { html, onShow } }
function wirePhaseSubTabs(idPrefix, bodies, initialKey) {
  const root = document.getElementById(`${idPrefix}-subtabs`);
  const bodyEl = document.getElementById(`${idPrefix}-subtab-body`);
  if (!root || !bodyEl) return;
  const tabs = Array.from(root.querySelectorAll(".phase-sub-tab"));
  const bubble = root.querySelector(".phase-sub-tab-bubble");

  function moveBubble(tabEl, animate) {
    if (!tabEl) return;
    if (!animate) bubble.style.transition = "none";
    bubble.style.left = `${tabEl.offsetLeft}px`;
    bubble.style.width = `${tabEl.offsetWidth}px`;
    if (!animate) {
      requestAnimationFrame(() => requestAnimationFrame(() => (bubble.style.transition = "")));
    }
  }

  function activate(key, animate) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.key === key));
    moveBubble(
      tabs.find((t) => t.dataset.key === key),
      animate
    );
    bodyEl.innerHTML = bodies[key].html;
    bodies[key].onShow?.();
  }

  tabs.forEach((t) =>
    t.addEventListener("click", (e) => {
      e.preventDefault();
      activate(t.dataset.key, true);
    })
  );
  activate(initialKey, false);
}

// ---------- Design phase page (current draft + grade + history) ----------

async function renderDesignPhasePage(slug, initialSubTab = "current") {
  showLoading();
  setContext(phaseCrumb(slug, "design"), "design");

  async function draw(subTab = initialSubTab) {
    let data;
    try {
      data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
    } catch (err) {
      return showError(err);
    }
    const design = data.phases.design;
    const draftRelPath = `${slug}/phases/design/current/design-doc.md`;
    const hasDraft = !!(design.current.design_doc && design.current.design_doc.trim());

    const submitAction = {
      description: hasDraft
        ? "Snapshots the current draft into a new attempt and hands you a ready-made grading prompt to paste into your own Claude session."
        : "Draft is empty — open it in Obsidian and write something first.",
      prepareUrl: `/api/problems/${encodeURIComponent(slug)}/phases/design/prepare`,
      saveFilesUrlPrefix: `/api/problems/${encodeURIComponent(slug)}/phases/design/attempts/`,
      attemptHrefPrefix: `#/problems/${encodeURIComponent(slug)}/design/attempts/`,
      onSubmitted: () => draw("submissions"),
    };

    const currentHtml = `
      <div class="section">
        <p class="status-line">Edited in Obsidian — this is a read-only preview.</p>
        <div class="pane">
          <div class="pane-header">
            <span class="pane-header-label">phases/design/current/design-doc.md</span>
            <span class="pane-header-actions">
              ${reloadButtonHtml("design-draft-reload")}
              ${obsidianIconLink(draftRelPath)}
            </span>
          </div>
          <div class="pane-body">${
            hasDraft
              ? renderAnnotatedCode(design.current.design_doc, "design-draft-pane", [])
              : `<p class="missing-note" style="padding:16px">Draft is empty — open it in Obsidian and write something first.</p>`
          }</div>
        </div>
      </div>`;
    const submissionsHtml = attemptHistoryList(slug, "design", design.attempts);

    appEl.innerHTML = `
      <div class="crumb"><a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(
      slug
    )}</a> / Design doc</div>
      ${problemTabsHtml(slug, "design")}
      <div class="page-header-row">
        <h1>Design doc — ${escapeHtml(slug)}</h1>
        ${actionButtonHtml("design-submit-btn", "Submit this draft & copy grading prompt", !hasDraft)}
      </div>
      ${actionBodyHtml("design-submit-btn", submitAction)}
      ${phaseSubTabsHtml("design", subTab)}
    `;

    wireActionButton("design-submit-btn", submitAction);
    wirePhaseSubTabs(
      "design",
      {
        current: { html: currentHtml, onShow: () => wireReloadButton("design-draft-reload", () => draw("current")) },
        submissions: { html: submissionsHtml },
      },
      subTab
    );
  }

  await draw();
}

// ---------- Design attempt page (read-only split view) ----------

async function renderDesignAttemptPage(slug, attemptFolder) {
  showLoading();
  let a, phaseAttempts;
  try {
    [a, phaseAttempts] = await Promise.all([
      fetchJson(`/api/problems/${encodeURIComponent(slug)}/phases/design/attempts/${encodeURIComponent(attemptFolder)}`),
      fetchPhaseAttempts(slug, "design"),
    ]);
  } catch (err) {
    return showError(err);
  }
  setContext(phaseCrumb(slug, "design", `Attempt ${a.attempt_number ?? attemptFolder}`), "design");

  const sortedAttempts = [...phaseAttempts].sort((x, y) => (x.attempt_number ?? 0) - (y.attempt_number ?? 0));
  const attemptIdx = sortedAttempts.findIndex((x) => x.folder === attemptFolder);
  const prevFolder = attemptIdx > 0 ? sortedAttempts[attemptIdx - 1].folder : null;
  let prevDesignDoc = null;
  let diffAvailable = false;
  if (prevFolder) {
    try {
      const prev = await fetchJson(
        `/api/problems/${encodeURIComponent(slug)}/phases/design/attempts/${encodeURIComponent(prevFolder)}`
      );
      prevDesignDoc = prev.design_doc;
      diffAvailable = true;
    } catch {
      /* diff toggle just won't be offered */
    }
  }

  const paneId = "design-artifact";
  const indexedAll = indexFindings(a.attempt_json?.findings);
  const fileFindings = findingsForFile(indexedAll, (f) => f === "design-doc.md");
  const noLoc = findingsWithoutLocation(indexedAll);
  const hasStructured = a.attempt_json != null;

  const leftBody = a.design_doc
    ? renderAnnotatedCode(a.design_doc, paneId, fileFindings)
    : `<p class="missing-note" style="padding:16px">design-doc.md not found.</p>`;

  const findingsBodyHtml = hasStructured
    ? `${
        noLoc.length ? `<div class="findings-general"><h4>General</h4>${renderFindingsListHtml(noLoc)}</div>` : ""
      }${renderFindingsListHtml(fileFindings, { emptyMessage: "No findings for design-doc.md." })}`
    : `<p class="missing-note">No attempt.json — findings aren't in structured form. See the raw feedback below.</p>`;

  const feedbackOptions = a.design_feedback
    ? [
        {
          label: "Ask about this feedback",
          description: "Discuss this attempt's design feedback without getting the fix handed to you outright.",
          prompt: askAboutPrompt({
            artifactLabel: "design doc",
            feedbackRel: `${slug}/phases/design/attempts/${attemptFolder}/design-feedback.md`,
            feedbackContent: a.design_feedback,
            artifactRel: `${slug}/phases/design/attempts/${attemptFolder}/design-doc.md`,
            artifactContent: a.design_doc,
          }),
        },
      ]
    : [];

  const attemptRel = `${slug}/phases/design/attempts/${attemptFolder}`;
  const referencePicker = referenceAnswerPickerHtml("design-reference-picker", {
    promptArgs: {
      artifactLabel: "design doc",
      attemptRel,
      problemRel: `${slug}/problem.md`,
      extraContext: `If "${slug}/given-app/" exists, also read "${slug}/given-app/current/description.md" (or the code directly) so the reference doc gets the given-app's real behavior right.`,
      outputFile: "design-reference.md",
    },
    saveFilesUrl: `/api/problems/${encodeURIComponent(slug)}/phases/design/attempts/${encodeURIComponent(attemptFolder)}/save-files`,
    onSaved: () => renderDesignAttemptPage(slug, attemptFolder),
  });

  appEl.innerHTML = `
    <div class="crumb">
      <a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(slug)}</a> /
      <a href="#/problems/${encodeURIComponent(slug)}/design">Design doc</a> / Attempt ${escapeHtml(
    a.attempt_number ?? attemptFolder
  )}
    </div>
    <div class="page-header-row">
      <h1>Design doc — Attempt ${escapeHtml(a.attempt_number ?? "?")}</h1>
      <div class="header-actions-group">
        ${feedbackPromptOrNote(feedbackOptions, !!a.design_feedback)}
        ${referencePicker.html}
      </div>
    </div>
    ${attemptNavHtml(slug, "design", phaseAttempts, attemptFolder)}
    <div class="verdict-row">
      <span class="verdict-item">${escapeHtml(a.date ?? "date unknown")}</span>
      <span class="verdict-item">Verdict ${verdictBadge(a.attempt_json?.verdict)}</span>
    </div>

    ${splitViewHeader("Compare")}
    <div class="split-view" id="split-view">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-header-label">design-doc.md</span>
          <span class="pane-header-actions">
            ${diffAvailable ? `<button type="button" class="pane-diff-toggle" id="design-diff-toggle">Show diff</button>` : ""}
            ${obsidianIconLink(`${slug}/phases/design/attempts/${attemptFolder}/design-doc.md`)}
          </span>
        </div>
        <div class="pane-body" id="design-pane-body">${leftBody}</div>
      </div>
      <div class="pane findings-pane">
        <div class="pane-header">
          <span class="pane-header-label">Findings — click a marker or item</span>
          <button type="button" class="pane-toggle-btn" id="findings-toggle" title="Collapse findings panel">⟩</button>
        </div>
        <div class="pane-body" id="findings-container">${findingsBodyHtml}</div>
      </div>
    </div>

    <div class="section">
      <h2>Full feedback</h2>
      ${collapsible(
        "design-feedback.md",
        a.design_feedback ? renderMarkdown(a.design_feedback) : `<p class="missing-note">design-feedback.md not found.</p>`,
        { accent: "design", open: true, filePath: `${slug}/phases/design/attempts/${attemptFolder}/design-feedback.md` }
      )}
    </div>
    ${
      a.design_reference
        ? referenceAnswerSectionHtml(`${attemptRel}/design-reference.md`, `<div style="padding:20px">${renderMarkdown(a.design_reference)}</div>`)
        : ""
    }
  `;

  wireAnnotatedCode(paneId);
  wireFindingsJump(document.getElementById("findings-container"), fileFindings.concat(noLoc), paneId);
  wireFindingsToggle();
  wireSplitViewMinimize();
  wirePromptPicker("feedback-prompt-picker", feedbackOptionsOrPlaceholder(feedbackOptions));
  wirePromptPicker("design-reference-picker", referencePicker.options);
  if (diffAvailable) {
    wireDiffToggle({
      toggleId: "design-diff-toggle",
      bodyId: "design-pane-body",
      getCodeHtml: () => leftBody,
      getDiffHtml: () => renderDiffPane(prevDesignDoc, a.design_doc),
      onShowCode: () => {
        wireAnnotatedCode(paneId);
        wireFindingsJump(document.getElementById("findings-container"), fileFindings.concat(noLoc), paneId);
      },
    });
  }
}

// ---------- Given App / Code Analysis (given-app comprehension — graded, same pattern as
// design: you write given-app/current/description.md yourself, Claude Code only grades it) ----------

function givenAppFileTabsHtml(files, activeFile) {
  return `<div class="file-tabs">${files
    .map(
      (f) =>
        `<button type="button" class="file-tab${f.path === activeFile ? " active" : ""}" data-file="${escapeHtml(
          f.path
        )}">${escapeHtml(f.path)}</button>`
    )
    .join("")}</div>`;
}

async function renderGivenAppPage(slug, initialSubTab = "current") {
  showLoading();
  setContext(phaseCrumb(slug, "given-app"));

  async function draw(subTab = initialSubTab) {
    let data;
    try {
      data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
    } catch (err) {
      return showError(err);
    }
    const givenApp = data.given_app;
    const files = givenApp?.code_files || [];
    let activeFile = files[0]?.path;

    function codeBodyHtml() {
      if (!files.length) return `<p class="missing-note" style="padding:16px">No generated code files found yet.</p>`;
      const f = files.find((f) => f.path === activeFile);
      return renderAnnotatedCode(f ? f.content : "", "given-app-code-pane", []);
    }

    const draftRelPath = `${slug}/given-app/current/description.md`;
    const hasDraft = !!(givenApp?.current?.description && givenApp.current.description.trim());

    const submitAction = {
      description: !givenApp
        ? "No given-app for this problem."
        : hasDraft
        ? "Snapshots your summary into a new attempt and hands you a ready-made grading prompt — checked against the actual generated code, not just the spec."
        : "Draft is empty — write your comprehension summary in Obsidian first (what the code actually does, not just the spec).",
      prepareUrl: `/api/problems/${encodeURIComponent(slug)}/given-app/prepare`,
      saveFilesUrlPrefix: `/api/problems/${encodeURIComponent(slug)}/given-app/attempts/`,
      attemptHrefPrefix: `#/problems/${encodeURIComponent(slug)}/given-app/attempts/`,
      onSubmitted: () => draw("submissions"),
    };

    // Current = the material you'd read (spec + generated code) plus your own live comprehension
    // draft, same Current/Submissions split as Design/Terraform — the draft here plays exactly
    // the role design-doc.md plays there: written solo, freely overwritten until graded.
    const currentHtml = givenApp
      ? `
        ${collapsible(
          "given-app-spec.md",
          givenApp.spec ? renderMarkdown(givenApp.spec) : `<p class="missing-note">given-app-spec.md not found.</p>`,
          { accent: "problem", filePath: `${slug}/given-app/given-app-spec.md` }
        )}
        ${collapsible(
          "generated.md",
          givenApp.generated_note
            ? renderMarkdown(givenApp.generated_note)
            : `<p class="missing-note">No generated.md yet — Claude Code hasn't finished building this given-app.</p>`,
          { accent: "problem", filePath: `${slug}/given-app/generated.md` }
        )}
        <div class="section">
          <h2>Generated code</h2>
          ${
            files.length
              ? `<div class="pane">
                   <div id="given-app-file-tabs">${givenAppFileTabsHtml(files, activeFile)}</div>
                   <div class="pane-body" id="given-app-code-body">${codeBodyHtml()}</div>
                 </div>`
              : `<p class="missing-note">No generated code files found yet.</p>`
          }
        </div>
        <div class="section">
          <h2>Your comprehension summary</h2>
          <p class="status-line">Edited in Obsidian — this is a read-only preview. Write what the code
          actually does in your own words; the "Submit" button above grades it against the real code.</p>
          <div class="pane">
            <div class="pane-header">
              <span class="pane-header-label">given-app/current/description.md</span>
              <span class="pane-header-actions">
                ${reloadButtonHtml("given-app-draft-reload")}
                ${obsidianIconLink(draftRelPath)}
              </span>
            </div>
            <div class="pane-body">${
              hasDraft
                ? renderAnnotatedCode(givenApp.current.description, "given-app-draft-pane", [])
                : `<p class="missing-note" style="padding:16px">Draft is empty — open it in Obsidian and write something first.</p>`
            }</div>
          </div>
        </div>`
      : `<p class="missing-note">This problem doesn't have a given application — it's only relevant when the
         problem involves fronting/scaling/securing an existing piece of app logic.</p>`;

    const submissionsHtml = attemptHistoryList(slug, "given-app", givenApp?.attempts, "given-app");

    appEl.innerHTML = `
      <div class="crumb"><a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(
      slug
    )}</a> / Code Analysis</div>
      ${problemTabsHtml(slug, "given-app")}
      <div class="page-header-row">
        <h1>Code Analysis — ${escapeHtml(slug)}</h1>
        ${actionButtonHtml("given-app-submit-btn", "Submit this summary & copy grading prompt", !givenApp || !hasDraft)}
      </div>
      ${actionBodyHtml("given-app-submit-btn", submitAction)}
      ${phaseSubTabsHtml("given-app", subTab)}
    `;

    if (givenApp) wireActionButton("given-app-submit-btn", submitAction);

    function wireFileTabs() {
      document.querySelectorAll("#given-app-file-tabs .file-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeFile = btn.dataset.file;
          document.getElementById("given-app-file-tabs").innerHTML = givenAppFileTabsHtml(files, activeFile);
          document.getElementById("given-app-code-body").innerHTML = codeBodyHtml();
          wireFileTabs();
          wireAnnotatedCode("given-app-code-pane");
        });
      });
    }

    wirePhaseSubTabs(
      "given-app",
      {
        current: {
          html: currentHtml,
          onShow: () => {
            if (!givenApp) return;
            wireFileTabs();
            if (files.length) wireAnnotatedCode("given-app-code-pane");
            if (hasDraft) wireAnnotatedCode("given-app-draft-pane");
            wireReloadButton("given-app-draft-reload", () => draw("current"));
          },
        },
        submissions: { html: submissionsHtml },
      },
      subTab
    );
  }

  await draw();
}

// ---------- Given-app attempt page (read-only split view — same shape as the design one) ----------

async function renderGivenAppAttemptPage(slug, attemptFolder) {
  showLoading();
  let a, phaseAttempts;
  try {
    [a, phaseAttempts] = await Promise.all([
      fetchJson(`/api/problems/${encodeURIComponent(slug)}/given-app/attempts/${encodeURIComponent(attemptFolder)}`),
      fetchJson(`/api/problems/${encodeURIComponent(slug)}`).then((d) => d.given_app?.attempts || []),
    ]);
  } catch (err) {
    return showError(err);
  }
  setContext(phaseCrumb(slug, "given-app", `Attempt ${a.attempt_number ?? attemptFolder}`));

  const sortedAttempts = [...phaseAttempts].sort((x, y) => (x.attempt_number ?? 0) - (y.attempt_number ?? 0));
  const attemptIdx = sortedAttempts.findIndex((x) => x.folder === attemptFolder);
  const prevFolder = attemptIdx > 0 ? sortedAttempts[attemptIdx - 1].folder : null;
  let prevDescription = null;
  let diffAvailable = false;
  if (prevFolder) {
    try {
      const prev = await fetchJson(
        `/api/problems/${encodeURIComponent(slug)}/given-app/attempts/${encodeURIComponent(prevFolder)}`
      );
      prevDescription = prev.description;
      diffAvailable = true;
    } catch {
      /* diff toggle just won't be offered */
    }
  }

  const paneId = "given-app-artifact";
  const indexedAll = indexFindings(a.attempt_json?.findings);
  const fileFindings = findingsForFile(indexedAll, (f) => f === "description.md");
  const noLoc = findingsWithoutLocation(indexedAll);
  const hasStructured = a.attempt_json != null;

  const leftBody = a.description
    ? renderAnnotatedCode(a.description, paneId, fileFindings)
    : `<p class="missing-note" style="padding:16px">description.md not found.</p>`;

  const findingsBodyHtml = hasStructured
    ? `${
        noLoc.length ? `<div class="findings-general"><h4>General</h4>${renderFindingsListHtml(noLoc)}</div>` : ""
      }${renderFindingsListHtml(fileFindings, { emptyMessage: "No findings for description.md." })}`
    : `<p class="missing-note">No attempt.json — findings aren't in structured form. See the raw feedback below.</p>`;

  const feedbackOptions = a.description_feedback
    ? [
        {
          label: "Ask about this feedback",
          description: "Discuss this attempt's comprehension feedback without getting the fix handed to you outright.",
          prompt: askAboutPrompt({
            artifactLabel: "given-app comprehension summary",
            feedbackRel: `${slug}/given-app/attempts/${attemptFolder}/description-feedback.md`,
            feedbackContent: a.description_feedback,
            artifactRel: `${slug}/given-app/attempts/${attemptFolder}/description.md`,
            artifactContent: a.description,
          }),
        },
      ]
    : [];

  const gaAttemptRel = `${slug}/given-app/attempts/${attemptFolder}`;
  const referencePicker = referenceAnswerPickerHtml("given-app-reference-picker", {
    promptArgs: {
      artifactLabel: "given-app comprehension summary",
      attemptRel: gaAttemptRel,
      problemRel: `${slug}/given-app/given-app-spec.md`,
      extraReads: [],
      extraContext: `Also read every generated code file under "${slug}/given-app/" (skip current/ and attempts/) — the reference summary needs to match the actual code, not just the spec.`,
      outputFile: "description-reference.md",
    },
    saveFilesUrl: `/api/problems/${encodeURIComponent(slug)}/given-app/attempts/${encodeURIComponent(attemptFolder)}/save-files`,
    onSaved: () => renderGivenAppAttemptPage(slug, attemptFolder),
  });

  appEl.innerHTML = `
    <div class="crumb">
      <a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(slug)}</a> /
      <a href="#/problems/${encodeURIComponent(slug)}/given-app">Code Analysis</a> / Attempt ${escapeHtml(
    a.attempt_number ?? attemptFolder
  )}
    </div>
    <div class="page-header-row">
      <h1>Code Analysis — Attempt ${escapeHtml(a.attempt_number ?? "?")}</h1>
      <div class="header-actions-group">
        ${feedbackPromptOrNote(feedbackOptions, !!a.description_feedback)}
        ${referencePicker.html}
      </div>
    </div>
    ${attemptNavHtml(slug, "given-app", phaseAttempts, attemptFolder)}
    <div class="verdict-row">
      <span class="verdict-item">${escapeHtml(a.date ?? "date unknown")}</span>
      <span class="verdict-item">Verdict ${verdictBadge(a.attempt_json?.verdict)}</span>
    </div>

    ${splitViewHeader("Compare")}
    <div class="split-view" id="split-view">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-header-label">description.md</span>
          <span class="pane-header-actions">
            ${diffAvailable ? `<button type="button" class="pane-diff-toggle" id="given-app-diff-toggle">Show diff</button>` : ""}
            ${obsidianIconLink(`${slug}/given-app/attempts/${attemptFolder}/description.md`)}
          </span>
        </div>
        <div class="pane-body" id="given-app-pane-body">${leftBody}</div>
      </div>
      <div class="pane findings-pane">
        <div class="pane-header">
          <span class="pane-header-label">Findings — click a marker or item</span>
          <button type="button" class="pane-toggle-btn" id="findings-toggle" title="Collapse findings panel">⟩</button>
        </div>
        <div class="pane-body" id="findings-container">${findingsBodyHtml}</div>
      </div>
    </div>

    <div class="section">
      <h2>Full feedback</h2>
      ${collapsible(
        "description-feedback.md",
        a.description_feedback ? renderMarkdown(a.description_feedback) : `<p class="missing-note">description-feedback.md not found.</p>`,
        { accent: "problem", open: true, filePath: `${slug}/given-app/attempts/${attemptFolder}/description-feedback.md` }
      )}
    </div>
    ${
      a.description_reference
        ? referenceAnswerSectionHtml(
            `${gaAttemptRel}/description-reference.md`,
            `<div style="padding:20px">${renderMarkdown(a.description_reference)}</div>`
          )
        : ""
    }
  `;

  wireAnnotatedCode(paneId);
  wireFindingsJump(document.getElementById("findings-container"), fileFindings.concat(noLoc), paneId);
  wireFindingsToggle();
  wireSplitViewMinimize();
  wirePromptPicker("feedback-prompt-picker", feedbackOptionsOrPlaceholder(feedbackOptions));
  wirePromptPicker("given-app-reference-picker", referencePicker.options);
  if (diffAvailable) {
    wireDiffToggle({
      toggleId: "given-app-diff-toggle",
      bodyId: "given-app-pane-body",
      getCodeHtml: () => leftBody,
      getDiffHtml: () => renderDiffPane(prevDescription, a.description),
      onShowCode: () => {
        wireAnnotatedCode(paneId);
        wireFindingsJump(document.getElementById("findings-container"), fileFindings.concat(noLoc), paneId);
      },
    });
  }
}

// ---------- Terraform phase page (current files + grade + history) ----------

async function renderTerraformPhasePage(slug, initialSubTab = "current") {
  showLoading();
  setContext(phaseCrumb(slug, "terraform"), "terraform");

  let activeFile = null;
  const paneId = "terraform-current";

  async function draw(subTab = initialSubTab) {
    let data;
    try {
      data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
    } catch (err) {
      return showError(err);
    }
    const terraform = data.phases.terraform;
    const designAttempts = data.phases.design.attempts;
    const files = terraform.current.files;

    if (!activeFile || !files.some((f) => f.path === activeFile)) activeFile = files[0]?.path;

    function codeBodyHtml() {
      if (!files.length)
        return `<p class="missing-note" style="padding:16px">No .tf/.tfvars files in phases/terraform/current/ yet (subfolders, e.g. modules/, are read too).</p>`;
      const f = files.find((f) => f.path === activeFile);
      return renderAnnotatedCode(f ? f.content : "", paneId, []);
    }

    function fileTabsHtml() {
      if (!files.length) return "";
      return `<div class="file-tabs">${files
        .map(
          (f) =>
            `<span class="file-tab-wrap">
              <button type="button" class="file-tab${f.path === activeFile ? " active" : ""}" data-file="${escapeHtml(
              f.path
            )}">${escapeHtml(f.path)}</button>
              ${obsidianIconLink(`${slug}/phases/terraform/current/${f.path}`)}
            </span>`
        )
        .join("")}</div>`;
    }

    // Always implements the most recent graded design attempt — no reason to make you pick an
    // older one (same reasoning as Check/Verify always testing the most recent attempt).
    const mostRecentDesign = designAttempts.length ? designAttempts[designAttempts.length - 1] : null;
    const canPrepare = files.length > 0 && !!mostRecentDesign;
    const submitAction = {
      description:
        designAttempts.length === 0
          ? "No graded design attempt yet — grade a design doc first."
          : files.length === 0
          ? "No .tf files in phases/terraform/current/ yet."
          : "Snapshots the current .tf files into a new attempt, against the most recent graded design attempt, and hands you a ready-made grading prompt to paste into your own Claude session.",
      extraFieldHtml: mostRecentDesign
        ? `<p class="status-line">Implements <a href="#/problems/${encodeURIComponent(
            slug
          )}/design/attempts/${encodeURIComponent(mostRecentDesign.folder)}">Design attempt ${escapeHtml(
            mostRecentDesign.attempt_number
          )}</a> (${escapeHtml(mostRecentDesign.date)}) — ${escapeHtml(
            VERDICT_LABEL[mostRecentDesign.verdict] || mostRecentDesign.verdict || "ungraded"
          )}.</p>`
        : "",
      prepareUrl: `/api/problems/${encodeURIComponent(slug)}/phases/terraform/prepare`,
      buildBody: () => ({ implements: mostRecentDesign?.folder }),
      saveFilesUrlPrefix: `/api/problems/${encodeURIComponent(slug)}/phases/terraform/attempts/`,
      attemptHrefPrefix: `#/problems/${encodeURIComponent(slug)}/terraform/attempts/`,
      onSubmitted: () => draw("submissions"),
    };

    const currentHtml = `
      <div class="section">
        <p class="status-line">Edited directly on disk — this pane just displays what's there now.
        Terraform is normally a whole-folder edit, not one file at a time — use "Open in VS Code"
        to work on the whole folder there rather than a per-file Obsidian link.</p>
        <div class="pane">
          <div class="file-tabs-row">
            <div id="file-tabs-container" class="file-tabs-container">${fileTabsHtml()}</div>
            <div class="file-tabs-row-actions">
              ${openFolderLinkHtml(`${slug}/phases/terraform/current`)}
              ${reloadButtonHtml("terraform-current-reload")}
            </div>
          </div>
          <div class="pane-body" id="tf-code-body">${codeBodyHtml()}</div>
        </div>
      </div>`;
    const submissionsHtml = attemptHistoryList(slug, "terraform", terraform.attempts);

    appEl.innerHTML = `
      <div class="crumb"><a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(
      slug
    )}</a> / Terraform</div>
      ${problemTabsHtml(slug, "terraform")}
      <div class="page-header-row">
        <h1>Terraform — ${escapeHtml(slug)}</h1>
        ${actionButtonHtml("terraform-submit-btn", "Submit these files & copy grading prompt", !canPrepare)}
      </div>
      ${actionBodyHtml("terraform-submit-btn", submitAction)}
      ${phaseSubTabsHtml("terraform", subTab)}
    `;

    function wireFileTabs() {
      document.querySelectorAll(".file-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeFile = btn.dataset.file;
          document.getElementById("file-tabs-container").innerHTML = fileTabsHtml();
          document.getElementById("tf-code-body").innerHTML = codeBodyHtml();
          wireFileTabs();
        });
      });
    }

    wireActionButton("terraform-submit-btn", submitAction);
    wirePhaseSubTabs(
      "terraform",
      {
        current: {
          html: currentHtml,
          onShow: () => {
            wireFileTabs();
            wireReloadButton("terraform-current-reload", () => draw("current"));
          },
        },
        submissions: { html: submissionsHtml },
      },
      subTab
    );
  }

  await draw();
}

// ---------- Terraform attempt page (read-only split view, file tabs) ----------

async function renderTerraformAttemptPage(slug, attemptFolder) {
  showLoading();
  let a, phaseAttempts;
  try {
    [a, phaseAttempts] = await Promise.all([
      fetchJson(`/api/problems/${encodeURIComponent(slug)}/phases/terraform/attempts/${encodeURIComponent(attemptFolder)}`),
      fetchPhaseAttempts(slug, "terraform"),
    ]);
  } catch (err) {
    return showError(err);
  }
  setContext(phaseCrumb(slug, "terraform", `Attempt ${a.attempt_number ?? attemptFolder}`), "terraform");

  if (a.terraform_files.length === 0) {
    appEl.innerHTML = `
      <div class="crumb">
        <a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(slug)}</a> /
        <a href="#/problems/${encodeURIComponent(slug)}/terraform">Terraform</a> / Attempt ${escapeHtml(
      a.attempt_number ?? attemptFolder
    )}
      </div>
      <h1>Terraform — Attempt ${escapeHtml(a.attempt_number ?? "?")}</h1>
      ${attemptNavHtml(slug, "terraform", phaseAttempts, attemptFolder)}
      <p class="missing-note">No Terraform files found in this attempt.</p>
    `;
    return;
  }

  const sortedAttempts = [...phaseAttempts].sort((x, y) => (x.attempt_number ?? 0) - (y.attempt_number ?? 0));
  const attemptIdx = sortedAttempts.findIndex((x) => x.folder === attemptFolder);
  const prevFolder = attemptIdx > 0 ? sortedAttempts[attemptIdx - 1].folder : null;
  let prevFilesByName = {};
  let diffAvailable = false;
  if (prevFolder) {
    try {
      const prev = await fetchJson(
        `/api/problems/${encodeURIComponent(slug)}/phases/terraform/attempts/${encodeURIComponent(prevFolder)}`
      );
      prevFilesByName = Object.fromEntries((prev.terraform_files || []).map((f) => [f.path, f.content]));
      diffAvailable = true;
    } catch {
      /* diff toggle just won't be offered */
    }
  }

  let activeFile = a.terraform_files[0].path;
  let showingDiff = false;
  const paneId = "terraform-artifact";
  const indexedAll = indexFindings(a.attempt_json?.findings);
  const noLoc = findingsWithoutLocation(indexedAll);
  const hasStructured = a.attempt_json != null;
  const fileCounts = fileFindingCounts(indexedAll);

  function activeFileFindings() {
    return findingsForFile(indexedAll, (f) => f === `terraform/${activeFile}`);
  }

  function fileTabsHtml() {
    return `<div class="file-tabs">${a.terraform_files
      .map((f) => {
        const c = fileCounts[f.path];
        const badge = c && c.total > 0 ? `<span class="tab-badge sev-${c.bucket}">${c.total}</span>` : "";
        return `<span class="file-tab-wrap">
          <button type="button" class="file-tab${
            f.path === activeFile ? " active" : ""
          }" data-file="${escapeHtml(f.path)}">${escapeHtml(f.path)}${badge}</button>
          ${obsidianIconLink(`${slug}/phases/terraform/attempts/${attemptFolder}/terraform/${f.path}`)}
        </span>`;
      })
      .join("")}</div>`;
  }

  function codeBodyHtml() {
    const f = a.terraform_files.find((f) => f.path === activeFile);
    if (showingDiff) return renderDiffPane(prevFilesByName[activeFile] ?? "", f ? f.content : "");
    return renderAnnotatedCode(f ? f.content : "", paneId, activeFileFindings());
  }

  function findingsBodyHtml() {
    const ff = activeFileFindings();
    return hasStructured
      ? `${
          noLoc.length ? `<div class="findings-general"><h4>General</h4>${renderFindingsListHtml(noLoc)}</div>` : ""
        }${renderFindingsListHtml(ff, { emptyMessage: `No findings for ${activeFile}.` })}`
      : `<p class="missing-note">No attempt.json — findings aren't in structured form. See the raw feedback below.</p>`;
  }

  const feedbackOptions = a.terraform_feedback
    ? [
        {
          label: "Ask about this feedback",
          description: "Discuss this attempt's Terraform feedback without getting the fix handed to you outright.",
          prompt: askAboutPrompt({
            artifactLabel: "Terraform config",
            feedbackRel: `${slug}/phases/terraform/attempts/${attemptFolder}/terraform-feedback.md`,
            feedbackContent: a.terraform_feedback,
            artifactRel: `${slug}/phases/terraform/attempts/${attemptFolder}/terraform/`,
            artifactContent: joinFileContents(a.terraform_files),
          }),
        },
      ]
    : [];

  const tfAttemptRel = `${slug}/phases/terraform/attempts/${attemptFolder}`;
  const referencePicker = referenceAnswerPickerHtml("terraform-reference-picker", {
    promptArgs: {
      artifactLabel: "Terraform",
      attemptRel: tfAttemptRel,
      problemRel: `${slug}/problem.md`,
      extraReads: a.attempt_json?.implements ? [`${slug}/phases/design/attempts/${a.attempt_json.implements}/design-doc.md`] : [],
      extraContext:
        "Write real, complete .tf resources (not pseudocode), as fenced code blocks inside the one output file below, one block per file with its filename as a heading.",
      outputFile: "terraform-reference.md",
    },
    saveFilesUrl: `/api/problems/${encodeURIComponent(slug)}/phases/terraform/attempts/${encodeURIComponent(attemptFolder)}/save-files`,
    onSaved: () => renderTerraformAttemptPage(slug, attemptFolder),
  });

  appEl.innerHTML = `
    <div class="crumb">
      <a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(slug)}</a> /
      <a href="#/problems/${encodeURIComponent(slug)}/terraform">Terraform</a> / Attempt ${escapeHtml(
    a.attempt_number ?? attemptFolder
  )}
    </div>
    <div class="page-header-row">
      <h1>Terraform — Attempt ${escapeHtml(a.attempt_number ?? "?")}</h1>
      <div class="header-actions-group">
        ${feedbackPromptOrNote(feedbackOptions, !!a.terraform_feedback)}
        ${referencePicker.html}
      </div>
    </div>
    ${attemptNavHtml(slug, "terraform", phaseAttempts, attemptFolder)}
    <div class="verdict-row">
      <span class="verdict-item">${escapeHtml(a.date ?? "date unknown")}</span>
      <span class="verdict-item">Verdict ${verdictBadge(a.attempt_json?.verdict)}</span>
      ${
        a.attempt_json?.implements
          ? `<span class="verdict-item">Implements <a href="#/problems/${encodeURIComponent(
              slug
            )}/design/attempts/${encodeURIComponent(a.attempt_json.implements)}">design ${escapeHtml(
              a.attempt_json.implements
            )}</a></span>`
          : ""
      }
    </div>

    ${splitViewHeader("Compare")}
    <div class="split-view" id="split-view">
      <div class="pane">
        <div class="file-tabs-row">
          <div id="file-tabs-container" class="file-tabs-container">${fileTabsHtml()}</div>
          ${diffAvailable ? `<button type="button" class="pane-diff-toggle" id="terraform-diff-toggle">Show diff</button>` : ""}
        </div>
        <div class="pane-body" id="tf-code-body">${codeBodyHtml()}</div>
      </div>
      <div class="pane findings-pane">
        <div class="pane-header">
          <span class="pane-header-label">Findings for this file</span>
          <button type="button" class="pane-toggle-btn" id="findings-toggle" title="Collapse findings panel">⟩</button>
        </div>
        <div class="pane-body" id="findings-container">${findingsBodyHtml()}</div>
      </div>
    </div>

    <div class="section">
      <h2>Full feedback</h2>
      ${collapsible(
        "terraform-feedback.md",
        a.terraform_feedback ? renderMarkdown(a.terraform_feedback) : `<p class="missing-note">terraform-feedback.md not found.</p>`,
        { accent: "terraform", open: true, filePath: `${slug}/phases/terraform/attempts/${attemptFolder}/terraform-feedback.md` }
      )}
    </div>
    ${
      a.terraform_reference
        ? referenceAnswerSectionHtml(
            `${tfAttemptRel}/terraform-reference.md`,
            `<div style="padding:20px">${renderMarkdown(a.terraform_reference)}</div>`
          )
        : ""
    }
  `;

  wirePromptPicker("feedback-prompt-picker", feedbackOptionsOrPlaceholder(feedbackOptions));
  wirePromptPicker("terraform-reference-picker", referencePicker.options);

  function rewireActiveFile() {
    wireAnnotatedCode(paneId);
    wireFindingsJump(document.getElementById("findings-container"), activeFileFindings().concat(noLoc), paneId);
  }

  function switchFile(name) {
    activeFile = name;
    document.getElementById("file-tabs-container").innerHTML = fileTabsHtml();
    document.getElementById("tf-code-body").innerHTML = codeBodyHtml();
    document.getElementById("findings-container").innerHTML = findingsBodyHtml();
    wireFileTabs();
    rewireActiveFile();
  }

  function wireFileTabs() {
    document.querySelectorAll(".file-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchFile(btn.dataset.file));
    });
  }

  wireFileTabs();
  rewireActiveFile();
  wireFindingsToggle();
  wireSplitViewMinimize();

  if (diffAvailable) {
    const diffBtn = document.getElementById("terraform-diff-toggle");
    diffBtn?.addEventListener("click", () => {
      showingDiff = !showingDiff;
      diffBtn.textContent = showingDiff ? "Show code" : "Show diff";
      diffBtn.classList.toggle("active", showingDiff);
      document.getElementById("tf-code-body").innerHTML = codeBodyHtml();
      rewireActiveFile();
    });
  }
}

// ---------- Structured test evidence (table + latency chart) ----------

function evidencePhaseTable(phases) {
  if (!phases || phases.length === 0) return "";
  const rows = phases
    .map((p) => {
      const passCell =
        p.pass === true
          ? `<span class="verdict verdict-pass">Pass</span>`
          : p.pass === false
          ? `<span class="verdict verdict-fail">Fail</span>`
          : `<span class="verdict verdict-not-run">Not run</span>`;
      return `<tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.expected ?? "—")}</td>
        <td>${escapeHtml(p.actual ?? "—")}</td>
        <td>${passCell}</td>
      </tr>`;
    })
    .join("");
  return `<div class="evidence-table-wrap"><table class="evidence-table">
    <thead><tr><th>Phase</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function latencyChart(phases) {
  const withLatency = (phases || []).filter(
    (p) => p.metrics && (p.metrics.p50_ms !== undefined || p.metrics.p99_ms !== undefined)
  );
  if (withLatency.length === 0) return "";

  const maxVal = Math.max(1, ...withLatency.flatMap((p) => [p.metrics.p50_ms ?? 0, p.metrics.p99_ms ?? 0]));
  const rowH = 46;
  const chartW = 560;
  const labelW = 190;
  const barAreaW = chartW - labelW - 60;
  const height = withLatency.length * rowH + 20;

  const bars = withLatency
    .map((p, i) => {
      const y = 10 + i * rowH;
      const p50 = p.metrics.p50_ms;
      const p99 = p.metrics.p99_ms;
      const p50w = p50 !== undefined ? Math.max(2, (p50 / maxVal) * barAreaW) : 0;
      const p99w = p99 !== undefined ? Math.max(2, (p99 / maxVal) * barAreaW) : 0;
      return `
        <text x="0" y="${y + 12}" class="chart-label">${escapeHtml(p.name)}</text>
        ${
          p50 !== undefined
            ? `<rect x="${labelW}" y="${y}" width="${p50w}" height="14" class="chart-bar chart-bar-p50" />
               <text x="${labelW + p50w + 6}" y="${y + 12}" class="chart-value">p50 ${p50}ms</text>`
            : ""
        }
        ${
          p99 !== undefined
            ? `<rect x="${labelW}" y="${y + 18}" width="${p99w}" height="14" class="chart-bar chart-bar-p99" />
               <text x="${labelW + p99w + 6}" y="${y + 30}" class="chart-value">p99 ${p99}ms</text>`
            : ""
        }
      `;
    })
    .join("");

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${chartW} ${height}" width="100%" class="latency-chart" role="img" aria-label="Latency by phase">
        ${bars}
      </svg>
      <div class="chart-legend">
        <span><span class="legend-swatch legend-p50"></span> p50</span>
        <span><span class="legend-swatch legend-p99"></span> p99</span>
      </div>
    </div>`;
}

// ---------- Test: Check & Verify — two top-level tabs over one underlying "test" phase ----------
//
// rules.md's own step 9/10 gate treats grading the test script (before any apply) as
// distinct from actually deploying and running it for real — Check and Verify make that a
// real top-level split instead of two options buried in one page's hover picker. Both still
// read/write the same phases/test/attempts/<n>/ folder; "Check" creates it and stops before
// any apply, "Verify" picks up an already-checked one and does the apply/run/destroy loop.

// Not scaffolded onto disk (unlike the Terraform skeleton at problem-issuance) — rules.md
// deliberately keeps test without a current/ folder, since writing the script is one atomic
// step that creates its attempt folder directly rather than iterating in place first. This is
// purely a fixed UI reference so the Check tab's Current pane never sits fully empty before the
// first real attempt — same content every time, any problem, clearly labeled as an example.
function testScriptBoilerplate() {
  return `"""
Example structure only — not this problem's real completion conditions. A real test script
(written by the Check prompt above) replaces every TODO with checks against THIS problem's
actual stated thresholds from problem.md, not generic placeholders like these.
"""
import requests

BASE_URL = "http://<load-balancer-endpoint>"  # TODO: the real deployed endpoint


def test_baseline_behavior():
    # TODO: exercise the normal path and assert the response the design doc claims.
    resp = requests.get(f"{BASE_URL}/some-endpoint", timeout=5)
    assert resp.status_code == 200


def test_completion_condition():
    # TODO: assert against the problem's actual stated completion condition (a specific
    # threshold/timing from problem.md), not a looser proxy like "the service responds".
    # e.g. "requests above 100/min from one client get rejected with 429":
    results = [requests.get(f"{BASE_URL}/some-endpoint", timeout=5) for _ in range(150)]
    rejected = [r for r in results if r.status_code == 429]
    assert len(rejected) > 0


def test_fails_safe():
    # TODO: a bounded-runtime check that fails cleanly rather than hanging if the system
    # doesn't behave as expected (e.g. an explicit timeout on every request above).
    pass


if __name__ == "__main__":
    test_baseline_behavior()
    test_completion_condition()
    test_fails_safe()
    print("All checks passed.")
`;
}

function checkScriptPromptText(slug, terraformFolder, designFolder) {
  return `You're inside this vault folder already. Write and grade the functional test script for testing the Terraform at "${slug}/phases/terraform/attempts/${terraformFolder}/terraform/", which implements the design doc at "${slug}/phases/design/attempts/${designFolder}/design-doc.md". Follow the process and grading standard in rules.md (project root) for step 9's test-script portion. Create a new attempt folder at "${slug}/phases/test/attempts/attempt-<n>-<today>/" (n = one more than the highest existing test attempt for this problem, or 1 if none exist) and write the test script plus test-script-feedback.md into it. Also write a partial attempt.json there (phase "test", "tests": "${terraformFolder}", "script_verdict" set to your grading, "functional_test_result": "not-run") so it's clear this attempt is checked but not yet run.

Stop there — do not apply, deploy, run, or destroy anything yet. I'll review the script and its grading, then hand you a separate prompt to continue with the real run.

If you have direct file access to this vault (Claude Code, Cowork), write these files there directly
and you're done. If this is a plain chat session with no file access, instead reply with each file as
its own fenced code block, using the exact filename as the block's language tag (the test script's
block should use its real filename, e.g. test-script.py), and nothing else outside the blocks:

\`\`\`test-script.py
<content>
\`\`\`

\`\`\`test-script-feedback.md
<content>
\`\`\`

\`\`\`attempt.json
<content>
\`\`\`

I'll paste your reply back into the vault viewer, which extracts and saves each block itself.`;
}

function runTestPromptText(slug, testFolder, terraformFolder) {
  return `You're inside this vault folder already. Continue test attempt "${slug}/phases/test/attempts/${testFolder}/" — its test script has already been written and graded (see test-script-feedback.md there); don't rewrite it unless you find it's actually broken, in which case say so first. Apply the Terraform at "${slug}/phases/terraform/attempts/${terraformFolder}/terraform/", working through any apply failures with me interactively until it succeeds. Once it's up, run the existing test script against the live system and capture the real result — output, logs, timings — into that attempt folder's test-evidence.md (plus test-evidence.json per its schema, when the run's numbers decompose into phases), and update its attempt.json with the real functional_test_result. Follow the process and grading standard in rules.md (project root) for step 10. Once everything looks good — or I say I'm done iterating — run terraform destroy and confirm it actually completed before we call this closed.`;
}

function testTabCrumb(slug, label, extra) {
  const segs = [
    { label: "Home", href: "#/" },
    { label: slug, href: `#/problems/${encodeURIComponent(slug)}` },
    { label, href: extra ? `#/problems/${encodeURIComponent(slug)}/${label === "Check" ? "test-check" : "test-verify"}` : undefined },
  ];
  if (extra) segs.push({ label: extra });
  return segs;
}

// ---------- Check (write & grade the script, before any deploy) ----------

async function renderTestCheckPage(slug, initialSubTab = "current") {
  showLoading();
  setContext(testTabCrumb(slug, "Check"), "test-check");
  let data;
  try {
    data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
  } catch (err) {
    return showError(err);
  }
  const terraformAttempts = data.phases.terraform.attempts;
  const testAttempts = data.phases.test.attempts;
  // Always test the most recent Terraform attempt — no reason to make you pick an older one.
  const mostRecentTf = terraformAttempts.length ? terraformAttempts[terraformAttempts.length - 1] : null;
  const mostRecentTest = testAttempts.length ? testAttempts[testAttempts.length - 1] : null;

  let mostRecentTestScript = null;
  if (mostRecentTest) {
    try {
      const full = await fetchJson(
        `/api/problems/${encodeURIComponent(slug)}/phases/test/attempts/${encodeURIComponent(mostRecentTest.folder)}`
      );
      mostRecentTestScript = full.test_script;
    } catch {
      /* current tab just won't show a script preview */
    }
  }

  const actionOptions = [
    {
      description: mostRecentTf
        ? "Writes and grades a functional test script for the most recent Terraform attempt — creates the attempt folder but stops before deploying anything."
        : "No graded Terraform attempt yet — grade Terraform first.",
      extraFieldHtml: mostRecentTf
        ? `<p class="status-line">Testing <a href="#/problems/${encodeURIComponent(slug)}/terraform/attempts/${encodeURIComponent(
            mostRecentTf.folder
          )}">Terraform attempt ${escapeHtml(mostRecentTf.attempt_number)}</a> (${escapeHtml(mostRecentTf.date)}) — ${escapeHtml(
            VERDICT_LABEL[mostRecentTf.verdict] || mostRecentTf.verdict || "ungraded"
          )}.</p>`
        : "",
      kind: "dynamic",
      copyLabel: "Copy check-script prompt",
      missingText: mostRecentTf
        ? mostRecentTf.implements
          ? "Nothing to copy yet."
          : "This Terraform attempt has no recorded design attempt to reference."
        : "Nothing to copy yet.",
      getResult: () => {
        if (!mostRecentTf || !mostRecentTf.implements) return null;
        return checkScriptPromptText(slug, mostRecentTf.folder, mostRecentTf.implements);
      },
      // Check has no pre-existing attempt folder to save into (unlike design/terraform) — this
      // endpoint creates one itself from whatever files got parsed out of the pasted reply.
      pasteBack: () => async (files) => {
        const { folder } = await postJson(`/api/problems/${encodeURIComponent(slug)}/phases/test/save-check`, { files });
        renderTestCheckPage(slug, "submissions");
        return `Created <strong>${escapeHtml(folder)}</strong>. Refreshing the Submissions tab below…`;
      },
      // Headless mode creates its own attempt folder directly (same as an interactive Claude
      // Code session would) — we don't get its name back, so just refresh into Submissions
      // rather than trying to link the exact new attempt.
      onHeadlessDone: () => {
        renderTestCheckPage(slug, "submissions");
        return "Refreshing the Submissions tab below…";
      },
    },
  ];

  const currentHtml = `
    <p class="status-line">Writes and grades the test script only (rules.md step 9) — no deploy yet. Once
    you're happy with the grading, head to the <a href="#/problems/${encodeURIComponent(slug)}/test-verify">Verify tab</a> to run it for real.
    ${
      mostRecentTest
        ? `The "Open in VS Code" button below opens that attempt's own folder directly there — handy if
    you want more than one test-script variant or supporting file alongside it, not just the single script.`
        : ""
    }</p>
    ${
      mostRecentTestScript
        ? `<div class="pane">
             <div class="pane-header">
               <span class="pane-header-label">${escapeHtml(mostRecentTestScript.name)} — most recent, Attempt ${escapeHtml(
            mostRecentTest.attempt_number
          )}</span>
               <span class="pane-header-actions">
                 ${openFolderLinkHtml(`${slug}/phases/test/attempts/${mostRecentTest.folder}`)}
                 ${obsidianIconLink(`${slug}/phases/test/attempts/${mostRecentTest.folder}/${mostRecentTestScript.name}`)}
               </span>
             </div>
             <div class="pane-body">${renderAnnotatedCode(mostRecentTestScript.content, "test-check-current-pane", [])}</div>
           </div>`
        : `<div class="pane">
             <div class="pane-header">
               <span class="pane-header-label">Example structure — not a real file, just shape/reference</span>
             </div>
             <div class="pane-body">${renderAnnotatedCode(testScriptBoilerplate(), "test-check-current-pane", [])}</div>
           </div>
           <p class="status-line">No test script written yet for this problem — the pane above is a fixed
           reference example (same one every time), not something scaffolded onto disk. Copy the prompt above
           and grade it to write a real one, tailored to this problem's actual completion conditions.</p>`
    }
  `;
  const submissionsHtml = attemptHistoryList(slug, "test", testAttempts, "test-check");

  appEl.innerHTML = `
    <div class="crumb"><a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(
    slug
  )}</a> / Check</div>
    ${problemTabsHtml(slug, "test-check")}
    <div class="page-header-row">
      <h1>Check — ${escapeHtml(slug)}</h1>
      ${promptPickerHtml("test-check-actions-picker", "Copy prompt to write & grade a test script", actionOptions, {
        muted: !mostRecentTf || !mostRecentTf.implements,
        tag: "code",
      })}
    </div>
    ${phaseSubTabsHtml("test-check", initialSubTab)}
  `;

  wirePromptPicker("test-check-actions-picker", actionOptions);
  wirePhaseSubTabs(
    "test-check",
    {
      current: { html: currentHtml, onShow: () => mostRecentTestScript && wireAnnotatedCode("test-check-current-pane") },
      submissions: { html: submissionsHtml },
    },
    initialSubTab
  );
}

async function renderTestCheckAttemptPage(slug, attemptFolder) {
  showLoading();
  let a, phaseAttempts;
  try {
    [a, phaseAttempts] = await Promise.all([
      fetchJson(`/api/problems/${encodeURIComponent(slug)}/phases/test/attempts/${encodeURIComponent(attemptFolder)}`),
      fetchPhaseAttempts(slug, "test"),
    ]);
  } catch (err) {
    return showError(err);
  }
  setContext(testTabCrumb(slug, "Check", `Attempt ${a.attempt_number ?? attemptFolder}`), "test-check");

  const paneId = "test-check-artifact";
  const indexedAll = indexFindings(a.attempt_json?.script_findings);
  const testFileLabel = a.test_script ? a.test_script.name : null;
  const fileFindings = testFileLabel ? findingsForFile(indexedAll, (f) => f === testFileLabel) : [];
  const noLoc = findingsWithoutLocation(indexedAll);
  const hasStructured = a.attempt_json != null;

  const leftBody = a.test_script
    ? renderAnnotatedCode(a.test_script.content, paneId, fileFindings)
    : `<p class="missing-note" style="padding:16px">No test script found in this attempt.</p>`;

  const findingsBodyHtml = hasStructured
    ? `${
        noLoc.length ? `<div class="findings-general"><h4>General</h4>${renderFindingsListHtml(noLoc)}</div>` : ""
      }${renderFindingsListHtml(fileFindings, { emptyMessage: "No findings for this file." })}`
    : `<p class="missing-note">No attempt.json — findings aren't in structured form. See the raw feedback below.</p>`;

  const scriptRel = `${slug}/phases/test/attempts/${attemptFolder}/${a.test_script?.name ?? "test-script.*"}`;
  const feedbackOptions =
    a.test_script_feedback
      ? [
          {
            label: "Ask about this feedback",
            description: "Discuss the test script's own grading without getting the fix handed to you outright.",
            prompt: askAboutPrompt({
              artifactLabel: "test script",
              feedbackRel: `${slug}/phases/test/attempts/${attemptFolder}/test-script-feedback.md`,
              feedbackContent: a.test_script_feedback,
              artifactRel: scriptRel,
              artifactContent: a.test_script?.content,
            }),
          },
        ]
      : [];

  const testAttemptRel = `${slug}/phases/test/attempts/${attemptFolder}`;
  const scriptExt = a.test_script?.name?.split(".").pop();
  const referencePicker = referenceAnswerPickerHtml("test-reference-picker", {
    promptArgs: {
      artifactLabel: "test script",
      attemptRel: testAttemptRel,
      problemRel: `${slug}/problem.md`,
      extraReads: a.attempt_json?.tests ? [`${slug}/phases/terraform/attempts/${a.attempt_json.tests}/terraform/`] : [],
      extraContext: `Write it in the same language as the real script (${
        scriptExt ? `a .${scriptExt} file` : "TypeScript or Python"
      }) — name the output file test-script-reference.${scriptExt || "py"} accordingly (adjust the extension below to match), asserting against problem.md's actual stated completion conditions, not a looser proxy.`,
      outputFile: `test-script-reference.${scriptExt || "py"}`,
    },
    saveFilesUrl: `/api/problems/${encodeURIComponent(slug)}/phases/test/attempts/${encodeURIComponent(attemptFolder)}/save-files`,
    onSaved: () => renderTestCheckAttemptPage(slug, attemptFolder),
  });

  appEl.innerHTML = `
    <div class="crumb">
      <a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(slug)}</a> /
      <a href="#/problems/${encodeURIComponent(slug)}/test-check">Check</a> / Attempt ${escapeHtml(
    a.attempt_number ?? attemptFolder
  )}
    </div>
    <div class="page-header-row">
      <h1>Check — Attempt ${escapeHtml(a.attempt_number ?? "?")}</h1>
      <div class="header-actions-group">
        ${feedbackPromptOrNote(feedbackOptions, !!a.test_script_feedback)}
        ${referencePicker.html}
      </div>
    </div>
    ${attemptNavHtml(slug, "test", phaseAttempts, attemptFolder, "test-check")}
    <div class="verdict-row">
      <span class="verdict-item">${escapeHtml(a.date ?? "date unknown")}</span>
      <span class="verdict-item">Script ${verdictBadge(a.attempt_json?.script_verdict)}</span>
      ${
        a.attempt_json?.tests
          ? `<span class="verdict-item">Tests <a href="#/problems/${encodeURIComponent(
              slug
            )}/terraform/attempts/${encodeURIComponent(a.attempt_json.tests)}">terraform ${escapeHtml(
              a.attempt_json.tests
            )}</a></span>`
          : ""
      }
    </div>
    ${
      a.test_evidence
        ? `<p class="status-line">This attempt has already been run for real — see the <a href="#/problems/${encodeURIComponent(
            slug
          )}/test-verify/attempts/${encodeURIComponent(attemptFolder)}">Verify tab</a> for the evidence.</p>`
        : ""
    }

    ${splitViewHeader("Compare")}
    <div class="split-view" id="split-view">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-header-label">${a.test_script ? escapeHtml(a.test_script.name) : "test script"}</span>
          ${
            a.test_script
              ? obsidianIconLink(`${slug}/phases/test/attempts/${attemptFolder}/${a.test_script.name}`)
              : ""
          }
        </div>
        <div class="pane-body">${leftBody}</div>
      </div>
      <div class="pane findings-pane">
        <div class="pane-header">
          <span class="pane-header-label">Findings — click a marker or item</span>
          <button type="button" class="pane-toggle-btn" id="findings-toggle" title="Collapse findings panel">⟩</button>
        </div>
        <div class="pane-body" id="findings-container">${findingsBodyHtml}</div>
      </div>
    </div>

    <div class="section">
      <h2>Full feedback</h2>
      ${collapsible(
        "test-script-feedback.md",
        a.test_script_feedback
          ? renderMarkdown(a.test_script_feedback)
          : `<p class="missing-note">test-script-feedback.md not found.</p>`,
        { accent: "test", open: true, filePath: `${slug}/phases/test/attempts/${attemptFolder}/test-script-feedback.md` }
      )}
    </div>
    ${
      a.test_script_reference
        ? referenceAnswerSectionHtml(
            `${testAttemptRel}/${a.test_script_reference.name}`,
            renderAnnotatedCode(a.test_script_reference.content, "test-reference-pane", [])
          )
        : ""
    }
  `;

  wireAnnotatedCode(paneId);
  wireFindingsJump(document.getElementById("findings-container"), fileFindings.concat(noLoc), paneId);
  wireFindingsToggle();
  wireSplitViewMinimize();
  wirePromptPicker("feedback-prompt-picker", feedbackOptionsOrPlaceholder(feedbackOptions));
  wirePromptPicker("test-reference-picker", referencePicker.options);
  if (a.test_script_reference) wireAnnotatedCode("test-reference-pane");
}

// ---------- Verify (deploy, run against real infra, capture evidence) ----------

async function renderTestVerifyPage(slug) {
  showLoading();
  setContext(testTabCrumb(slug, "Verify"), "test-verify");

  let activeFile = null;

  async function draw() {
    let data;
    try {
      data = await fetchJson(`/api/problems/${encodeURIComponent(slug)}`);
    } catch (err) {
      return showError(err);
    }
    const testAttempts = data.phases.test.attempts;
    const checkedAttempts = testAttempts.filter((t) => t.script_verdict);
    const checkedNotRun = checkedAttempts.filter(
      (t) => !t.functional_test_result || t.functional_test_result === "not-run"
    );
    // Always run the most recent checked-but-unrun script — no reason to make you pick an older one.
    const mostRecentRunnable = checkedNotRun.length ? checkedNotRun[checkedNotRun.length - 1] : null;
    const mostRecentChecked = checkedAttempts.length ? checkedAttempts[checkedAttempts.length - 1] : null;
    // Distinguishes *why* there's nothing to run: no script has been checked yet vs. every
    // checked script has already been run for real (gray for a different reason than "not ready").
    const alreadyVerified = !mostRecentRunnable && !!mostRecentChecked;

    const actionOptions = [
      {
        description: mostRecentRunnable
          ? "Deploys the Terraform and runs the most recent checked-but-unrun test script for real — the prompt hands the apply/run/destroy loop to Claude Code."
          : alreadyVerified
          ? "Every checked script has already been run for real — nothing new to verify. Check a new Terraform attempt on the Check tab to get another one to run."
          : "No checked-but-unrun test attempt yet — check a script first.",
        extraFieldHtml: mostRecentRunnable
          ? `<p class="status-line">Running <a href="#/problems/${encodeURIComponent(
              slug
            )}/test-check/attempts/${encodeURIComponent(mostRecentRunnable.folder)}">Check attempt ${escapeHtml(
              mostRecentRunnable.attempt_number
            )}</a> (${escapeHtml(mostRecentRunnable.date)}) — script ${escapeHtml(
              VERDICT_LABEL[mostRecentRunnable.script_verdict] || mostRecentRunnable.script_verdict
            )}.</p>`
          : alreadyVerified
          ? `<p class="status-line">Most recent: <a href="#/problems/${encodeURIComponent(
              slug
            )}/test-verify/attempts/${encodeURIComponent(mostRecentChecked.folder)}">Check attempt ${escapeHtml(
              mostRecentChecked.attempt_number
            )}</a> (${escapeHtml(mostRecentChecked.date)}) — already run, functional ${escapeHtml(
              VERDICT_LABEL[mostRecentChecked.functional_test_result] || mostRecentChecked.functional_test_result
            )}.</p>`
          : "",
        kind: "dynamic",
        copyLabel: "Copy run prompt",
        missingText: mostRecentRunnable
          ? mostRecentRunnable.tests
            ? "Nothing to copy yet."
            : "This checked attempt has no recorded Terraform attempt to deploy."
          : alreadyVerified
          ? "Already verified — nothing new to run."
          : "Nothing to copy yet.",
        getResult: () => {
          if (!mostRecentRunnable || !mostRecentRunnable.tests) return null;
          return runTestPromptText(slug, mostRecentRunnable.folder, mostRecentRunnable.tests);
        },
      },
    ];

    // Verify deploys and tests whatever is currently in phases/terraform/current/ — that's the
    // thing actually being exercised here, so show it directly rather than a plain description.
    const files = data.phases.terraform.current.files;
    if (!activeFile || !files.some((f) => f.path === activeFile)) activeFile = files[0]?.path;

    function codeBodyHtml() {
      if (!files.length)
        return `<p class="missing-note" style="padding:16px">No .tf/.tfvars files in phases/terraform/current/ yet.</p>`;
      const f = files.find((f) => f.path === activeFile);
      return renderAnnotatedCode(f ? f.content : "", "verify-current-pane", []);
    }
    function fileTabsHtml() {
      if (!files.length) return "";
      return `<div class="file-tabs">${files
        .map(
          (f) =>
            `<button type="button" class="file-tab${f.path === activeFile ? " active" : ""}" data-file="${escapeHtml(
              f.path
            )}">${escapeHtml(f.path)}</button>`
        )
        .join("")}</div>`;
    }

    const currentHtml = `
      <p class="status-line">Deploys the Terraform, runs an already-checked test script for real, and captures
      evidence (rules.md step 10). Use the <a href="#/problems/${encodeURIComponent(slug)}/test-check">Check tab</a>
      first if you haven't graded a script yet.</p>
      <div class="pane">
        <div class="file-tabs-row">
          <div id="verify-file-tabs-container" class="file-tabs-container">${fileTabsHtml()}</div>
          <div class="file-tabs-row-actions">
            ${openFolderLinkHtml(`${slug}/phases/terraform/current`)}
            ${reloadButtonHtml("verify-current-reload")}
          </div>
        </div>
        <div class="pane-body" id="verify-tf-code-body">${codeBodyHtml()}</div>
      </div>
    `;
    const submissionsHtml = attemptHistoryList(slug, "test", testAttempts, "test-verify");

    appEl.innerHTML = `
      <div class="crumb"><a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(
      slug
    )}</a> / Verify</div>
      ${problemTabsHtml(slug, "test-verify")}
      <div class="page-header-row">
        <h1>Verify — ${escapeHtml(slug)}</h1>
        ${promptPickerHtml("test-verify-actions-picker", "Copy prompt to deploy & run the test", actionOptions, {
          muted: !mostRecentRunnable,
          tag: "code",
        })}
      </div>
      ${phaseSubTabsHtml("test-verify", "current")}
    `;

    function wireFileTabs() {
      document.querySelectorAll("#verify-file-tabs-container .file-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeFile = btn.dataset.file;
          document.getElementById("verify-file-tabs-container").innerHTML = fileTabsHtml();
          document.getElementById("verify-tf-code-body").innerHTML = codeBodyHtml();
          wireFileTabs();
        });
      });
    }

    wirePromptPicker("test-verify-actions-picker", actionOptions);
    wirePhaseSubTabs(
      "test-verify",
      {
        current: {
          html: currentHtml,
          onShow: () => {
            wireFileTabs();
            wireReloadButton("verify-current-reload", draw);
          },
        },
        submissions: { html: submissionsHtml },
      },
      "current"
    );
  }

  await draw();
}

async function renderTestVerifyAttemptPage(slug, attemptFolder) {
  showLoading();
  let a, phaseAttempts;
  try {
    [a, phaseAttempts] = await Promise.all([
      fetchJson(`/api/problems/${encodeURIComponent(slug)}/phases/test/attempts/${encodeURIComponent(attemptFolder)}`),
      fetchPhaseAttempts(slug, "test"),
    ]);
  } catch (err) {
    return showError(err);
  }
  setContext(testTabCrumb(slug, "Verify", `Attempt ${a.attempt_number ?? attemptFolder}`), "test-verify");

  const scriptRel = `${slug}/phases/test/attempts/${attemptFolder}/${a.test_script?.name ?? "test-script.*"}`;
  const feedbackOptions =
    a.test_evidence
      ? [
          {
            label: "Ask about this feedback",
            description: "Discuss what actually happened in the real run, without getting the conclusion handed to you outright.",
            prompt: askAboutPrompt({
              artifactLabel: "test script that produced this evidence",
              feedbackRel: `${slug}/phases/test/attempts/${attemptFolder}/test-evidence.md`,
              feedbackContent: a.test_evidence,
              artifactRel: scriptRel,
              artifactContent: a.test_script?.content,
            }),
          },
        ]
      : [];

  appEl.innerHTML = `
    <div class="crumb">
      <a href="#/">Home</a> / <a href="#/problems/${encodeURIComponent(slug)}">${escapeHtml(slug)}</a> /
      <a href="#/problems/${encodeURIComponent(slug)}/test-verify">Verify</a> / Attempt ${escapeHtml(
    a.attempt_number ?? attemptFolder
  )}
    </div>
    <div class="page-header-row">
      <h1>Verify — Attempt ${escapeHtml(a.attempt_number ?? "?")}</h1>
      ${feedbackPromptOrNote(feedbackOptions, !!a.test_evidence)}
    </div>
    ${attemptNavHtml(slug, "test", phaseAttempts, attemptFolder, "test-verify")}
    <div class="verdict-row">
      <span class="verdict-item">${escapeHtml(a.date ?? "date unknown")}</span>
      <span class="verdict-item">Functional test ${verdictBadge(a.attempt_json?.functional_test_result)}</span>
      ${
        a.attempt_json?.tests
          ? `<span class="verdict-item">Tests <a href="#/problems/${encodeURIComponent(
              slug
            )}/terraform/attempts/${encodeURIComponent(a.attempt_json.tests)}">terraform ${escapeHtml(
              a.attempt_json.tests
            )}</a></span>`
          : ""
      }
    </div>
    ${
      !a.test_evidence
        ? `<p class="missing-note">Not run yet — copy the run prompt above (its script is already graded on the
           <a href="#/problems/${encodeURIComponent(
             slug
           )}/test-check/attempts/${encodeURIComponent(attemptFolder)}">Check tab</a>) to deploy and run it for real.</p>`
        : ""
    }

    ${
      a.test_evidence_json
        ? `<div class="section">
             <h2>Results by phase</h2>
             <p class="status-line">From <code>test-evidence.json</code> — run ${escapeHtml(
               a.test_evidence_json.run_date ?? "date unknown"
             )}${a.test_evidence_json.region ? `, ${escapeHtml(a.test_evidence_json.region)}` : ""}.</p>
             ${evidencePhaseTable(a.test_evidence_json.phases)}
             ${latencyChart(a.test_evidence_json.phases)}
           </div>`
        : ""
    }

    <div class="section">
      <h2>Evidence from the real run</h2>
      ${collapsible(
        "test-evidence.md",
        a.test_evidence
          ? renderMarkdown(a.test_evidence)
          : `<p class="missing-note">test-evidence.md not found — no real run has been captured yet.</p>`,
        { accent: "test", open: true, filePath: `${slug}/phases/test/attempts/${attemptFolder}/test-evidence.md` }
      )}
    </div>

    ${
      a.test_script
        ? `<div class="section">
             <h2>Test script (for reference — see the Check tab for its own grading)</h2>
             <div class="pane">
               <div class="pane-header">
                 <span class="pane-header-label">${escapeHtml(a.test_script.name)}</span>
                 ${obsidianIconLink(`${slug}/phases/test/attempts/${attemptFolder}/${a.test_script.name}`)}
               </div>
               <div class="pane-body">${renderAnnotatedCode(a.test_script.content, "test-verify-script-ref", [])}</div>
             </div>
           </div>`
        : ""
    }
  `;

  wirePromptPicker("feedback-prompt-picker", feedbackOptionsOrPlaceholder(feedbackOptions));
}
