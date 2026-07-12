# Product Specification Document (v3)

## Product Name

**ThreadForge**

## Feature Name

**A Thread Topology Editor that Delegates Workflow Generation to an AI Agent**

> **v3 note.** This supersedes v2. v2 still asked the tool to *be a compiler* — a deterministic
> IR + plain-JS code generator that the engineer's outline drove directly. That was still the wrong
> center of gravity: it forced ThreadForge to track the workflow runtime API forever, and it made the
> engineer author at the level of `pipeline()` vs `parallel()`.
>
> v3 removes the compiler entirely. **ThreadForge captures *intent* as a thread topology and hands
> that thread to an AI agent, which writes the workflow `.js` using the dynamic-workflows skill.**
> The engineer draws threads; the AI writes code. Neither the engineer nor the tool needs to know the
> workflow API. The workflow-compatibility rules the codegen agent must enforce — formerly a separate
> `addendum.md` — are now folded into this document as **[Appendix A](#appendix-a--codegen-agent-contract)**,
> alongside the dynamic-workflows `SKILL.md` as the agent's reference material. This spec is
> self-contained: there are no companion files.

---

# 1. Product Summary

ThreadForge is a **personal tool for drawing the topology of a piece of engineering work as a
"thread"** — a tree of activities with clear human start and end points — and then having an **AI
agent generate the runnable Claude workflow `.js`** from that thread.

The engineer never writes the workflow script and never hand-stitches primitives. They express *what
kind of work happens and how it is shaped* (sequential, parallel, fan-out, nested, looping); the AI
fills in the mechanism (`agent()`, `pipeline()`, `parallel()`, `phase()`, schemas, prompts, args).

```text
Thread topology of intent   (drawn by the engineer)
    ↓  serialized to text (JSON)
AI codegen agent  +  dynamic-workflows SKILL.md  +  Appendix A rules
    ↓  the agent writes the script
Plain JavaScript Claude workflow script
    ↓
.claude/workflows/<name>.js
    ↓
Claude Code execution
```

The dividing line is the whole idea:

| The engineer owns (strategy) | The AI agent owns (mechanism) |
| ---------------------------- | ----------------------------- |
| topology — sequence / parallel / fan-out / nesting / loop | `pipeline()` vs `parallel()` choice |
| what each activity is *for* (intent, in prose) | the exact prompt wording sent to each subagent |
| named handoffs between activities ("this produces `epics`") | the JSON schemas that make those handoffs structured |
| where a human must start and validate | args reads, guards, `phase()`, `log()`, return shape |
| which cataloged workflows to reuse | `workflow()` composition wiring |

Because the tool emits a *thread*, not code, **the internals of the workflow runtime can evolve
freely** — new primitives, renamed helpers, changed limits — without touching a single thread the
engineer has drawn. The engineer's artifacts are threads; regenerating against an updated skill
produces updated scripts.

---

# 2. Problem Statement

Dynamic workflows are powerful but they sit at the wrong altitude for a human to author directly:

* Asking Claude to "build me a workflow" from prose is **non-deterministic at the level of intent** —
  it guesses the topology, mis-nests fan-outs, and mis-wires which output feeds which step. A
  validator can't fix this, because a perfectly valid script can still encode the *wrong intent*.
* Hand-writing the script is deterministic but forces the engineer to **learn and track the workflow
  API** (`pipeline` vs `parallel`, phase rules, schema plumbing, worktree isolation, budget loops) —
  API surface that changes and that has nothing to do with the actual engineering intent.

The insight: **the only thing that is genuinely the engineer's to specify is the topology of intent —
the thread.** Everything below it (the mechanism) is either mechanical or soft prose the AI is good at.
Per the dynamic-workflows guide, *"workflows operate as an orchestration layer beneath thread-based
engineering"* — so the engineer should work at the thread layer and let an agent generate the layer
beneath it.

ThreadForge's one job:

> Let the engineer capture the topology of intent as a thread — fast, structured, unambiguous — then
> delegate script generation to an AI agent driven by the dynamic-workflows skill. The engineer never
> writes, reads, or maintains workflow code.

What the thread pins down (structure — the part free-prompting gets wrong):

* **topology** — how activities sequence, fan out, nest, and loop
* **handoffs** — which activity's named output feeds which downstream activity
* **human boundaries** — the begin (prompt/plan) and end (review/validate) nodes of the thread

What stays soft and is delegated to the AI (mechanism + behavioral prose):

* the exact subagent **prompts**, the **schemas**, and every workflow **primitive** and API detail

---

# 3. Threads (the source model)

From [thread-based engineering](https://claudefa.st/blog/guide/mechanics/thread-based-engineering):
**a thread is a unit of engineering work over time, driven by you and your agent.** Every thread is bounded by two mandatory human nodes — a **begin** node (you provide a
prompt or plan) and an **end** node (you review or validate) — with agent activity in between. Threads
compose in four canonical shapes, and ThreadForge's activity palette is exactly these:

| Thread type | Shape | ThreadForge activity | The AI typically compiles it to |
| ----------- | ----- | -------------------- | ------------------------------- |
| **C** — chained/sequential | phases in order, handoff between | `sequence` | sequential `await`s / `pipeline()` stages |
| **P** — parallel | fixed branches at once, then a barrier | `parallel` | `parallel([...])` with a barrier reason |
| **B** — nested/orchestrated | per-item work containing sub-threads | `fanout` (mode: `orchestrate`) | `pipeline(list, item => ...)` (possibly nested) |
| **F** — fan-out comparative | same work across many agents, compared | `fanout` (mode: `compare`) | `parallel([...])` + judge/verify pattern |

Plus two activities that aren't thread *types* but are needed to express real topologies:

* `agent` — a single unit of agent work (a thread's atomic activity): an intent (`does`) and an
  optional named output (`produces`).
* `loop` — a long-running thread that repeats until done (the guide's "loop-until-done" generalizes a
  long thread); carries a stop condition and a no-progress condition.
* `call` — invoke another **cataloged** workflow as a sub-step (thread composition; the AI compiles it
  to `workflow('<name>', args)`).

The engineer assembles these into a tree. That tree, serialized to text, is the entire input to codegen.

---

# 4. Motivating Example

Verify that every story on a Jira board is actually implemented against its acceptance criteria.
The engineer draws this **thread** — note it names no primitive and writes no code:

```json
{
  "meta": {
    "name": "verify-jira-stories",
    "description": "Verify every story on a board is implemented per its acceptance criteria"
  },
  "begin": { "args": { "boardId": "string (required)" } },
  "root": {
    "kind": "sequence",                      // C-thread
    "steps": [
      { "kind": "agent",
        "does": "fetch all epics on Jira board {boardId}",
        "produces": "epics" },
      { "kind": "fanout", "mode": "orchestrate",   // B-thread
        "over": "epics", "as": "epic",
        "body": { "kind": "agent",
                  "does": "fetch all stories in epic {epic}",
                  "produces": "stories" } },
      { "kind": "fanout", "mode": "orchestrate",   // B-thread (nested)
        "over": "stories", "as": "story",
        "body": { "kind": "fanout", "mode": "compare",  // F-thread per epic
                  "over": "story", "as": "s",
                  "body": { "kind": "agent",
                            "does": "check {s} acceptance criteria against the code",
                            "produces": "verdict" } } }
    ]
  },
  "end": { "review": "one verdict per story, grouped by epic" }
}
```

The engineer hands this thread to the AI codegen agent. The agent — following the dynamic-workflows
`SKILL.md` and [Appendix A](#appendix-a--codegen-agent-contract) — chooses the primitives, writes the prompts, infers the
schemas, and produces a script like:

```js
export const meta = {
  name: 'verify-jira-stories',
  description: 'Verify every story on a board is implemented per its acceptance criteria',
  phases: ['discover', 'qa'],
}

const boardId = args?.boardId
if (!boardId) throw new Error('boardId required')

phase('discover')
const epics = await agent(`Fetch all epics on Jira board ${boardId}.`, { schema: EPICS })

const withStories = await pipeline(epics.epics, epic =>
  agent(`Fetch all stories in epic ${epic.key}.`, { label: epic.key, phase: 'discover', schema: STORIES })
    .then(r => ({ epic, stories: r.stories })))

phase('qa')
const results = await pipeline(withStories, ews =>
  parallel(ews.stories.map(story => () =>
    agent(
      `Check story ${story.key} acceptance criteria against the code. AC: ${JSON.stringify(story.acceptanceCriteria)}`,
      { label: `${ews.epic.key}/${story.key}`, phase: 'qa', schema: VERDICT },
    ))))

return { board: boardId, epics: epics.epics.length, results: results.flat().filter(Boolean) }
```

The engineer wrote none of that JavaScript. They drew the thread; the agent wrote the mechanism. If
the workflow runtime later renames `pipeline` or adds a primitive, the *thread is unchanged* — the
engineer just regenerates.

> Agents in this workflow fetch from Jira, so they rely on the Atlassian MCP tools being available at
> run time. ThreadForge does not model MCP wiring; the `does` prose names the board/epic/story and the
> agent reaches the tools itself.

---

# 5. Primary User

One user: **me** (the author), and developers like me who think in threads and want to compose Claude
workflows repeatably without learning or tracking the workflow API. It is a personal power tool, not a
team/SaaS product. No multi-tenant, auth, collaboration, or PM surface.

---

# 6. Non-Goals

ThreadForge is **not** a project manager and, as of v3, **not a compiler**. Out of scope:

```text
- generating workflow JavaScript inside the tool (the AI agent does this, via the skill)
- a hand-written IR or code generator that the tool must keep in sync with the runtime API
- requiring the engineer to know workflow primitives or the workflow API reference
- projects, clients, business goals, requirements management, requirement→thread linking
- the v1 dependency edge types, dependency contracts, per-thread-type readiness validators
- execution planner / conflict detection / worktree recommendation engine
- multi-tenant, auth, collaboration, sync
```

---

# 7. Core Concepts

## 7.1 Thread

The unit of work and the tool's source of truth. A thread has a `meta` block, a **begin** node
(optional `args`), a `root` activity tree, and an **end** node (`review`: what "done/validated" means).
One thread → one generated `.js` file.

## 7.2 Activity

A node in the thread tree. Activities map to the four thread types plus `agent`, `loop`, and `call`
(§3). They describe *shape and intent*, never code.

## 7.3 Handoff (data flow, by name)

An activity may declare `produces: "<name>"`. Downstream activities reference that name — in `does`
prose as `{name}`, or in a `fanout`'s `over`. Handoffs are **named at the intent level**; the engineer
does *not* write schemas. The AI infers the concrete JSON schema for each produced value and wires the
fields. This is the deliberate abstraction line: **structure named by the engineer, schema realized by
the AI.**

## 7.4 Codegen agent

The AI that turns a thread into a script. It receives (a) the serialized thread, (b) the
dynamic-workflows `SKILL.md`, and (c) the [Appendix A](#appendix-a--codegen-agent-contract) rules, and returns a plain-JS
workflow. In the MVP the tool *packages the request*; Claude Code runs it (see §9).

## 7.5 Catalog

The local library of threads and their last-generated workflows. It powers reopen/edit, thread-type
templates (§12), and **composition** — a `call` activity picks a workflow from the catalog so one
workflow can invoke another (§13).

---

# 8. Data Model

```ts
type Thread = {
  id: string
  meta: {
    name: string           // kebab-case; becomes the filename
    description: string
    whenToUse?: string
  }
  begin?: { args?: ArgSketch }   // human start node: rough arg names/types, not a strict schema
  root: Activity                 // the topology tree
  end?: { review?: string }      // human end node: what "validated/done" means → guides return shape
  createdAt: string
  updatedAt: string
  schemaVersion: string
}

type Activity =
  | AgentActivity
  | SequenceActivity     // C-thread
  | ParallelActivity     // P-thread
  | FanOutActivity       // B-thread (orchestrate) or F-thread (compare)
  | LoopActivity
  | CallActivity

type AgentActivity = {
  kind: 'agent'
  id: string
  does: string                 // intent in prose; may reference handoffs as {name}
  produces?: string            // names this activity's output for downstream handoffs
  isolationHint?: boolean      // engineer's hint that this mutates files; AI decides worktree
}

type SequenceActivity = {      // C: ordered, with handoff between steps
  kind: 'sequence'
  id: string
  steps: Activity[]
}

type ParallelActivity = {      // P: fixed branches, barrier
  kind: 'parallel'
  id: string
  branches: Activity[]
  barrierReason: string        // why all results are needed together (required, §11)
}

type FanOutActivity = {        // B (orchestrate) / F (compare): per-item work over a list
  kind: 'fanout'
  id: string
  mode: 'orchestrate' | 'compare'
  over: string                 // handoff name of the list to iterate
  as: string                   // item binding name, e.g. "epic"
  body: Activity               // applied per item; may nest further
}

type LoopActivity = {
  kind: 'loop'
  id: string
  body: Activity
  stopCondition: string        // required
  noProgressCondition: string  // required
  maxRounds?: number
}

type CallActivity = {          // thread composition → workflow('<name>', args)
  kind: 'call'
  id: string
  workflowName: string         // from the catalog
  args?: Record<string, string>
}

type ArgSketch = Record<string, string>   // e.g. { boardId: 'string (required)' }
```

The thread serialized to JSON is the **textual thread representation** fed to the codegen agent.

---

# 9. Codegen (delegated, not compiled)

ThreadForge does **not** contain a compiler, IR, or code generator. Generation is a prompt to an AI
agent:

```text
Thread (JSON)  +  dynamic-workflows SKILL.md  +  Appendix A rules
    ↓  packaged as a codegen request
AI codegen agent  (writes the script, chooses primitives, prompts, schemas)
    ↓
.claude/workflows/<meta.name>.js
```

**MVP mechanism — no API keys, no runtime coupling.** The tool produces a ready-to-run *codegen
request*: the serialized thread plus an instruction to apply the dynamic-workflows skill and the
Appendix A rules. The engineer runs this in Claude Code (e.g. paste, or "generate the workflow for this
thread"), and Claude — using the skill — writes the `.js` into `.claude/workflows/`. The generated
script is pulled back into the catalog as this thread's current artifact.

**Why delegate instead of compile:**

* the engineer never learns the workflow API; the *skill*
  ([dynamic-workflows `SKILL.md`](https://github.com/peymanvahidi/awesome-claude-dynamic-workflows/blob/master/dynamic-workflows-skill/SKILL.md))
  is the source of primitive knowledge
* runtime/API evolution is absorbed by regenerating against an updated skill — threads don't change
* the AI writes the soft parts (prompts, schemas) far better than a template ever could

**What the codegen agent is instructed to guarantee** (from `SKILL.md` + Appendix A): a pure-literal
`export const meta`; plain JavaScript only; `pipeline()` as the default fan-out and `parallel()` only
for genuine barriers; explicit `phase` inside fan-outs; `args` read as real structured values;
`isolation: 'worktree'` only for parallel file mutation; no `Date.now()`/`Math.random()`/filesystem/
shell.

**Post-MVP:** optional direct API/SDK call so "Generate" happens in-app; optional round-trip validation
of the returned script (§11). See §17.

---

# 10. UI

## 10.1 Primary editor: thread outline (source of truth)

Threads are **trees** (begin → sequence/fan-out/nesting → agent → end). A collapsible nested **outline**
expresses them clearly and cheaply. Example rendering of the §4 thread:

```text
◇ begin  args: { boardId }
▸ sequence (C)
    ● agent: fetch epics on {boardId}            → produces epics
    ⤨ fanout·orchestrate over epics as epic      (B)
        ● agent: fetch stories in {epic}          → produces stories
    ⤨ fanout·orchestrate over stories as story    (B)
        ⤨ fanout·compare over story as s          (F)
            ● agent: check {s} AC vs code          → produces verdict
◆ end  review: one verdict per story, grouped by epic
```

Outline features:

```text
- add / reorder / delete / collapse activities
- pick an activity kind from the thread-type palette (§3): sequence(C) / parallel(P) /
  fanout·orchestrate(B) / fanout·compare(F) / agent / loop / call
- nest a fanout/loop body (indented subtree)
- per-agent: a single "does" (intent) textarea + optional "produces" name
- handoff picker: reference an upstream `produces` name from a dropdown (in `does` or `over`)
- inline structural validation markers (§11)
```

There is **no per-agent schema editor and no primitive selector** — those are the AI's job.

## 10.2 Begin / End panels

* **Begin:** sketch `args` (names + rough types). Generates nothing itself; guides the AI's arg reads.
* **End:** free-text `review` describing what "done/validated" means; guides the AI's return shape and
  any human-checkpoint split (Appendix A.7 "Human checkpoints").

## 10.3 Generate panel

A "Generate workflow" action that packages the codegen request (§9) and, once Claude returns the
script, shows it read-only (Monaco) with copy/download. The engineer treats this as output to review,
not to edit — edits go to the thread and regenerate.

## 10.4 Catalog

Saved threads and their last-generated workflows. Reopen/edit a thread; browse generated scripts;
select a workflow as the target of a `call` activity (§13). Seeded with thread-type templates (§12).

---

# 11. Validation (structural, on the thread only)

ThreadForge validates the **thread**, not generated JavaScript (the skill + AI own code correctness).
Warn when:

```text
- a handoff reference ({name} or fanout.over) points at a `produces` name that doesn't exist upstream
- a fanout's `over` names a handoff that isn't plausibly a list
- a parallel activity has no barrierReason
- a loop activity is missing stopCondition or noProgressCondition
- a call activity names a workflow not in the catalog
- meta.name is not kebab-case / collides with an existing catalog entry
- the thread has no begin intent or no end review (both human nodes should exist)
- estimated agent count may exceed practical limits (concurrency ~16 / total 1000)
```

Post-MVP optional: after codegen, lint the returned `.js` against the Appendix A rules as a safety net
(§17) — but the primary contract is that the skill produces conformant code.

---

# 12. Thread-Type Templates

Seed the catalog with skeleton threads for the canonical thread types and the well-known workflow
patterns, so the engineer starts from a shape, not a blank canvas:

```text
Thread types (from thread-based engineering):
- C  sequential:            begin → agent → agent → end
- P  parallel + barrier:    begin → parallel[ agent, agent, agent ] → end
- B  nested orchestration:  begin → fanout·orchestrate over list → (sub-thread) → end
- F  fan-out comparative:   begin → fanout·compare over agents → judge → end

Pattern shapes (from the dynamic-workflows skill/guide):
- inspect → implement → verify (C)
- fan-out and synthesize (B → barrier)
- pipeline over discovered items (agent → B)
- adversarial verification: produce → refute → keep survivors (F)
- generate and filter
- tournament (F + bracket)
- loop until done (loop)
```

Each template is a `Thread` with placeholder `does` prose and pre-named handoffs.

---

# 13. Catalog & Composition (call one workflow from another)

The catalog is also the **workflow registry** for composition. A `call` activity references a
cataloged workflow by `meta.name`; the codegen agent compiles it to `workflow('<name>', args)`, letting
one workflow invoke another (the skill's `workflow()` primitive; nesting is one level deep).

```text
- browse cataloged workflows (name, description, whenToUse, args sketch)
- drop a `call` activity into a thread and pick the target from the catalog
- the AI wires workflow('<name>', { ...args }) with args mapped from the enclosing thread
```

This makes the catalog the reuse surface: build small threads once, then call them from larger ones.

---

# 14. Persistence

```text
MVP: IndexedDB (thread catalog + last-generated scripts), LocalStorage fallback, JSON import/export
Export: the thread JSON; and the generated <meta.name>.js (plus optional starter args.json)
```

No cloud, no auth, no sync.

---

# 15. Technical Architecture

```text
Next.js (or Vite) + TypeScript + React
Tailwind + a lightweight component kit
Zustand for editor state
Monaco for the read-only generated-script view
```

Package boundaries (framework-independent core):

```text
thread-model        // Thread / Activity / handoff types + tree operations
thread-serialize    // Thread → textual (JSON) representation for the codegen agent
thread-validate     // structural validation (§11)
codegen-request     // assemble { thread, SKILL.md ref, Appendix A rules } into a codegen prompt
                    //   (MVP: emit a Claude Code request; post-MVP: call the API/SDK)
ui-outline          // the thread outline editor + begin/end panels
ui-catalog          // catalog, templates, composition picker, generated-script preview
```

Rules:

* **there is no `workflow-compiler` / `workflow-ir` package** — codegen is delegated to the AI.
* the model, serializer, and validation must not depend on any UI library.
* the tool must not embed knowledge of workflow primitives beyond what it passes through to the skill;
  the **skill is the single source of truth** for how threads become code.

---

# 16. MVP Scope

A weekend-or-two build:

1. Thread outline editor with the activity palette: `agent`, `sequence`(C), `parallel`(P),
   `fanout`(orchestrate=B / compare=F), `loop`, `call`.
2. Per-agent single `does` (intent) field + optional `produces` name. No schema editor.
3. Handoff picker: reference an upstream `produces` name in `does` and in `fanout.over`.
4. Begin panel (args sketch) + End panel (review text).
5. Structural validation (§11).
6. Generate: package the codegen request (thread + skill + Appendix A rules), run it via Claude Code,
   and show the returned `.js` read-only with copy/download.
7. Local catalog with save/reopen, seeded with thread-type + pattern templates (§12), and `call`-based
   composition (§13).

The MVP is proven when the §4 Jira thread is drawn once, handed to the AI, and the AI produces a
correct, runnable workflow — and I reach for drawing threads instead of hand-writing scripts or
free-prompting Claude.

---

# 17. Acceptance Criteria

The tool is complete (for MVP) when:

1. I can create a thread and edit its `meta`, `begin` args, and `end` review.
2. I can build the thread tree from the activity palette, including `sequence`, `parallel`, and both
   `fanout` modes.
3. I can build a two-level nested fan-out (the §4 shape) entirely as a thread, writing no code.
4. I can give an `agent` activity a `does` intent and a `produces` name.
5. I can wire a downstream activity to an upstream `produces` name via the handoff picker.
6. I can sketch `args` in the begin node and reference them in `does`.
7. Structural validation flags dangling handoffs, non-list fan-out targets, barrier-less parallels,
   loops missing stop/no-progress conditions, and unknown `call` targets.
8. "Generate" packages the thread + dynamic-workflows skill + Appendix A rules into a codegen request.
9. Running that request in Claude Code produces a plain-JS workflow that starts with a pure-literal
   `export const meta` and uses `agent()`/`pipeline()`/`parallel()`/`phase()`/`log()` per the skill
   and [Appendix A](#appendix-a--codegen-agent-contract).
10. The §4 Jira thread generates a workflow that compiles-by-hand-inspection to the expected topology,
    exports into a `.claude/workflows/`-compatible shape, and runs in Claude Code.
11. I can add a `call` activity referencing a cataloged workflow, and the generated script invokes it
    via `workflow()`.
12. Saved threads reopen, and regenerating a thread produces an equivalent workflow (topology-stable
    even if prose/schemas differ run to run).

---

# 18. Post-MVP (only if I keep reaching for it)

```text
- in-app "Generate" via direct Claude API/SDK call (no manual paste)
- round-trip validation: lint the AI-returned script against the Appendix A rules as a safety net
- read-only graph visualization of the thread tree
- richer catalog: versioned generated scripts, diff a regeneration against the previous script
- deeper composition: multi-level workflow() nesting where the runtime allows
- args presets per thread; direct write into a repo's .claude/workflows/
- more templates harvested from real usage
```

---

# Appendix A — Codegen Agent Contract

This appendix is the **contract the AI codegen agent must satisfy** when turning a thread into a
workflow `.js`. It is deliberately stable. The dynamic-workflows `SKILL.md` is the *authoritative and
evolving* source for how the primitives behave; where the skill and this appendix ever diverge, the
skill wins and this appendix should be updated. ThreadForge passes both to the agent at generation
time (§9). The tool must **not** re-implement these rules as a compiler — they exist so the agent's
output is checkable and so a human can review a generated script.

## A.1 References the builder (and the agent) should study

These are the primary sources; the two starred (★) are the load-bearing ones — the thread model the
engineer authors in, and the skill the codegen agent generates from.

```text
1. ★ Thread-Based Engineering guide — the source model. Threads as units of agent-driven work,
     the two mandatory human nodes (begin/end), and the C/P/B/F thread types this tool's palette maps to.
     https://claudefa.st/blog/guide/mechanics/thread-based-engineering

2. ★ Awesome Claude Dynamic Workflows — dynamic-workflows-skill/SKILL.md  (AUTHORITATIVE for codegen)
     The practical authoring rules the agent follows: agent(), pipeline(), parallel(), phase(), log(),
     workflow(), schema usage, worktree isolation, args, budget handling, orchestration patterns.
     https://github.com/peymanvahidi/awesome-claude-dynamic-workflows/blob/master/dynamic-workflows-skill/SKILL.md
     (repo: https://github.com/peymanvahidi/awesome-claude-dynamic-workflows)

3. Dynamic Workflows guide — when to use a workflow (scale / parallelization / verification; NOT
     two-line fixes) and higher-level patterns: adversarial verification, fan-out-and-synthesize,
     classify-and-act, generate-and-filter, tournament, loop-until-done. Establishes the framing that
     "workflows operate as an orchestration layer beneath thread-based engineering."
     https://claudefa.st/blog/guide/development/dynamic-workflows
     (see "When not to use a workflow": https://claudefa.st/blog/guide/development/dynamic-workflows#when-not-to-use-a-workflow)

4. Claude Code dynamic-workflows documentation — how saved workflows behave, how scripts live under
     .claude/workflows/, and runtime constraints: no normal mid-run user input, no direct
     filesystem/shell access from the script, a concurrency cap, a total-agent cap.

5. Claude Agent SDK (TypeScript) reference — workflow helper APIs and execution behavior.
```

## A.2 Output rules — plain JavaScript only

The generated workflow body must be **plain JavaScript**, never TypeScript, even though the tool itself
is written in TypeScript. The script must not contain:

```text
- TypeScript type annotations, interfaces, or generics
- imports from Node.js, or any module import
- direct filesystem access or direct shell access
- Date.now(), Math.random(), or new Date() without arguments
```

The workflow script only *coordinates* agents; the agents perform the repository work. Files must be
named `.claude/workflows/<meta.name>.js` (extension `.js`, never `.ts`).

## A.3 Required workflow shape — pure-literal `meta`

Every generated script must begin with a **pure literal** `meta` object — no variables, function calls,
spreads, or template interpolation:

```js
export const meta = {
  name: 'audit-routes',          // required; kebab-case; matches the filename
  description: 'Audit every route handler for missing auth checks',  // required
  whenToUse: '...',              // optional
  phases: ['discover', 'audit'], // optional; if phase() is used, titles must match exactly
}
```

## A.4 Primitives and how thread activities map to them

The primitive signatures and options (`agent`, `pipeline`, `parallel`, `phase`, `log`, `workflow`) are
**not restated here** — the [dynamic-workflows `SKILL.md`](https://github.com/peymanvahidi/awesome-claude-dynamic-workflows/blob/master/dynamic-workflows-skill/SKILL.md)
is the authoritative, evolving reference and the tool passes it to the agent at generation time. This
spec only records the mapping and the rules specific to ThreadForge; inline API detail appears solely
in the §4 example.

Thread activity → primitive (see §3 for the full table): `agent`→`agent()`, `sequence`→sequential
`await`s / `pipeline()` stages, `parallel`→`parallel()`, `fanout`→`pipeline()` or `parallel()` by mode,
`loop`→a bounded `while`, `call`→`workflow()`.

Rules the agent must honor (ThreadForge-specific; everything else defers to the skill):

* **`pipeline()` is the default fan-out**; use `parallel()` only for a genuine barrier (a later step
  needs all prior results at once) — never merely because the code reads more cleanly. A ThreadForge
  `parallel` activity carries a `barrierReason`; the agent should honor and reflect it.
* Prefer a **schema** whenever a downstream activity references an upstream `produces` handoff — this
  is what makes the handoff reliable. The engineer names the handoff; the agent infers the schema.
* Inside a fan-out, always set an explicit **`phase`** in the `agent()` options.

## A.5 Args handling

Generated workflows may read the global `args`. Read arg values as **real structured values** — never
stringify an array/object into a prompt or call:

```js
const targetPath = args?.targetPath || 'src/routes'
```

ThreadForge's begin-node args sketch (§8) guides these reads and an optional starter `args.json`
(structured JSON, not stringified).

## A.6 Worktree isolation

The agent may add `isolation: 'worktree'` to an `agent()` call **only** when all of the following hold:

```text
- multiple agents edit files in parallel
- the target files may overlap
- the change is large or risky, or the engineer explicitly asked for isolated parallel execution
```

Never use worktree isolation for read-only audits. A ThreadForge `agent` activity may set
`isolationHint: true`; the agent treats it as a signal, not a mandate.

## A.7 Human checkpoints — split, don't pause

Generated workflows must **not depend on normal mid-run human input.** If a thread needs human review
between phases (approve a plan before applying it), it must be modeled as **two threads → two
workflows**, with the human checkpoint between them:

```text
design-database-migration.js   →   [human reviews & approves]   →   apply-database-migration.js
```

The engineer models this split at the thread layer (two threads in the catalog, the second `call`ing
or following the first); the agent must never emit a script that blocks waiting for a human.

## A.8 What structural validation still checks (tool side)

Validation runs on the **thread**, not the generated JS (§11). The tool does not compile or lint the
script in the MVP; if a post-MVP safety-net linter is added, it checks the returned `.js` against A.2–A.6
above. The primary contract remains: **the skill + this appendix make the agent produce conformant
code, and a human can review it.**
