import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 13 Claude sessions total.
 *   - 9 × trace     → 1 session each                       = 9
 *   - 1 × dispatch  → 1 session (stops when subagent fires) = 1
 *   - 3 × activation → 1 session each                       = 3
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 *
 * Cases are grounded in real routing lines + files that exist on disk:
 *   - root CLAUDE.md `## Read when` table (loads every session — most deterministic)
 *   - module CLAUDE.md `## Read when` rows (load once the model touches that folder)
 *   - skill/subagent contracts linked from CLAUDE.md (activation must fire — or, for a
 *     MANUAL-ONLY skill, must NOT fire on a near-miss)
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    // Pure DISPATCH: the dispatch runner stops the instant architecture-reviewer launches and does
    // NOT assert isError, so a run that wanders (reads several files, SendMessages the subagent) before
    // dispatching still passes — where a `trace` that also asserted a specific file-read + isError
    // flaked (1 turn one run, 17 turns the next). CLAUDE.md "Read-when" doc routing is already covered
    // by the five dedicated routing traces below; this case's unique signal is the subagent dispatch.
    kind: "dispatch",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "API-route task pulls the architecture-reviewer subagent",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 8,
  },

  // --- trace (1 session): reviewer-core CLAUDE.md "Read when" routing ---------------------------
  {
    kind: "trace",
    // Tests the module CLAUDE.md "Read when" routing, so the prompt must push toward CONSULTING the
    // docs, not exploring source. Two earlier traps to avoid: "розберись, як усе влаштовано" sent the
    // model straight into schema.ts and it never opened the routed doc; and the bare word "pipeline"
    // magnetized to root CLAUDE.md's loud "Running the SDD pipeline → docs/sdd-workflow.md" row, so a
    // review-pipeline prompt read the SDD doc instead. Naming the reviewer-core PACKAGE and its ENGINE
    // explicitly steers to reviewer-core's CLAUDE.md, which routes "pipeline & public API → README.md".
    name: "reviewer-core engine task follows its CLAUDE.md routing to the README",
    prompt:
      "Я збираюся змінити рушій рецензування в пакеті reviewer-core (diff → prompt → LLM → grounded " +
      "findings). Перш ніж торкатися коду — звірся з CLAUDE.md саме пакета reviewer-core щодо того, " +
      "який документ описує цей рушій та його публічний API, і прочитай саме той документ.",
    expectFilesRead: ["reviewer-core/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "surprising behavior" routing -> INSIGHTS.md ----------------
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path and read the file, making the negative flaky. As a single-session trace it
  // reliably checks the same routing rule: reviewer-core's CLAUDE.md sends "a review output looks
  // wrong → INSIGHTS.md", so in the real repo the discovery prompt reads reviewer-core/INSIGHTS.md.
  {
    kind: "trace",
    name: "CLAUDE.md routes a surprising-behavior lookup to reviewer-core INSIGHTS",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 5,
  },

  // --- engineering-insights loop: RECALL trace + capture near-miss negative ---------------------
  // We assert the RECALL half of the loop, not manual capture. The capture half depends on the
  // model spontaneously invoking the Skill tool, which is structurally unreliable (the model reads
  // the module INSIGHTS.md and narrates a capture instead) — the SKILL.md itself notes a Stop hook,
  // not a manual trigger, is the real fix. Recall, by contrast, fires deterministically: a task in a
  // module reads that module's INSIGHTS.md, per CLAUDE.md's Session Protocol ("At session start …
  // read that module's INSIGHTS.md and summarize the top 3").
  {
    kind: "trace",
    name: "session-start protocol reads the touched module's INSIGHTS.md",
    prompt:
      "I'm about to start work on the server package's reviews module. Per this repo's session-start " +
      "protocol, do what you're supposed to do before touching any code in that module.",
    expectFilesRead: ["server/INSIGHTS.md"],
    maxTurns: 5,
  },
  // Kept as a standalone guard: merely EXPLAINING a topic (no discovery to persist) must not engage
  // engineering-insights. Protects against the capture skill over-triggering on a conceptual answer.
  {
    kind: "activation",
    name: "near-miss negative — explaining a topic must NOT engage engineering-insights",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // === Root CLAUDE.md `## Read when` routing (1 session each) ===================================
  // Root CLAUDE.md loads every session, so its Read-when table is the most deterministic surface.
  // Each case pushes toward CONSULTING the routed doc, not exploring source, and anchors on one doc.

  // CLAUDE.md: "Running the SDD pipeline (spec → plan → build → verify → gate) → docs/sdd-workflow.md"
  {
    kind: "trace",
    name: "CLAUDE.md routes an SDD-pipeline question to docs/sdd-workflow.md",
    prompt:
      "I want to run this repo's spec → plan → build → verify → gate pipeline for a new feature. " +
      "Per this repo's guidelines, which document describes that workflow? Read it.",
    expectFilesRead: ["docs/sdd-workflow.md"],
    maxTurns: 5,
  },

  // CLAUDE.md: "Writing/editing a reviewer agent prompt → docs/agent-prompts/README.md"
  {
    kind: "trace",
    name: "CLAUDE.md routes a reviewer-agent-prompt edit to docs/agent-prompts",
    prompt:
      "I'm going to write a new reviewer agent prompt. Before touching anything, consult this repo's " +
      "guidance on where reviewer agent prompts are documented, and read it.",
    expectFilesRead: ["docs/agent-prompts/README.md"],
    maxTurns: 5,
  },

  // CLAUDE.md: "Working on tests or CI → TESTING.md"
  {
    kind: "trace",
    name: "CLAUDE.md routes a testing/CI question to TESTING.md",
    prompt:
      "I need to understand how this repo splits its test suites and CI path-filtering before adding " +
      "a test. Which repo doc covers that? Read it.",
    expectFilesRead: ["TESTING.md"],
    maxTurns: 5,
  },

  // === Module CLAUDE.md routing (1 session each) ===============================================
  // Module CLAUDE.md loads once the model engages that folder — reliable, one step less so than root.

  // server/CLAUDE.md: "Touching repo-intel → src/modules/repo-intel/README.md"
  {
    kind: "trace",
    name: "server CLAUDE.md routes a repo-intel change to its README",
    prompt:
      "In the server package I'm about to change how repo-intel indexing works. Per this repo's " +
      "conventions, which document is the source of truth for repo-intel? Read it.",
    expectFilesRead: ["server/src/modules/repo-intel/README.md"],
    maxTurns: 6,
  },

  // mcp/CLAUDE.md: "The full plan (rings, WPs, verification) → ../docs/plans/2026-07-13-mcp-server.md"
  {
    kind: "trace",
    name: "mcp CLAUDE.md routes an MCP design question to its plan doc",
    prompt:
      "I'm working in the mcp package and need the full design/plan behind this MCP server (rings, " +
      "work packages, verification). Where does this repo keep it? Read that file.",
    expectFilesRead: ["docs/plans/2026-07-13-mcp-server.md"],
    maxTurns: 6,
  },

  // === Subagent dispatch from a CLAUDE.md-documented process (1 session) ========================
  // CLAUDE.md: "Feature specs (EARS contracts) are authored by the `spec-creator` agent". Stops the
  // moment spec-creator is launched (trace stopWhen) — never waits out the nested subagent's run.
  {
    kind: "trace",
    name: "a 'write a spec' task dispatches the spec-creator subagent",
    prompt:
      "I need an EARS specification for a new feature: exporting a review as a PDF. Per this repo's " +
      "process, hand this to the right subagent to author the spec — don't write it yourself.",
    expectSubagents: ["spec-creator"],
    maxTurns: 8,
  },

  // === Skill activation pair from CLAUDE.md-linked skills ======================================

  // dependency-checker triggers on a package-coupling question even without the word "dependency".
  {
    kind: "activation",
    name: "dependency-checker activates on a package-coupling question",
    prompt:
      "Draw me a map of how our six packages depend on each other and where the heaviest npm weight " +
      "is coming from.",
    skill: "dependency-checker",
    shouldActivate: true,
    // dependency-checker is a heavy skill (audits every package); maxTurns:4 made the session hit the
    // cap AFTER activating — the assertion still passed, but the trace logged a noisy isError. 6 lets
    // it settle. activated() only needs the Skill call / SKILL.md read, so this doesn't relax the test.
    maxTurns: 6,
  },
  // workflow-retro is linked from CLAUDE.md:72 but its own contract is MANUAL ONLY ("never run it
  // proactively"). Merely asking ABOUT a past run must NOT auto-launch it — an over-trigger guard.
  {
    kind: "activation",
    name: "near-miss negative — mentioning a past run must NOT auto-activate workflow-retro",
    prompt: "That last multi-agent run felt expensive. Roughly which agents did it spin up?",
    skill: "workflow-retro",
    shouldActivate: false,
    maxTurns: 4,
  },
];
