export const meta = {
  name: 'patchwork-feature',
  description: 'Add/remove/fix a Patchwork Pirates feature or content: cheap explorers scope it, Opus decomposes, Codex workers implement, Opus+codex-high verify, screenshots prove it in-game',
  whenToUse: 'Run with args = { task: "<what to add/remove/fix>" } to ship one slice of game content or a fix. Run with no args (or no args.task) to just build/prove the e2e screenshot harness.',
  phases: [
    { title: 'Bootstrap', detail: 'ensure the Playwright e2e/screenshot harness exists' },
    { title: 'Scope', detail: 'cheap explorers gather facts; Opus triages the task' },
    { title: 'Design', detail: 'Fable advisory — only when the task needs a creative call' },
    { title: 'Decompose', detail: 'Opus writes file-scoped worker briefs' },
    { title: 'Implement', detail: 'Codex 5.5-low workers via haiku plumbing, sequential + art chain' },
    { title: 'Verify', detail: 'gates, adversarial diff review, codex-5.5-high review, art review, e2e screenshots' },
    { title: 'Repair', detail: 'one fix pass if verify found blockers' },
    { title: 'Ship', detail: 'commit locally on the current branch (never push, never main)' },
  ],
}

const REPO = '/home/shane/projects/patchwork-pirates'
const S = `${REPO}/.workflow-scratch`

const REPO_RULES = `Repo hard rules (apply to every packet, review, and fix):
1. packages/sim is pure TS: no Math.random(), no Date.now(), no DOM/Node/protocol/content imports. World state carries a seeded PRNG (mulberry32) and a tick counter, not wall-clock time.
2. Content is data: new weapons/enemies/modules/characters are entries in packages/content plus at most one new small effect primitive in packages/sim - never a special-cased if-branch for one item.
3. Wire shapes in packages/protocol only change additively (optional fields with sensible defaults) within a phase.
4. Never edit docs/ (GDD.md, TECH.md, ROADMAP.md, EXECUTION.md) unless the task explicitly asks for a docs change.
5. Never git push, never switch branches, never touch main - all work happens on the current branch only, uncommitted until the Ship step.
6. Shane's live playtest server binds port 8080 - never bind, kill, or otherwise touch anything on port 8080. Test/e2e infra always uses port 8199 (server) and 5199 (client preview) exclusively.
7. Kill only processes you personally started, by the specific port (fuser -k <port>/tcp) - never a broad pkill/killall (it can hit unrelated shells).
8. Validation gate is: pnpm build && pnpm typecheck && pnpm lint && pnpm test - run from the repo root ${REPO}.`

const CODEX = (briefFile, reportFile, effort) =>
  `cd ${REPO} && nohup codex exec -m gpt-5.5 -c model_reasoning_effort=${effort} -c sandbox_workspace_write.network_access=true -C ${REPO} -s workspace-write -o ${S}/reports/${reportFile} --ephemeral "$(cat ${S}/briefs/${briefFile})" < /dev/null > ${S}/reports/${reportFile}.log 2>&1 &`

const LAUNCH_HOWTO = `You launch codex CLI jobs and wait for them. You do not write or judge code
yourself - you are plumbing. For each job, in the order given:
1. Run the given launch command with Bash (it backgrounds itself with nohup and returns immediately).
2. Wait for completion by running: until [ -s <REPORT_PATH> ]; do sleep 20; done
   with a 590000ms Bash timeout. If that Bash call times out before the file appears, run the
   SAME until-command again (repeat up to 5 times total, ~50 minutes). A non-empty report file
   means the job is done.
3. After completion, read the last 60 lines of the report file.
Do not edit any repo files yourself unless a step explicitly tells you to write a brief file.
Return, per job: DONE or TIMEOUT, plus the report tail.`

const EXPLORE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    relevantFiles: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'string' },
  },
  required: ['summary'],
}

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['add', 'remove', 'fix', 'infra'] },
    needsFableDesignInput: { type: 'boolean' },
    fableQuestion: { type: 'string' },
    touchesHardRule: { type: 'boolean' },
    hardRuleNote: { type: 'string' },
  },
  required: ['mode', 'needsFableDesignInput', 'touchesHardRule'],
}

const DECOMPOSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    needsArt: { type: 'boolean' },
    addedScenario: { type: 'string' },
    packets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          briefFile: { type: 'string' },
          reportFile: { type: 'string' },
        },
        required: ['id', 'title', 'briefFile', 'reportFile'],
      },
    },
    artPackets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          briefFile: { type: 'string' },
          reportFile: { type: 'string' },
        },
        required: ['id', 'title', 'briefFile', 'reportFile'],
      },
    },
  },
  required: ['summary', 'needsArt', 'packets'],
}

const GATES_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    fixesApplied: { type: 'array', items: { type: 'string' } },
    findings: { type: 'array', items: { type: 'string' } },
    testCount: { type: 'string' },
  },
  required: ['pass'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          summary: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'minor'] },
        },
        required: ['file', 'summary', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const ART_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    regenerate: { type: 'boolean' },
    notes: { type: 'string' },
    perAsset: {
      type: 'array',
      items: {
        type: 'object',
        properties: { asset: { type: 'string' }, verdict: { type: 'string' } },
      },
    },
  },
  required: ['regenerate'],
}

const E2E_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    scenariosRun: { type: 'array', items: { type: 'string' } },
    screenshotPaths: { type: 'array', items: { type: 'string' } },
    errors: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass'],
}

const HARNESS_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    exists: { type: 'boolean' },
    looksComplete: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['exists', 'looksComplete'],
}

const REPAIR_SCHEMA = {
  type: 'object',
  properties: {
    fixedDirectly: { type: 'array', items: { type: 'string' } },
    needsWorker: { type: 'boolean' },
    workerBriefWritten: { type: 'boolean' },
  },
  required: ['needsWorker'],
}

const SHIP_DECISION_SCHEMA = {
  type: 'object',
  properties: {
    committed: { type: 'boolean' },
    sha: { type: 'string' },
    summary: { type: 'string' },
    filesTouched: { type: 'array', items: { type: 'string' } },
  },
  required: ['committed'],
}

const E2E_HARNESS_BRIEF = `Packet: E2E / Screenshot Harness Bootstrap

Goal
Add a packages/e2e workspace package that boots an ISOLATED instance of the game
(a fresh server + the built client) headlessly, drives it in real Chromium via
Playwright, captures screenshots at named checkpoints, and reports pass/fail from
console/page errors. This becomes the standing way future work verifies a change
actually shows up in the running game, not just that unit tests pass.

File scope
Create/modify ONLY: packages/e2e/**, root package.json (add an "e2e" script and a
playwright devDependency), .gitignore (add .workflow-scratch/ and
packages/e2e/out/ if not already present). Everything else is read-only context.

Context to read first
- docs/TECH.md - wire protocol and tick model.
- packages/server/src/index.ts - exports startServer(port, seed): ServerHandle.
  It is already a real library export (see packages/server/package.json "exports").
  Import and call it directly - do not shell out to a CLI and parse stdout.
- packages/server/src/index.test.ts - shows the exact pattern: startServer(0) for
  an ephemeral port, connect a raw ws client, exercise it. Your harness reuses this
  idea but drives a REAL BROWSER instead of a raw ws client.
- packages/client/src/net.ts function resolveWsUrl - the client already honors a
  "port" query param (and a "ws" param) to point at a non-default server. So the
  browser page should navigate to a URL like http://localhost:5199/?port=8199 to
  talk to your isolated test server on 8199 instead of the default 8080.
- packages/client/vite.config.ts and packages/client/package.json (build script).

Requirements
1. Add "playwright" as a devDependency of packages/e2e. Run
   npx playwright install chromium --with-deps yourself during this packet and
   confirm headless Chromium actually launches - paste the result in your report.
2. packages/e2e/src/server.ts: export launchTestServer(seed, port) that imports
   startServer from @patchwork/server (add "@patchwork/server": "workspace:*" as a
   dependency) and returns { url, close() }. Default port 8199, overridable by env
   E2E_SERVER_PORT. NEVER default to or fall back onto port 8080 - that is Shane's
   live playtest server; colliding with it is a real bug, not a style nit.
3. packages/e2e/src/browser.ts: wraps playwright's chromium.launch({ headless: true }),
   opens N pages via context.newPage(), and exposes:
   - screenshot(page, outDir, label) -> saves <outDir>/<label>.png
   - console/pageerror collectors attached per page (page.on('console'), page.on('pageerror'))
     that you can flush to <outDir>/console.json as an array of { type, text }.
4. packages/e2e/src/scenarios/ - define a Scenario shape: { name, seed, players:
   Array<{ characterId?: string }>, steps: ScenarioStep[] } where a ScenarioStep is
   one of: { wait: ms }, { key: string, page?: number, downMs?: number } (keyboard
   input on a page, default page 0), { click: string, page?: number } (a CSS
   selector), { screenshot: string, page?: number } (a label). Implement two canned
   scenarios:
   - solo-smoke.ts: open the menu, create a lobby, select the first available
     character, ready up, wait until the run starts, move a bit, screenshot
     "in-combat", wait through roughly one wave, screenshot "build-phase".
   - coop-smoke.ts: same idea with 2 pages/2 players joining the same lobby code,
     screenshot "lobby-two-players" once both have joined.
5. packages/e2e/src/run.ts - a CLI entry (tsx src/run.ts <scenarioName> [--headed]):
   - builds the client first if packages/client/dist is missing or stale
     (pnpm --filter @patchwork/client build)
   - serves it with: vite preview --port 5199 --strictPort, run from packages/client
   - launches the isolated test server via launchTestServer(seed, 8199)
   - opens the browser pointed at http://localhost:5199/?port=8199
   - runs the named scenario's steps in order
   - writes screenshots, console.json, and a result.json
     ({ pass: boolean, scenario, errors: string[], screenshotPaths: string[] }) to
     packages/e2e/out/<scenarioName>/
   - tears down the preview server and the test server cleanly, killing ONLY the
     processes/ports it started (fuser -k 8199/tcp and fuser -k 5199/tcp - never a
     broader kill)
   - exits 0 on pass (no console/page errors of type "error", every scripted
     screenshot captured with nonzero size), exits 1 on fail
6. Add a root package.json script: "e2e": "pnpm --filter @patchwork/e2e run"
   and a packages/e2e/package.json script "run": "tsx src/run.ts".
7. packages/e2e/out/ must be gitignored (screenshots are build artifacts, not source).

Hard rules
${REPO_RULES}
- This package is test tooling: it MAY import from other workspace packages as a
  consumer (same relationship packages/harness already has), but nothing else may
  import FROM packages/e2e.

Validation you must run before finishing
1. pnpm install (new deps)
2. pnpm build && pnpm typecheck && pnpm lint
3. pnpm e2e solo-smoke - MUST actually pass and produce real, non-trivial PNG
   screenshots. Paste "ls -la packages/e2e/out/solo-smoke/" and the file sizes - a
   blank/placeholder PNG under about 3KB is suspicious; investigate it, don't just
   report it.
4. pnpm e2e coop-smoke - same check, 2 players.

Report format
What you built, every file touched, deps added, full validation output (paste,
including screenshot file sizes), open concerns.`

// Defensive: some callers/transports deliver a JSON-object `args` as a JSON-encoded
// string instead of a parsed object. Normalize so `args.task` etc. always work.
if (typeof args === 'string') {
  try {
    args = JSON.parse(args)
  } catch {
    args = { task: args }
  }
}

phase('Bootstrap')
const harnessCheck = await agent(
  `In ${REPO}, inspect (do NOT run anything) whether packages/e2e exists and looks
like a working Playwright-based e2e harness: has a package.json, a src/run.ts CLI,
at least one scenario file under src/scenarios/, and packages/e2e/out/ is
gitignored. Also check the root package.json has an "e2e" script. Return
{exists, looksComplete, notes}.`,
  { label: 'harness-check', phase: 'Bootstrap', model: 'haiku', effort: 'low', schema: HARNESS_CHECK_SCHEMA }
)

let bootstrapReport = null
if (!harnessCheck || !harnessCheck.exists || !harnessCheck.looksComplete) {
  log('E2E/screenshot harness missing or incomplete - building it once via a Codex worker. Future runs skip this.')
  await agent(
    `Run (Bash): mkdir -p ${S}/briefs ${S}/reports && rm -f ${S}/briefs/*.md ${S}/reports/*.md ${S}/reports/*.log
Then write the following content EXACTLY, verbatim, to ${S}/briefs/e2e-harness.md using
your Write tool (write only the content below, nothing added or removed):
${E2E_HARNESS_BRIEF}`,
    { label: 'bootstrap-brief', phase: 'Bootstrap', model: 'haiku', effort: 'low' }
  )
  const workerReport = await agent(
    `${LAUNCH_HOWTO}
Jobs:
1. launch: ${CODEX('e2e-harness.md', 'e2e-harness.md', 'medium')}
   report: ${S}/reports/e2e-harness.md`,
    { label: 'bootstrap-harness', phase: 'Bootstrap', model: 'haiku', effort: 'low' }
  )
  const bootstrapVerify = await agent(
    `Verify the e2e harness a Codex worker just built in ${REPO}. Run, in order:
pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm e2e solo-smoke &&
pnpm e2e coop-smoke. Inspect packages/e2e/out/*/*.png file sizes (each should be well
over 3KB, not blank). Fix small mechanical issues yourself if you find them (a missing
gitignore entry, wrong port number, a bad CSS selector, a stale dist forcing a rebuild)
but do NOT redesign the harness. Return pass/fail, what you fixed, and the screenshot
file sizes you observed.
${REPO_RULES}`,
    { label: 'bootstrap-verify', phase: 'Bootstrap', model: 'opus', effort: 'high' }
  )
  bootstrapReport = { workerReport, verify: bootstrapVerify }
  if (!bootstrapVerify || bootstrapVerify.pass !== true) {
    log('WARNING: e2e harness bootstrap did not fully pass. The Verify phase e2e step may be degraded or skipped this run.')
  } else {
    log('E2E/screenshot harness bootstrap complete and verified.')
  }
} else {
  log('E2E/screenshot harness already present - skipping bootstrap.')
}

if (!args || !args.task) {
  log('No args.task given - stopping after Bootstrap. Invoke again with args = { task: "<what to add/remove/fix>" } to run a real feature/content slice.')
  return { bootstrapOnly: true, harnessCheck, bootstrapReport }
}

phase('Scope')
const explorers = await parallel([
  () =>
    agent(
      `Explore the Patchwork Pirates repo at ${REPO}, read-only. Task at hand: "${args.task}".
Report: the relevant existing files/patterns for this task, the content-definition
shape if this is content-related (quote a real example object from packages/content),
existing tests in the relevant area (file paths), and any existing sim primitive this
could reuse instead of adding a new one.`,
      { label: 'explore:code', phase: 'Scope', model: 'haiku', effort: 'low', schema: EXPLORE_SCHEMA }
    ),
  () =>
    agent(
      `Read docs/GDD.md and docs/ROADMAP.md in ${REPO}. Task at hand: "${args.task}".
Report: does this touch any GDD hard rule (banned inputs list) or the locked MVP scope
list? Is this already an itemized, planned ROADMAP entry (quote it) or new scope? Any
design guidance already written that constrains how this should be built?`,
      { label: 'explore:design-docs', phase: 'Scope', model: 'haiku', effort: 'low', schema: EXPLORE_SCHEMA }
    ),
])

const triage = await agent(
  `You are triaging a work request for Patchwork Pirates before it gets decomposed into
worker packets. Task: "${args.task}".
Facts gathered by explorers: ${JSON.stringify(explorers)}

Decide:
1. mode: "add" | "remove" | "fix" | "infra".
2. needsFableDesignInput: true ONLY if this involves a creative/design judgment call
   that is not already fully specified - a new character concept, a new weapon's FEEL
   (not just numbers), tone/narrative content, or an ambiguous design tradeoff with no
   clearly-right answer. False for mechanical work: bugfixes, refactors, test/infra,
   already-fully-specified content (exact numbers/behavior given in the task), and
   removals.
3. fableQuestion: if needed, the exact creative question to ask Fable, with enough game
   context inlined that Fable can answer without re-reading the repo.
4. touchesHardRule + hardRuleNote: true if this crosses a GDD hard rule or locked MVP
   scope boundary found by the explorers - this must be flagged for Shane, not decided
   unilaterally.
${REPO_RULES}`,
  { label: 'triage', phase: 'Scope', model: 'opus', effort: 'high', schema: TRIAGE_SCHEMA }
)
log(`Triage: mode=${triage.mode}, needsFable=${triage.needsFableDesignInput}, touchesHardRule=${triage.touchesHardRule}`)
if (triage.touchesHardRule) {
  log(`Hard-rule/scope flag: ${triage.hardRuleNote} - proceeding, but this will NOT auto-ship; Shane must review before it's committed.`)
}

phase('Design')
let fableAnswer = null
if (triage.needsFableDesignInput) {
  log('Consulting Fable for design input (advisory only, one call).')
  fableAnswer = await agent(
    `You are Fable, the creative/design advisor for Patchwork Pirates - a co-op
auto-combat survival roguelite about pirates repairing and defending a raft. You are
being consulted for ONE specific creative decision, not a full design pass.

Question: ${triage.fableQuestion}

Context gathered from the repo: ${JSON.stringify(explorers)}

Give a concrete, opinionated creative answer an engineer can implement directly
(concrete numbers/behavior/flavor, not just vibes). Under 300 words.`,
    { label: 'fable-advisory', phase: 'Design', model: 'fable' }
  )
} else {
  log('Task is mechanical - skipping Fable, going straight to Opus decomposition.')
}

phase('Decompose')
await agent(
  `Run (Bash) in ${REPO}: mkdir -p ${S}/briefs ${S}/reports && rm -f ${S}/briefs/*.md ${S}/reports/*.md ${S}/reports/*.log
Just clear stale scratch from any previous run. Return "done".`,
  { label: 'clear-scratch', phase: 'Decompose', model: 'haiku', effort: 'low' }
)

const decompose = await agent(
  `You are decomposing a work request into Codex-worker packets for Patchwork Pirates,
following this repo's established brief format (docs/EXECUTION.md). Task: "${args.task}"
Mode: ${triage.mode}
Facts from explorers: ${JSON.stringify(explorers)}
${fableAnswer ? `Fable's design answer (incorporate it): ${fableAnswer}` : 'No design consult was needed for this task.'}

Write each packet as its own brief file under ${S}/briefs/ using your Write tool,
following this template per packet:
- Goal: one sentence, what exists after this packet that didn't before.
- File scope: an explicit path allowlist. Everything else is read-only context.
- Context to read first: concrete doc sections and existing files.
- Requirements: numbered, testable.
- Hard rules: paste this verbatim into every brief: ${REPO_RULES}
- Validation: pnpm build && pnpm typecheck && pnpm lint && pnpm test (plus anything
  packet-specific).
- Report format: what was built, decisions made, deps added, validation output pasted,
  open concerns.

Sequencing:
- "packets" is ONE sequential chain - each packet waits for the previous. Put
  packages/sim and packages/protocol changes first (they are the contract layers),
  then packages/content, then packages/server, then packages/client. If the task is
  small enough for one packet, return exactly one.
- If mode is "add" or "remove" and the feature has visible client-side behavior,
  make the LAST packet in "packets" also add one new e2e scenario file under
  packages/e2e/src/scenarios/ (only if packages/e2e already exists - check first)
  that specifically exercises this feature and takes a screenshot of it. Name it in
  addedScenario (bare scenario name, no path/extension) if you did this; leave
  addedScenario empty otherwise.
- "artPackets" is a SEPARATE chain for new sprite art ONLY (registry/content wiring
  packet first, then any actual image-generation packets) - it runs in parallel with
  "packets" because art generation doesn't depend on game logic. Leave artPackets
  empty and needsArt false if no new visual assets are needed.
- briefFile and reportFile are BARE FILENAMES only (e.g. "sim-weapon.md"), no
  directory - you write the brief to ${S}/briefs/<briefFile> yourself.

For "remove" tasks: identify EVERY reference to the thing being removed (content
entry, sim primitive if it's exclusively used by this feature, client render/audio
hooks, tests, art asset registry entries) and make sure some packet's requirements
list covers deleting all of them, not just the obvious one.

Before returning, Read back every brief file you just wrote and confirm each one is
a real, substantive, task-specific brief (concrete file paths, concrete numbered
requirements referencing THIS task) - not a stub. A brief under ~150 words is not
finished; go back and write it properly. This step is mandatory, not optional.

Do not return placeholder or illustrative values under any circumstances - every
field (id, title, briefFile, reportFile, summary) must describe THIS task's real
packets. If you find yourself about to write generic placeholders like id "a",
title "b", or a summary that just says "test", stop - you have not done the work
yet; go back, actually decompose the task, and write the real brief files first.

Return the structured manifest described above.`,
  { label: 'decompose', phase: 'Decompose', model: 'opus', effort: 'high', schema: DECOMPOSE_SCHEMA }
)
log(`Decompose: ${decompose.packets.length} core packet(s), ${decompose.needsArt ? decompose.artPackets.length + ' art packet(s)' : 'no art needed'}.`)

phase('Implement')
const codexEffort = (args && args.codexEffort) || 'low'

const packetLines = decompose.packets
  .map((p, i) => `${i + 1}. launch: ${CODEX(p.briefFile, p.reportFile, codexEffort)}\n   report: ${S}/reports/${p.reportFile}`)
  .join('\n')
const coreChainPrompt = `${LAUNCH_HOWTO}
Jobs, strictly in this order (each waits for the previous before the next launches):
${packetLines}`

let artChainPrompt = null
if (decompose.needsArt && decompose.artPackets && decompose.artPackets.length > 0) {
  const [registryPacket, ...restArt] = decompose.artPackets
  if (restArt.length === 0) {
    artChainPrompt = `${LAUNCH_HOWTO}
Jobs:
1. launch: ${CODEX(registryPacket.briefFile, registryPacket.reportFile, codexEffort)}
   report: ${S}/reports/${registryPacket.reportFile}`
  } else {
    const restLaunches = restArt.map((p) => CODEX(p.briefFile, p.reportFile, codexEffort)).join('\n   ')
    const restReports = restArt.map((p) => `${S}/reports/${p.reportFile}`).join(' and ')
    artChainPrompt = `${LAUNCH_HOWTO}
Jobs:
1. launch: ${CODEX(registryPacket.briefFile, registryPacket.reportFile, codexEffort)}
   report: ${S}/reports/${registryPacket.reportFile}
2. AFTER job 1 completes, launch ALL of these together with ONE Bash call (each one
   backgrounds itself with nohup):
   ${restLaunches}
   Then wait for ALL of their reports together (until [ -s A ] && [ -s B ] ...; do sleep 20; done): ${restReports}`
  }
}

const implementThunks = [() => agent(coreChainPrompt, { label: 'core-chain', phase: 'Implement', model: 'haiku', effort: 'low' })]
if (artChainPrompt) {
  implementThunks.push(() => agent(artChainPrompt, { label: 'art-chain', phase: 'Implement', model: 'haiku', effort: 'low' }))
}
const implementResults = await parallel(implementThunks)
const coreChainReport = implementResults[0]
const artChainReport = implementResults[1] || null

phase('Verify')
const gates = await agent(
  `You are the integration verifier for the Patchwork Pirates repo at ${REPO}. A Codex
worker chain just implemented: ${decompose.summary}
Task: "${args.task}"

Run, in order, from the repo root, each with a generous timeout:
1. pnpm build   2. pnpm typecheck   3. pnpm lint   4. timeout 300 pnpm test
KNOWN failure classes from this repo's history - FIX these mechanically yourself if
they appear, then re-run the failed gate:
- new required fields on sim state types breaking inline test fixtures in other
  packages (add the fields to the fixture literals)
- union-member access without narrowing in tests ('x' in obj narrowing)
- a "tick until X" test loop where X now requires a specific phase - set the phase in
  the fixture
- vitest hanging after otherwise-green output = a test spinning forever; find it via
  the missing file in the reporter's file list
Anything NON-mechanical (logic looks wrong, a test asserts something the spec
contradicts): do NOT fix it - report it as a finding instead.
${REPO_RULES}
Return: per-gate pass/fail, every fix you applied (file + one-line what/why), findings
list, final test count.`,
  { label: 'verify:gates', phase: 'Verify', model: 'opus', effort: 'high', schema: GATES_SCHEMA }
)
log(`Gates: pass=${gates.pass}`)

const codexHighReviewBrief = `You are an independent adversarial code reviewer for the
Patchwork Pirates repo. You did NOT write this code - review it with fresh, skeptical
eyes.

Task that was implemented: ${args.task}
Mode: ${triage.mode}
Implementation summary from the engineer who built it: ${decompose.summary}
${REPO_RULES}

Review the ENTIRE uncommitted working tree diff: run "git diff HEAD" and also check
"git status --porcelain" for untracked new source files (a brand new file has no diff
output - read those directly). Hunt specifically for: determinism violations in
packages/sim, wire-contract breaks in packages/protocol, content-is-data violations (a
special-cased if-branch for one item instead of a reusable primitive), retained-mode
rendering violations in packages/client (per-frame Graphics/object rebuilds instead of
mutating persistent transforms), and logic bugs versus the task description above.

Only report findings you are CONFIDENT are real bugs, each with file, line, a
one-sentence defect summary, and severity "blocking" (breaks correctness/the feature)
or "minor" (style/cleanup). Empty findings array if the diff is clean. Do NOT edit any
files.

End your response with a fenced code block of language json containing EXACTLY this
shape and nothing else inside it:
{"findings": [{"file": "path", "line": 0, "summary": "...", "severity": "blocking"}]}`

const codexHighReviewPrompt = `You launch one codex CLI job and relay its findings as
structured output. You do not write or judge code yourself.
1. Run (Bash): mkdir -p ${S}/briefs ${S}/reports
2. Write the EXACT content between the START/END markers below to
   ${S}/briefs/codex-high-review.md using your Write tool (write only the content
   between the markers, not the markers themselves):
---BRIEF START---
${codexHighReviewBrief}
---BRIEF END---
3. Launch (Bash): ${CODEX('codex-high-review.md', 'codex-high-review.md', 'high')}
4. Wait: until [ -s ${S}/reports/codex-high-review.md ]; do sleep 20; done  (590000ms
   Bash timeout; if it times out before the file appears, re-run the same
   until-command, up to 5 times total).
5. Read the report file. Find the fenced json code block near the end containing a
   "findings" key and parse it.
Return the findings array via structured output. Empty array if none found, or if the
report contains no such block.`

function e2eChainThunk() {
  const e2eScenarios = (args && args.e2eScenarios) || ['solo-smoke', 'coop-smoke']
  const scenarioList = e2eScenarios.concat(decompose.addedScenario ? [decompose.addedScenario] : []).join(', ')
  const e2eRunPrompt = `In ${REPO}, run the game's e2e/screenshot harness to visually
verify the just-implemented change. Task: "${args.task}"

First check (Bash) whether "pnpm e2e" and packages/e2e exist at all. If they do NOT,
return immediately with pass:false, errors:["e2e harness not installed - run Bootstrap first"],
screenshotPaths: [].

Otherwise run each of these scenarios in turn: ${scenarioList}
  pnpm e2e <scenarioName>
For each, read packages/e2e/out/<scenarioName>/result.json and console.json. Collect
the FULL ABSOLUTE paths of every screenshot PNG produced (from result.json's
screenshotPaths, resolved to absolute paths under ${REPO}).
${REPO_RULES}
Return: pass (true only if every scenario's own result.json says pass), scenariosRun,
screenshotPaths (absolute paths, all scenarios combined), errors (any console/page
errors or scenario failures, verbatim).`

  return agent(e2eRunPrompt, { label: 'verify:e2e-run', phase: 'Verify', model: 'haiku', effort: 'low', schema: E2E_SCHEMA }).then(
    async (e2e) => {
      if (!e2e) return null
      if (!e2e.screenshotPaths || e2e.screenshotPaths.length === 0) {
        return { ...e2e, visualVerify: null }
      }
      const visualVerify = await agent(
        `Visually verify a Patchwork Pirates change from real in-game screenshots.
Task: "${args.task}"  (mode: ${triage.mode})
Implementation summary: ${decompose.summary}
The e2e harness reported: ${JSON.stringify(e2e)}

Read (view) EVERY screenshot at these paths: ${e2e.screenshotPaths.join(', ')}
If mode is "add": confirm the new thing is actually visible/present and looks
plausible (readable silhouette, no obviously broken layout, no chroma-key fringe on
new sprites). If mode is "remove": confirm the removed thing is actually ABSENT and
nothing looks broken where it used to be. Report any glitches you see even if
unrelated to this task.
Return regenerate=true only if a screenshot shows the feature missing/broken/visually
wrong; false if it looks correct. Put your reasoning in notes.`,
        { label: 'verify:e2e-visual', phase: 'Verify', model: 'opus', effort: 'high', schema: ART_REVIEW_SCHEMA }
      )
      return { ...e2e, visualVerify }
    }
  )
}

const verifyThunks = [
  () =>
    agent(
      `Adversarial code review, repo ${REPO}. Task: "${args.task}" (mode: ${triage.mode}).
Implementation summary: ${decompose.summary}
Review the ENTIRE uncommitted working tree diff (git diff HEAD, plus untracked new
source files via git status --porcelain - a new file has no diff, read it directly)
against this task and the repo's hard rules.
${REPO_RULES}
Hunt for: determinism violations, wire-contract breaks, content-is-data violations,
retained-mode rendering violations, and logic bugs versus the task description. Report
only findings you are CONFIDENT in: file, line, defect, concrete failure scenario,
severity blocking/minor. Empty list if clean. Do NOT edit files.`,
      { label: 'verify:diff', phase: 'Verify', model: 'opus', effort: 'high', schema: REVIEW_SCHEMA }
    ),
  () => agent(codexHighReviewPrompt, { label: 'verify:codex-high', phase: 'Verify', model: 'haiku', effort: 'low', schema: REVIEW_SCHEMA }),
  () => e2eChainThunk(),
]
if (decompose.needsArt) {
  verifyThunks.push(() =>
    agent(
      `Art review, repo ${REPO}. Task: "${args.task}". New sprite frames were just
generated for this packet: ${decompose.summary}. Find the new asset directories under
art/sprites/normalized/ (they'll be new since the last commit - check git status).
Read (view) EACH new PNG plus art/sprites/normalized/captain/idle.png as the style
reference. Check: style consistency with the captain (palette family, outline,
painterly look), correct subject matter for what was asked, attack frames read as
windup/strike, walk frames are plausible steps, no leftover chroma-green fringes.
Report per-asset verdict OK / REGENERATE (with which frame and why). Do not modify
anything.`,
      { label: 'verify:art', phase: 'Verify', model: 'opus', effort: 'high', schema: ART_REVIEW_SCHEMA }
    )
  )
}

const verifyResults = await parallel(verifyThunks)
const diffReview = verifyResults[0]
const codexHighReview = verifyResults[1]
const e2e = verifyResults[2]
const artReview = decompose.needsArt ? verifyResults[3] : null

function collectBlockers() {
  const blockers = []
  if (gates && gates.pass === false) blockers.push({ source: 'gates', detail: gates.findings || 'gates failed' })
  ;((diffReview && diffReview.findings) || []).filter((f) => f.severity === 'blocking').forEach((f) => blockers.push({ source: 'diff-review', detail: f }))
  ;((codexHighReview && codexHighReview.findings) || []).filter((f) => f.severity === 'blocking').forEach((f) => blockers.push({ source: 'codex-high-review', detail: f }))
  if (artReview && artReview.regenerate) blockers.push({ source: 'art-review', detail: artReview.notes })
  if (e2e && e2e.pass === false) blockers.push({ source: 'e2e', detail: e2e.errors })
  if (e2e && e2e.visualVerify && e2e.visualVerify.regenerate) blockers.push({ source: 'e2e-visual', detail: e2e.visualVerify.notes })
  return blockers
}
const blockers = collectBlockers()
log(`Verify complete: ${blockers.length} blocker(s) found.`)

phase('Repair')
let repairSummary = null
if (blockers.length > 0) {
  log(`Running one repair pass for ${blockers.length} blocker(s).`)
  const repairPlan = await agent(
    `You are repairing the Patchwork Pirates repo at ${REPO} after a verify pass found
blockers. Task: "${args.task}"
Blockers: ${JSON.stringify(blockers)}

For each blocker: if it's a small (roughly 1-5 line) mechanical fix, apply it directly
right now using your Edit/Write/Bash tools and record it in fixedDirectly. If it is
substantial (needs real design/implementation work), do NOT attempt it yourself -
instead write a worker brief (same format as docs/EXECUTION.md) to
${S}/briefs/repair.md via Write, covering ALL the substantial blockers together, and
set needsWorker=true, workerBriefWritten=true.
${REPO_RULES}
Return the structured summary described above.`,
    { label: 'repair-plan', phase: 'Repair', model: 'opus', effort: 'high', schema: REPAIR_SCHEMA }
  )

  let workerReport = null
  if (repairPlan.needsWorker && repairPlan.workerBriefWritten) {
    workerReport = await agent(
      `${LAUNCH_HOWTO}
Jobs:
1. launch: ${CODEX('repair.md', 'repair.md', codexEffort)}
   report: ${S}/reports/repair.md`,
      { label: 'repair-worker', phase: 'Repair', model: 'haiku', effort: 'low' }
    )
  }

  const regates = await agent(
    `Re-run ONLY the gates (not a full re-verify) in ${REPO} after a repair pass:
pnpm build && pnpm typecheck && pnpm lint && timeout 300 pnpm test
Fix small mechanical issues if you find them (same known failure classes as before),
otherwise report findings. This is the LAST retry - do not loop further, just report
final pass/fail honestly.
${REPO_RULES}`,
    { label: 'repair-regates', phase: 'Repair', model: 'opus', effort: 'high', schema: GATES_SCHEMA }
  )
  repairSummary = { blockers, repairPlan, workerReport, regates }
  if (!regates || regates.pass !== true) {
    log('Repair did not fully resolve the gates - stopping for Shane, will NOT auto-commit.')
  } else {
    log('Repair pass resolved the gates.')
  }
} else {
  log('Verify was clean - no repair needed.')
}

phase('Ship')
const shouldCommit = !args || args.commit !== false
const gatesGreen = repairSummary ? repairSummary.regates && repairSummary.regates.pass === true : blockers.length === 0
const readyToShip = shouldCommit && gatesGreen && !triage.touchesHardRule

let shipResult = null
if (readyToShip) {
  shipResult = await agent(
    `Ship the completed work in ${REPO} on the CURRENT branch only. Task: "${args.task}"
Run: git branch --show-current - confirm you are NOT on main, and never switch
branches or push.
Run: git status --porcelain to see everything changed. Stage ONLY the files relevant
to this task by name (never "git add -A" or "git add ." blindly) - review the list
first and exclude anything that looks like a stray/unrelated file, build artifact, or
secret/.env.
Look at "git log --oneline -15" to match this repo's commit message tone/style, then
write a commit message and commit.
${REPO_RULES}
Return committed=true/false, the commit sha, a one-line summary, and the file list.`,
    { label: 'ship', phase: 'Ship', model: 'opus', effort: 'high', schema: SHIP_DECISION_SCHEMA }
  )
  log(`Ship: ${JSON.stringify(shipResult)}`)
} else {
  const reasons = []
  if (!shouldCommit) reasons.push('args.commit=false')
  if (!gatesGreen) reasons.push('gates not green')
  if (triage.touchesHardRule) reasons.push(`touches a GDD hard rule/MVP-scope boundary (${triage.hardRuleNote}) - needs Shane's explicit approval`)
  log(`NOT committing (${reasons.join('; ')}). Working tree left as-is for manual review.`)
}

return {
  task: args.task,
  mode: triage.mode,
  touchesHardRule: triage.touchesHardRule,
  hardRuleNote: triage.hardRuleNote,
  fableConsulted: Boolean(fableAnswer),
  decompose,
  coreChainReport,
  artChainReport,
  gates,
  diffReview,
  codexHighReview,
  artReview,
  e2e,
  blockers,
  repairSummary,
  shipped: readyToShip,
  shipResult,
}
