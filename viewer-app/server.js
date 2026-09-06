// Local viewer + grading server for the System Design + Terraform Practice vault.
// Reads directly from disk on every request — no database, no sync step.
//
// Each problem has three independently-attempted phases (design / terraform / test), per
// rules.md: phases/<phase>/current/ is the live work-in-progress, and grading snapshots it
// into a new, immutable phases/<phase>/attempts/attempt-<n>-<date>/ folder. Grading is what
// creates an attempt.

const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Resolved once at startup rather than trusting PATH at spawn time — this server's own process
// can end up with a plainer environment than an interactive shell (started from the desktop
// app, a .cmd double-click, etc.), which may not include wherever npm put its global shims even
// though `claude` works fine in a real terminal. APPDATA is set by Windows for every process
// regardless of how it was launched, so checking npm's default global-bin location under it
// sidesteps PATH entirely. Falls back to the bare command (relies on PATH after all) everywhere
// else, or if this specific layout isn't found.
function resolveClaudeCommand() {
  if (process.platform === "win32" && process.env.APPDATA) {
    const candidate = path.join(process.env.APPDATA, "npm", "claude.cmd");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "claude";
}
const CLAUDE_COMMAND = resolveClaudeCommand();

// Same PATH-resolution problem as CLAUDE_COMMAND above, same fix: check VS Code's actual
// default install locations directly rather than trusting this process's own PATH. The default
// installer puts the CLI under the user's LOCALAPPDATA (most common on Windows, no admin
// needed); a system-wide install instead lands under Program Files.
function resolveVSCodeCommand() {
  if (process.platform === "win32") {
    const candidates = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Microsoft VS Code", "bin", "code.cmd"),
      process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Microsoft VS Code", "bin", "code.cmd"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "code";
}
const VSCODE_COMMAND = resolveVSCodeCommand();

const app = express();
app.use(express.json({ limit: "2mb" }));
const PORT = process.env.PORT || 4173;

// This app lives in <vault>/viewer-app/, so the vault root is one level up.
const VAULT_ROOT = path.resolve(__dirname, "..");
const EXCLUDED_DIRS = new Set(["viewer-app", "node_modules", ".git", ".obsidian"]);
const PHASES = ["design", "terraform", "test"];

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function readJsonSafe(p) {
  const raw = readFileSafe(p);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { _parse_error: String(err.message || err), _raw: raw };
  }
}

function listDirs(dirPath) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function discoverProblemSlugs() {
  return listDirs(VAULT_ROOT)
    .filter((name) => !EXCLUDED_DIRS.has(name) && !name.startsWith("."))
    .filter((name) => fs.existsSync(path.join(VAULT_ROOT, name, "problem.md")));
}

// Walks terraformDir recursively (module subfolders included), not just its top level — a
// real Terraform layout commonly has a modules/ subdirectory, and there's no reason to hide
// those files from the viewer or leave them out of what gets graded/snapshotted. `path` is
// relative to terraformDir and becomes both the display label and the location Obsidian links
// / grading findings point at, in place of the old flat `name`.
const TERRAFORM_JUNK_DIRS = new Set([".terraform", ".git", "node_modules"]);
const TERRAFORM_FILE_RE = /\.(tf|tfvars)$/;

function loadTerraformFiles(terraformDir, relDir = "", depth = 0) {
  if (depth > 6) return [];
  const dirPath = path.join(terraformDir, relDir);
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (TERRAFORM_JUNK_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      files.push(...loadTerraformFiles(terraformDir, relPath, depth + 1));
    } else if (entry.isFile() && TERRAFORM_FILE_RE.test(entry.name)) {
      files.push({ path: relPath, content: readFileSafe(path.join(terraformDir, relPath)) || "" });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function findTestScript(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const scriptFile = entries.find(
    (d) => d.isFile() && d.name.startsWith("test-script.") && !d.name.endsWith("-feedback.md") && !d.name.includes("-reference.")
  );
  if (!scriptFile) return null;
  return { name: scriptFile.name, content: readFileSafe(path.join(dir, scriptFile.name)) || "" };
}

// The reference-answer counterpart to findTestScript above — same "test-script.<ext>" naming
// but with "-reference" in it (test-script-reference.py, .ts, ...), since the extension mirrors
// whatever language the real script used and isn't fixed ahead of time.
function findReferenceScript(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const scriptFile = entries.find((d) => d.isFile() && d.name.startsWith("test-script-reference."));
  if (!scriptFile) return null;
  return { name: scriptFile.name, content: readFileSafe(path.join(dir, scriptFile.name)) || "" };
}

function attemptNumberDateFromFolder(folder) {
  const m = folder.match(/^attempt-(\d+)-(\d{4}-\d{2}-\d{2})$/);
  return { attempt_number: m ? Number(m[1]) : null, date: m ? m[2] : null };
}

function phaseAttemptFolders(slug, phase) {
  return listDirs(path.join(VAULT_ROOT, slug, "phases", phase, "attempts")).sort();
}

// given-app's comprehension write-up is graded the same attempt-history way as design/terraform,
// but lives under given-app/attempts/ rather than phases/<phase>/attempts/, since it isn't one of
// the three phases every problem has (only problems with a given-app have it at all).
function givenAppAttemptFolders(slug) {
  return listDirs(path.join(VAULT_ROOT, slug, "given-app", "attempts")).sort();
}

function nextAttemptFolderIn(folders) {
  let maxN = 0;
  for (const name of folders) {
    const m = name.match(/^attempt-(\d+)-/);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  const n = maxN + 1;
  const date = new Date().toISOString().slice(0, 10);
  return { n, date, folder: `attempt-${n}-${date}` };
}

function nextAttemptFolder(slug, phase) {
  return nextAttemptFolderIn(phaseAttemptFolders(slug, phase));
}

function nextGivenAppAttemptFolder(slug) {
  return nextAttemptFolderIn(givenAppAttemptFolders(slug));
}

// ---------- Per-phase attempt loaders (full detail) ----------

function loadDesignAttempt(slug, folder) {
  const dir = path.join(VAULT_ROOT, slug, "phases/design/attempts", folder);
  const attemptJson = readJsonSafe(path.join(dir, "attempt.json"));
  const fallback = attemptNumberDateFromFolder(folder);
  return {
    phase: "design",
    folder,
    attempt_number: attemptJson?.attempt_number ?? fallback.attempt_number,
    date: attemptJson?.date ?? fallback.date,
    design_doc: readFileSafe(path.join(dir, "design-doc.md")),
    design_feedback: readFileSafe(path.join(dir, "design-feedback.md")),
    // Optional, on-demand — a from-scratch fully-correct answer (not feedback on this
    // attempt), written into this same attempt folder if the user asks for one.
    design_reference: readFileSafe(path.join(dir, "design-reference.md")),
    attempt_json: attemptJson,
  };
}

function loadGivenAppAttempt(slug, folder) {
  const dir = path.join(VAULT_ROOT, slug, "given-app/attempts", folder);
  const attemptJson = readJsonSafe(path.join(dir, "attempt.json"));
  const fallback = attemptNumberDateFromFolder(folder);
  return {
    phase: "given-app",
    folder,
    attempt_number: attemptJson?.attempt_number ?? fallback.attempt_number,
    date: attemptJson?.date ?? fallback.date,
    description: readFileSafe(path.join(dir, "description.md")),
    description_feedback: readFileSafe(path.join(dir, "description-feedback.md")),
    description_reference: readFileSafe(path.join(dir, "description-reference.md")),
    attempt_json: attemptJson,
  };
}

function loadTerraformAttempt(slug, folder) {
  const dir = path.join(VAULT_ROOT, slug, "phases/terraform/attempts", folder);
  const attemptJson = readJsonSafe(path.join(dir, "attempt.json"));
  const fallback = attemptNumberDateFromFolder(folder);
  return {
    phase: "terraform",
    folder,
    attempt_number: attemptJson?.attempt_number ?? fallback.attempt_number,
    date: attemptJson?.date ?? fallback.date,
    terraform_files: loadTerraformFiles(path.join(dir, "terraform")),
    terraform_feedback: readFileSafe(path.join(dir, "terraform-feedback.md")),
    terraform_reference: readFileSafe(path.join(dir, "terraform-reference.md")),
    attempt_json: attemptJson,
  };
}

function loadTestAttempt(slug, folder) {
  const dir = path.join(VAULT_ROOT, slug, "phases/test/attempts", folder);
  const attemptJson = readJsonSafe(path.join(dir, "attempt.json"));
  const fallback = attemptNumberDateFromFolder(folder);
  return {
    phase: "test",
    folder,
    attempt_number: attemptJson?.attempt_number ?? fallback.attempt_number,
    date: attemptJson?.date ?? fallback.date,
    test_script: findTestScript(dir),
    test_script_feedback: readFileSafe(path.join(dir, "test-script-feedback.md")),
    test_script_reference: findReferenceScript(dir),
    test_evidence: readFileSafe(path.join(dir, "test-evidence.md")),
    test_evidence_json: readJsonSafe(path.join(dir, "test-evidence.json")),
    attempt_json: attemptJson,
  };
}

// ---------- Light summaries (for lists) ----------

function designAttemptSummary(slug, folder) {
  const a = loadDesignAttempt(slug, folder);
  return { folder: a.folder, attempt_number: a.attempt_number, date: a.date, verdict: a.attempt_json?.verdict ?? null };
}
function givenAppAttemptSummary(slug, folder) {
  const a = loadGivenAppAttempt(slug, folder);
  return { folder: a.folder, attempt_number: a.attempt_number, date: a.date, verdict: a.attempt_json?.verdict ?? null };
}
function terraformAttemptSummary(slug, folder) {
  const a = loadTerraformAttempt(slug, folder);
  return {
    folder: a.folder,
    attempt_number: a.attempt_number,
    date: a.date,
    verdict: a.attempt_json?.verdict ?? null,
    implements: a.attempt_json?.implements ?? null,
  };
}
function testAttemptSummary(slug, folder) {
  const a = loadTestAttempt(slug, folder);
  return {
    folder: a.folder,
    attempt_number: a.attempt_number,
    date: a.date,
    script_verdict: a.attempt_json?.script_verdict ?? null,
    functional_test_result: a.attempt_json?.functional_test_result ?? null,
    tests: a.attempt_json?.tests ?? null,
  };
}

function designCurrentPath(slug) {
  return path.join(VAULT_ROOT, slug, "phases/design/current/design-doc.md");
}

// The draft is edited externally (e.g. in Obsidian), not through this app, so make sure the
// file actually exists before handing back a link to it — an obsidian:// link to a
// non-existent note just opens an empty "create new file?" prompt instead of the real draft.
function ensureDesignCurrentFile(slug) {
  const file = designCurrentPath(slug);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "", "utf8");
  }
}

function loadDesignCurrent(slug) {
  return readFileSafe(designCurrentPath(slug));
}

function givenAppCurrentPath(slug) {
  return path.join(VAULT_ROOT, slug, "given-app/current/description.md");
}

// Same reasoning as ensureDesignCurrentFile above — this draft is edited externally too.
function ensureGivenAppCurrentFile(slug) {
  const file = givenAppCurrentPath(slug);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "", "utf8");
  }
}

function loadGivenAppCurrent(slug) {
  return readFileSafe(givenAppCurrentPath(slug));
}

function loadTerraformCurrent(slug) {
  return loadTerraformFiles(path.join(VAULT_ROOT, slug, "phases/terraform/current"));
}

// Everything under given-app/ except the files already surfaced separately (the spec, the
// done-note, and the comprehension write-up's own current/attempts folders) — the actual
// generated application code, whatever files/folders it turned out to be, per rules.md's
// "Given application code" ("TypeScript or Python", "kept minimal").
const GIVEN_APP_JUNK_DIRS = new Set(["node_modules", ".git", "__pycache__", "dist", "build", ".venv", "current", "attempts"]);
const GIVEN_APP_SKIP_FILES = new Set(["given-app-spec.md", "generated.md", "description.md"]);

function loadGivenAppCodeFiles(givenAppDir, relDir = "", depth = 0) {
  if (depth > 4) return [];
  const dirPath = path.join(givenAppDir, relDir);
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (GIVEN_APP_JUNK_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      files.push(...loadGivenAppCodeFiles(givenAppDir, relPath, depth + 1));
    } else if (entry.isFile() && !GIVEN_APP_SKIP_FILES.has(entry.name)) {
      files.push({ path: relPath, content: readFileSafe(path.join(givenAppDir, relPath)) || "" });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------- Problem-level summary (home page) ----------

function loadProblemSummary(slug, progressJson) {
  const problemMd = readFileSafe(path.join(VAULT_ROOT, slug, "problem.md"));
  const tier = progressJson?.problems?.[slug]?.tier ?? null;
  const hasGivenApp = fs.existsSync(path.join(VAULT_ROOT, slug, "given-app"));

  const phases = {};
  for (const phase of PHASES) {
    const folders = phaseAttemptFolders(slug, phase);
    const latestFolder = folders[folders.length - 1] || null;
    let latest = null;
    if (latestFolder) {
      if (phase === "design") latest = designAttemptSummary(slug, latestFolder);
      else if (phase === "terraform") latest = terraformAttemptSummary(slug, latestFolder);
      else latest = testAttemptSummary(slug, latestFolder);
    }
    phases[phase] = { attempt_count: folders.length, latest };
  }

  return { slug, has_problem_md: problemMd !== null, tier, has_given_app: hasGivenApp, phases };
}

app.get("/api/data", (req, res) => {
  const progressJson = readJsonSafe(path.join(VAULT_ROOT, "progress.json"));
  const progressMd = readFileSafe(path.join(VAULT_ROOT, "progress.md"));
  const slugs = discoverProblemSlugs();
  const problems = slugs.map((slug) => loadProblemSummary(slug, progressJson));

  res.json({
    vault_root: VAULT_ROOT,
    progress_json: progressJson,
    progress_md: progressMd,
    problems,
  });
});

app.get("/api/problems/:slug", (req, res) => {
  const { slug } = req.params;
  if (!discoverProblemSlugs().includes(slug)) {
    return res.status(404).json({ error: "Unknown problem slug." });
  }
  const progressJson = readJsonSafe(path.join(VAULT_ROOT, "progress.json"));
  const problemMd = readFileSafe(path.join(VAULT_ROOT, slug, "problem.md"));
  const backgroundMd = readFileSafe(path.join(VAULT_ROOT, slug, "background.md"));

  ensureDesignCurrentFile(slug);

  const givenAppDir = path.join(VAULT_ROOT, slug, "given-app");
  const hasGivenAppDir = fs.existsSync(givenAppDir);
  if (hasGivenAppDir) ensureGivenAppCurrentFile(slug);
  const givenApp = hasGivenAppDir
    ? {
        spec: readFileSafe(path.join(givenAppDir, "given-app-spec.md")),
        generated_note: readFileSafe(path.join(givenAppDir, "generated.md")),
        code_files: loadGivenAppCodeFiles(givenAppDir),
        current: { description: loadGivenAppCurrent(slug) },
        attempts: givenAppAttemptFolders(slug).map((f) => givenAppAttemptSummary(slug, f)),
      }
    : null;

  res.json({
    slug,
    vault_root: VAULT_ROOT,
    problem_md: problemMd,
    background_md: backgroundMd,
    tier: progressJson?.problems?.[slug]?.tier ?? null,
    given_app: givenApp,
    phases: {
      design: {
        current: { design_doc: loadDesignCurrent(slug) },
        attempts: phaseAttemptFolders(slug, "design").map((f) => designAttemptSummary(slug, f)),
      },
      terraform: {
        current: { files: loadTerraformCurrent(slug) },
        attempts: phaseAttemptFolders(slug, "terraform").map((f) => terraformAttemptSummary(slug, f)),
      },
      test: {
        attempts: phaseAttemptFolders(slug, "test").map((f) => testAttemptSummary(slug, f)),
      },
    },
  });
});

app.get("/api/problems/:slug/phases/:phase/attempts/:attemptFolder", (req, res) => {
  const { slug, phase, attemptFolder } = req.params;
  if (!discoverProblemSlugs().includes(slug)) {
    return res.status(404).json({ error: "Unknown problem slug." });
  }
  if (!PHASES.includes(phase)) {
    return res.status(404).json({ error: "Unknown phase." });
  }
  if (!phaseAttemptFolders(slug, phase).includes(attemptFolder)) {
    return res.status(404).json({ error: "Unknown attempt folder." });
  }
  if (phase === "design") return res.json(loadDesignAttempt(slug, attemptFolder));
  if (phase === "terraform") return res.json(loadTerraformAttempt(slug, attemptFolder));
  return res.json(loadTestAttempt(slug, attemptFolder));
});

// Not part of the generic route above — given-app attempts live under given-app/attempts/, not
// phases/<phase>/attempts/, since (unlike design/terraform/test) not every problem has one.
app.get("/api/problems/:slug/given-app/attempts/:attemptFolder", (req, res) => {
  const { slug, attemptFolder } = req.params;
  if (!discoverProblemSlugs().includes(slug)) {
    return res.status(404).json({ error: "Unknown problem slug." });
  }
  if (!givenAppAttemptFolders(slug).includes(attemptFolder)) {
    return res.status(404).json({ error: "Unknown attempt folder." });
  }
  res.json(loadGivenAppAttempt(slug, attemptFolder));
});

function requireProblem(req, res) {
  const { slug } = req.params;
  if (!discoverProblemSlugs().includes(slug)) {
    res.status(404).json({ error: "Unknown problem slug." });
    return null;
  }
  return slug;
}

// Windows deliberately prevents a background process (this server has no "foreground rights" —
// nothing the user just clicked on, from Windows' point of view) from stealing focus via the
// normal SetForegroundWindow API — so `code -n` opens/reveals the folder, but the window itself
// can silently stay behind whatever's currently focused, with no visible sign anything
// happened. WScript.Shell's AppActivate (COM automation, historically used for exactly this
// kind of window-switching) isn't subject to that same restriction, so this is a best-effort
// follow-up: wait for the window to actually exist, then activate by title match. Fire-and-
// forget — if this fails, the folder still opened, it just may not visibly pop to front.
const POWERSHELL_PATH = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
function tryFocusVSCodeWindow() {
  if (process.platform !== "win32") return;
  const script =
    "Start-Sleep -Milliseconds 900; (New-Object -ComObject WScript.Shell).AppActivate('Visual Studio Code') | Out-Null";
  try {
    spawn(POWERSHELL_PATH, ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch {
    /* best-effort only */
  }
}

// Terraform (and now Check's per-attempt folder) is normally a whole-folder edit, not one file
// at a time — a plain `file://` link for that doesn't actually work: modern browsers block
// top-level navigation from an http(s) page to a file:// URL as a security measure, so it just
// silently does nothing. Since this is a local-only dev tool that already spawns local
// processes (the headless Claude runs), opening the folder directly in VS Code server-side is
// the reliable path instead. relPath is validated to resolve inside VAULT_ROOT before anything
// runs, so this can't be used to open or probe arbitrary paths on the machine.
app.post("/api/open-folder", (req, res) => {
  const relPath = req.body?.path;
  if (!relPath || typeof relPath !== "string") {
    return res.status(400).json({ error: "No path provided." });
  }
  const abs = path.resolve(VAULT_ROOT, relPath);
  if (abs !== VAULT_ROOT && !abs.startsWith(VAULT_ROOT + path.sep)) {
    return res.status(400).json({ error: "Path escapes the vault." });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return res.status(404).json({ error: `"${relPath}" doesn't exist yet.` });
  }
  try {
    // code(.cmd) is a shim like claude(.cmd) — needs a shell on Windows to resolve at all (see
    // CLAUDE_COMMAND's comment above for why). But shell:true on Windows has its own trap
    // (same one the headless-Claude endpoint hit and fixed by moving the prompt to stdin — see
    // its comment): Node does NOT quote array-form args or even the command itself for cmd.exe
    // when shell:true, it naively space-joins everything into one line — so both the command
    // (its own install path routinely has spaces, e.g. "...\Microsoft VS Code\bin\code.cmd")
    // and this folder path need to be individually double-quoted here, or cmd.exe tokenizes on
    // every space and the whole thing falls apart. Confirmed by testing directly: unquoted
    // fails with "'C:\...\Microsoft' is not recognized..."; quoting both fixes it. There's no
    // stdin escape hatch here like the Claude endpoint used — `code` takes the path as a real
    // positional argument, not something it reads from stdin. -n opens a new window rather than
    // reusing whatever VS Code window last had focus; -g isn't used since we want the folder
    // open, not a single file.
    const isWin = process.platform === "win32";
    const command = isWin ? `"${VSCODE_COMMAND}"` : VSCODE_COMMAND;
    const args = isWin ? ["-n", `"${abs}"`] : ["-n", abs];
    const child = spawn(command, args, {
      shell: isWin,
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {
      /* the client only learns about this if it happens before res.json below fires; a launch
         failure after that point (rare — spawn's own ENOENT etc. surfaces synchronously into
         the outer catch instead) just fails silently, same tradeoff as the old explorer.exe path */
    });
    child.unref();
    tryFocusVSCodeWindow();
    res.json({ opened: true });
  } catch (err) {
    res.status(500).json({ error: `Couldn't open VS Code — is it installed? (${err.message})` });
  }
});

// A plain claude.ai chat tab (no vault file access) can still do the reading/writing-text part
// of grading — it just can't save the result itself. So every grading prompt asks Claude to
// write the files directly if it can, or fall back to replying with each file as its own
// ```filename code block if it can't — these endpoints are the other half of that: the viewer
// parses those blocks back out of a pasted reply and saves them itself, since this server (unlike
// a browser tab) already has real file access. Filenames are checked against a per-phase
// allowlist so this can't be used to write arbitrary paths.
// *-reference.md/.\w+ entries are the "give me the fully correct answer" files — same
// paste-back-writable pattern as feedback, just a different, on-demand file per attempt.
const PHASE_SAVE_ALLOWLIST = {
  design: [/^design-feedback\.md$/, /^attempt\.json$/, /^design-reference\.md$/],
  terraform: [/^terraform-feedback\.md$/, /^attempt\.json$/, /^terraform-reference\.md$/],
  test: [
    /^test-script-feedback\.md$/,
    /^test-evidence\.md$/,
    /^test-evidence\.json$/,
    /^attempt\.json$/,
    /^test-script\.\w+$/,
    /^test-script-reference\.\w+$/,
  ],
  "given-app": [/^description-feedback\.md$/, /^attempt\.json$/, /^description-reference\.md$/],
};

function isAllowedFilename(phase, filename) {
  if (typeof filename !== "string" || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return false;
  return (PHASE_SAVE_ALLOWLIST[phase] || []).some((re) => re.test(filename));
}

// Appended to every grading-style prompt so the same prompt works whether Claude has real file
// access (Claude Code, Cowork) or is a plain chat session that doesn't — one prompt, two valid
// ways to finish it, rather than a separate "web version" of every prompt to keep in sync.
function pasteBackInstructions(fileNames) {
  const blocks = fileNames.map((f) => `\`\`\`${f}\n<content>\n\`\`\``).join("\n\n");
  return `\nIf you have direct file access to this vault (Claude Code, Cowork), write these files there
directly and you're done. If this is a plain chat session with no file access, instead reply with
each file as its own fenced code block, using the exact filename as the block's language tag, and
nothing else outside the blocks:

${blocks}

I'll paste your reply back into the vault viewer, which extracts and saves each block itself.`;
}

function saveFilesToDir(dir, phase, files, res) {
  const written = [];
  for (const [filename, content] of Object.entries(files || {})) {
    if (!isAllowedFilename(phase, filename)) {
      res.status(400).json({ error: `"${filename}" isn't a file this endpoint can write for phase "${phase}".` });
      return null;
    }
    if (typeof content !== "string") continue;
    fs.writeFileSync(path.join(dir, filename), content, "utf8");
    written.push(filename);
  }
  return written;
}

// Prepare a design attempt for grading: snapshots whatever's currently in
// phases/design/current/design-doc.md (edited externally, e.g. in Obsidian) into a
// brand-new attempt, and hands back a ready-made grading prompt — paste it into a Claude
// session with vault access (Claude Code, Cowork) and it'll write the feedback +
// attempt.json itself. This app never calls the API directly for grading; creating the
// attempt is the only side effect it performs.
app.post("/api/problems/:slug/phases/design/prepare", (req, res) => {
  const slug = requireProblem(req, res);
  if (!slug) return;
  const content = readFileSafe(designCurrentPath(slug));
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "phases/design/current/design-doc.md is empty — write a draft first." });
  }

  const { n, date, folder } = nextAttemptFolder(slug, "design");
  const attemptDir = path.join(VAULT_ROOT, slug, "phases/design/attempts", folder);
  fs.mkdirSync(attemptDir, { recursive: true });
  fs.writeFileSync(path.join(attemptDir, "design-doc.md"), content, "utf8");

  const attemptRel = `${slug}/phases/design/attempts/${folder}`;
  const prompt = `You're inside this vault. Grade the design doc at "${attemptRel}/design-doc.md" against the
problem statement at "${slug}/problem.md", following rules.md's grading standard at the vault root —
specifically "Tone", "Grading integrity", and step 5 of "The loop", and the design schema in the
"attempt.json schemas" section.

Do this:
1. Read rules.md, ${slug}/problem.md, and ${attemptRel}/design-doc.md. If "${slug}/given-app/" exists,
   also read "${slug}/given-app/current/description.md" if present and non-empty (otherwise skim the
   actual code there yourself) — per rules.md's "Given application code" section, a design doc that
   gets the given app's real behavior wrong is itself a finding, not just one that misreads the spec.
2. Write findings ordered minor -> major -> critical, each with a "location" ({file: "design-doc.md",
   line_start, line_end}) pointing at the actual line(s) in the doc, per rules.md's location field rules.
   Tag each critical with a blocking/non-blocking call. Roll up to one verdict
   (fail | passed-with-gaps | solid-pass | strong-pass).
3. Write the prose version to "${attemptRel}/design-feedback.md" (findings + verdict, same tone/order).
4. Write "${attemptRel}/attempt.json" exactly per the design schema:
   {"phase": "design", "attempt_number": ${n}, "date": "${date}", "findings": [...], "verdict": "..."}.
Do not touch any other files.
${pasteBackInstructions(["design-feedback.md", "attempt.json"])}`;
  res.json({ folder, prompt });
});

// Saves files parsed from a pasted Claude reply into an existing attempt folder — the fallback
// path for a plain chat session that had no file access to write them itself (see
// pasteBackInstructions above). Only ever called against a folder this app already created.
app.post("/api/problems/:slug/phases/:phase/attempts/:attemptFolder/save-files", (req, res) => {
  const { slug, phase, attemptFolder } = req.params;
  if (!discoverProblemSlugs().includes(slug)) return res.status(404).json({ error: "Unknown problem slug." });
  if (!PHASES.includes(phase)) return res.status(404).json({ error: "Unknown phase." });
  if (!phaseAttemptFolders(slug, phase).includes(attemptFolder)) {
    return res.status(404).json({ error: "Unknown attempt folder." });
  }
  const attemptDir = path.join(VAULT_ROOT, slug, "phases", phase, "attempts", attemptFolder);
  const written = saveFilesToDir(attemptDir, phase, req.body?.files, res);
  if (written === null) return; // saveFilesToDir already sent the error response
  res.json({ written });
});

// Prepare a Terraform attempt for grading: snapshots phases/terraform/current/ into a new
// attempt against a specific graded design attempt (defaults to the latest one), and hands
// back the grading prompt — same "paste into your own Claude session" pattern as design.
app.post("/api/problems/:slug/phases/terraform/prepare", (req, res) => {
  const slug = requireProblem(req, res);
  if (!slug) return;

  const currentFiles = loadTerraformCurrent(slug);
  if (currentFiles.length === 0) {
    return res.status(400).json({ error: "No .tf files in phases/terraform/current/ yet." });
  }

  const designFolders = phaseAttemptFolders(slug, "design");
  let implementsFolder = req.body?.implements;
  if (!implementsFolder) implementsFolder = designFolders[designFolders.length - 1] || null;
  if (!implementsFolder || !designFolders.includes(implementsFolder)) {
    return res.status(400).json({ error: "No graded design attempt to implement — grade a design doc first." });
  }

  const { n, date, folder } = nextAttemptFolder(slug, "terraform");
  const attemptDir = path.join(VAULT_ROOT, slug, "phases/terraform/attempts", folder);
  fs.mkdirSync(path.join(attemptDir, "terraform"), { recursive: true });
  for (const f of currentFiles) {
    const dest = path.join(attemptDir, "terraform", f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); // f.path may include module subfolders
    fs.writeFileSync(dest, f.content, "utf8");
  }

  const attemptRel = `${slug}/phases/terraform/attempts/${folder}`;
  const designDocRel = `${slug}/phases/design/attempts/${implementsFolder}/design-doc.md`;
  const prompt = `You're inside this vault. Grade the Terraform at "${attemptRel}/terraform/" against the
design doc it implements at "${designDocRel}" and the problem statement at "${slug}/problem.md", following
rules.md's grading standard at the vault root — "Tone", "Grading integrity", step 8 of "The loop", and the
terraform schema in "attempt.json schemas".

Do this:
1. Read rules.md, ${slug}/problem.md, ${designDocRel}, and every .tf file under ${attemptRel}/terraform/.
2. Write findings ordered minor -> major -> critical, each with a "location" ({file: "terraform/<name>.tf",
   line_start, line_end}), per rules.md's location field rules. Tag each critical with a blocking/
   non-blocking call. Roll up to one verdict (fail | passed-with-gaps | solid-pass | strong-pass).
3. Write the prose version to "${attemptRel}/terraform-feedback.md".
4. Write "${attemptRel}/attempt.json" exactly per the terraform schema:
   {"phase": "terraform", "attempt_number": ${n}, "date": "${date}", "implements": "${implementsFolder}",
   "findings": [...], "verdict": "..."}.
${pasteBackInstructions(["terraform-feedback.md", "attempt.json"])}
Do not touch any other files. Static-validation-style findings should come from reading the code (or from
running terraform validate/fmt/tfsec yourself if this session has shell access).`;
  res.json({ folder, prompt, implements: implementsFolder });
});

// Check has no "current/" to snapshot (per rules.md, the test script is written fresh straight
// into a new attempt, not staged first) — so unlike design/terraform's save-files, which writes
// into a folder this app already created, this endpoint creates the attempt folder itself, from
// whatever files got parsed out of the pasted reply.
app.post("/api/problems/:slug/phases/test/save-check", (req, res) => {
  const slug = requireProblem(req, res);
  if (!slug) return;
  const files = req.body?.files;
  if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
    return res.status(400).json({ error: "No files provided." });
  }
  const { folder } = nextAttemptFolder(slug, "test");
  const attemptDir = path.join(VAULT_ROOT, slug, "phases/test/attempts", folder);
  fs.mkdirSync(attemptDir, { recursive: true });
  const written = saveFilesToDir(attemptDir, "test", files, res);
  if (written === null) {
    fs.rmSync(attemptDir, { recursive: true, force: true }); // don't leave a half-written attempt folder behind
    return;
  }
  res.json({ folder, written });
});

// Prepare a given-app comprehension attempt for grading: same pattern as design's prepare
// above — snapshots whatever's currently in given-app/current/description.md (the user's own
// write-up of what the generated code actually does, edited externally) into a new attempt, and
// hands back a grading prompt. Per rules.md's "Given application code" section, this write-up is
// itself part of the practice and gradeable, not an aid Claude Code produces for you.
app.post("/api/problems/:slug/given-app/prepare", (req, res) => {
  const slug = requireProblem(req, res);
  if (!slug) return;
  const content = readFileSafe(givenAppCurrentPath(slug));
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "given-app/current/description.md is empty — write your summary first." });
  }

  const { n, date, folder } = nextGivenAppAttemptFolder(slug);
  const attemptDir = path.join(VAULT_ROOT, slug, "given-app/attempts", folder);
  fs.mkdirSync(attemptDir, { recursive: true });
  fs.writeFileSync(path.join(attemptDir, "description.md"), content, "utf8");

  const attemptRel = `${slug}/given-app/attempts/${folder}`;
  const prompt = `You're inside this vault. Grade the given-app comprehension summary at "${attemptRel}/description.md"
against the actual generated code in "${slug}/given-app/" (every file there except given-app-spec.md,
generated.md, and the current/ and attempts/ folders) and the spec at "${slug}/given-app/given-app-spec.md",
following rules.md's grading standard at the vault root — "Tone", "Grading integrity", the "Given application
code" section's comprehension-grading guidance, and the given-app schema in "attempt.json schemas".

Do this:
1. Read rules.md, ${slug}/given-app/given-app-spec.md, every generated code file under ${slug}/given-app/
   (skip current/ and attempts/), and ${attemptRel}/description.md.
2. Write findings ordered minor -> major -> critical, each with a "location" ({file: "description.md",
   line_start, line_end}) pointing at the actual line(s) in the summary, per rules.md's location field
   rules. Flag anywhere the summary misreads, omits, or gets wrong the code's actual behavior (endpoints,
   data handling, concurrency, quirks/corner cases baked into the spec) — not just typos or prose quality.
   Tag each critical with a blocking/non-blocking call. Roll up to one verdict
   (fail | passed-with-gaps | solid-pass | strong-pass).
3. Write the prose version to "${attemptRel}/description-feedback.md".
4. Write "${attemptRel}/attempt.json" exactly per the given-app schema:
   {"phase": "given-app", "attempt_number": ${n}, "date": "${date}", "findings": [...], "verdict": "..."}.
Do not touch any other files.
${pasteBackInstructions(["description-feedback.md", "attempt.json"])}`;
  res.json({ folder, prompt });
});

// Same paste-back fallback pattern as design/terraform's save-files above, scoped to a
// given-app attempt folder instead of a phases/<phase>/attempts/ one.
app.post("/api/problems/:slug/given-app/attempts/:attemptFolder/save-files", (req, res) => {
  const { slug, attemptFolder } = req.params;
  if (!discoverProblemSlugs().includes(slug)) return res.status(404).json({ error: "Unknown problem slug." });
  if (!givenAppAttemptFolders(slug).includes(attemptFolder)) {
    return res.status(404).json({ error: "Unknown attempt folder." });
  }
  const attemptDir = path.join(VAULT_ROOT, slug, "given-app/attempts", attemptFolder);
  const written = saveFilesToDir(attemptDir, "given-app", req.body?.files, res);
  if (written === null) return;
  res.json({ written });
});

// Runs a CODE-tagged prompt against the local Claude Code CLI headlessly (no chat UI) — the
// one-click alternative to copy/paste-into-Claude-Code-yourself, or the paste-back fallback for
// a plain web tab. This is the only path in this app that ever executes anything, so it's kept
// to file-editing prompts only (grading — design, terraform, given-app comprehension — and the
// check script) — none of
// them ever need to run a shell command, so acceptEdits (auto-approve file edits, nothing else)
// is enough without reaching for a broader "skip all permissions" mode. Requires the `claude`
// CLI to be installed and authenticated on this machine already; this app never handles auth.
// Explicitly never wired up for Verify (real terraform apply/destroy) — that stays a manual,
// watched hand-off, not a background button click. See the user-facing discussion this endpoint
// came from for the reasoning.
app.post("/api/run-headless", (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "No prompt provided." });
  }
  let child;
  try {
    // On Windows, a globally-installed CLI like `claude` is a .cmd shim (see `where claude`) —
    // spawn() only resolves those through a shell, unlike an interactive terminal which does
    // its own PATH/PATHEXT resolution. shell:true is needed for that, but it comes with a
    // trap: Node does NOT quote array-form args for cmd.exe (that's only for the interpreter
    // lookup itself) — it naively space-joins them, so a multi-word/multi-line prompt passed
    // as an argv element gets word-split into stray separate arguments instead of staying one
    // string, and claude silently runs on garbage input. The fix is to never put the prompt on
    // the command line at all: `claude -p` reads it from stdin when no positional prompt is
    // given, which sidesteps shell quoting entirely — only fixed, space-free flags go in argv.
    // CLAUDE_COMMAND (resolved above) is the absolute path when found, so the spawned cmd.exe
    // doesn't need this process's own PATH to include npm's global shim folder.
    child = spawn(CLAUDE_COMMAND, ["-p", "--permission-mode", "acceptEdits"], {
      cwd: VAULT_ROOT,
      timeout: 5 * 60 * 1000,
      shell: process.platform === "win32",
    });
  } catch (err) {
    return res.status(500).json({ error: `Couldn't launch the Claude Code CLI: ${err.message}` });
  }
  let stdout = "";
  let stderr = "";
  child.stdin?.end(prompt, "utf8");
  child.stdout?.on("data", (d) => (stdout += d));
  child.stderr?.on("data", (d) => (stderr += d));
  child.on("error", (err) => {
    if (res.headersSent) return;
    res.status(500).json({
      error: `Couldn't launch the Claude Code CLI ("claude") — is it installed and on PATH? (${err.message})`,
    });
  });
  child.on("close", (code) => {
    if (res.headersSent) return;
    if (code !== 0) {
      return res.status(500).json({ error: stderr.trim() || `claude exited with code ${code}.` });
    }
    res.json({ output: stdout.trim() });
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`System Design vault viewer running at http://localhost:${PORT}`);
  console.log(`Reading vault from: ${VAULT_ROOT}`);
  console.log(`Headless runs will use: ${CLAUDE_COMMAND}${CLAUDE_COMMAND === "claude" ? " (resolved via this process's PATH at spawn time)" : ""}`);
  console.log(`"Open folder" will use: ${VSCODE_COMMAND}${VSCODE_COMMAND === "code" ? " (resolved via this process's PATH at spawn time)" : ""}`);
});
