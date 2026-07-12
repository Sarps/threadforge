# Product Specification Document (v4)

## Product Name

**ThreadForge**

## Feature Name

**A Distributable Agent Skill that Captures Thread Topology, Renders It, and Delegates Workflow
Generation to the Agent**

> **v4 note.** This supersedes v3. v3 got the abstraction right — the engineer owns topology, the AI
> owns mechanism — but wrapped it in a web application (Next.js, outline editor, Monaco, IndexedDB)
> that added a browser round-trip to a terminal-native loop and delivered the least value per unit of
> effort. v4 deletes the app. **ThreadForge is now an agent skill plus a file convention**,
> distributed via the [`skills` CLI](https://www.npmjs.com/package/skills) so anyone can install it
> into any project with one command. The four jobs the app was meant to do are done better without it:
>
> | Job | v3 (app) | v4 (skill) |
> | --- | --- | --- |
> | guard against vague prompting | form fields | **elicitation protocol + deterministic validator that refuses codegen on errors** |
> | see the workflow without reading JS | canvas/outline UI | **generated Mermaid diagram, a pure projection of the thread** |
> | start from templates | seeded IndexedDB catalog | **template `.thread.json` files shipped inside the skill** |
> | reuse workflows in others | in-app registry | **`call` activity + the `.claude/workflows/` directory as the registry** |
>
> The thread JSON model, the validation rules, and the codegen contract survive from v3 nearly
> intact — they were always the product. Appendix A now ships as a file inside the skill
> (`references/codegen-contract.md`) so it travels with every install.

---

# 1. Product Summary

ThreadForge lets an engineer capture a piece of engineering work as a **thread** — a small JSON tree
of activities with mandatory human begin and end nodes — and turns it into a runnable Claude
dynamic-workflow script. The engineer never writes, reads, or maintains workflow JavaScript; their
artifact is the thread, reviewed as a generated diagram.

It ships as a **skill repository**, installable into any project:

```bash
npx skills add Sarps/threadforge        # installs into .claude/skills/ (and 60+ other agents)
```

The loop, entirely inside the coding agent:

```text
"make me a workflow that ..."                        (engineer, in prose)
    ↓  skill: pick nearest template, INTERVIEW until topology/handoffs/conditions are pinned
threads/<name>.thread.json                           (source of truth, git-versioned)
    ↓  skill: validate (deterministic script — errors block progress)
    ↓  skill: render   (deterministic script — Mermaid diagram)
threads/<name>.md                                    (the review surface — engineer approves HERE)
    ↓  skill: codegen per the contract + the runtime's own dynamic-workflows docs
.claude/workflows/<name>.js                          (regenerable artifact)
    ↓
Claude Code executes it
```

The dividing line is unchanged from v3 and is the whole idea:

| The engineer owns (strategy) | The agent owns (mechanism) |
| ---------------------------- | -------------------------- |
| topology — sequence / parallel / fan-out / nesting / loop | `pipeline()` vs `parallel()` choice |
| what each activity is *for* (intent, in prose) | the exact prompt wording sent to each subagent |
| named handoffs ("this produces `epics`") | the JSON schemas that make handoffs structured |
| where a human must start and validate | args reads, guards, `phase()`, `log()`, return shape |
| which cataloged workflows to reuse | `workflow()` composition wiring |

---

# 2. Problem Statement

Four problems, in priority order:

1. **Vague prompting.** "Build me a workflow" in free prose lets the agent guess the topology,
   mis-nest fan-outs, and mis-wire which output feeds which step. The fix is not a form — it is a
   contract that can *fail*: a thread schema whose required fields (fanout `over`, parallel
   `barrierReason`, loop stop conditions, resolvable handoff names) are exactly the things vague
   prompts leave unsaid, an interview protocol that extracts them, and a validator that blocks
   codegen until they resolve.
2. **Opacity of generated scripts.** The engineer should understand their workflow without reading
   JavaScript. Fix: every thread renders to a Mermaid diagram by a *deterministic* script — a pure
   projection that cannot drift from the thread, viewable on GitHub, in IDEs, anywhere.
3. **Blank-canvas cost.** Most real workflows are instances of a dozen shapes. Fix: templates as
   thread files shipped in the skill.
4. **No reuse surface.** Workflows should compose. Fix: the `call` activity compiles to the
   runtime's `workflow('<name>', args)`; the registry is the `.claude/workflows/` directory that
   already exists, plus `threads/` for the intent behind each script.

What the thread pins down (structure — what free-prompting gets wrong): topology, handoffs, human
boundaries, stop conditions. What stays soft and is delegated (mechanism): prompts, schemas, every
workflow primitive and API detail.

---

# 3. Threads (the source model)

From thread-based engineering (https://claudefa.st/blog/guide/mechanics/thread-based-engineering):
a thread is a unit of engineering work over time, bounded by two mandatory human nodes — **begin**
(the engineer provides intent and args) and **end** (the engineer reviews against stated criteria) —
with agent activity in between. Threads compose in four canonical shapes; the activity palette is
exactly these plus three structural helpers:

| Thread type | Shape | Activity | Typically compiles to |
| ----------- | ----- | -------- | --------------------- |
| **C** — chained/sequential | phases in order, handoff between | `sequence` | sequential `await`s / `pipeline()` stages |
| **P** — parallel | fixed branches, then a barrier | `parallel` (requires `barrierReason`) | `parallel([...])` |
| **B** — nested/orchestrated | per-item work over a list | `fanout` mode `orchestrate` | `pipeline(list, item => ...)` |
| **F** — fan-out comparative | N attempts at the same work, judged | `fanout` mode `compare` (+ `agents`) | `parallel([...])` + judge |
| — | atomic unit of agent work | `agent` (`does`, optional `produces`) | `agent()` |
| — | repeat until done | `loop` (requires `stopCondition` + `noProgressCondition`) | bounded `while` |
| — | invoke a cataloged workflow | `call` (`workflowName`) | `workflow('<name>', args)` |

---

# 4. Data Model

The normative schema is `skills/threadforge/references/thread-schema.json` (JSON Schema 2020-12).
Informal shape:

```ts
type Thread = {
  schemaVersion: '1'
  meta: { name: string /* kebab-case; the filename */; description: string; whenToUse?: string }
  begin?: { args?: Record<string, string> /* name -> rough type sketch */; intent?: string }
  root: Activity
  end: { review: string /* what "done/validated" means; drives the return shape */ }
}

type Activity =
  | { kind: 'agent'; does: string; produces?: string; isolationHint?: boolean }
  | { kind: 'sequence'; steps: Activity[] }
  | { kind: 'parallel'; branches: Activity[]; barrierReason: string }        // required
  | { kind: 'fanout'; mode: 'orchestrate' | 'compare'; over: string; as: string
      agents?: number /* compare only */; body: Activity }
  | { kind: 'loop'; body: Activity; stopCondition: string; noProgressCondition: string  // both required
      maxRounds?: number }
  | { kind: 'call'; workflowName: string; args?: Record<string, string>; produces?: string }
```

Changes from v3: no `id`/`createdAt`/`updatedAt` (files + git provide identity and history); `end`
is mandatory (a thread without review criteria is a vague thread); compare fanouts may pin their
attempt count via `agents`; `call` may name its return via `produces`. Handoff scoping: a name is in
scope for an activity if it is a begin arg, a `produces` anywhere in an *earlier sibling's* subtree
(at any ancestor level), or an enclosing fanout's `as` binding. Parallel branches cannot see each
other's outputs (they are concurrent).

---

# 5. The Elicitation Protocol (guarding against vagueness)

Defined normatively in `skills/threadforge/SKILL.md`. The protocol:

1. **Template first** — match the request to the nearest shipped template; never start from a blank
   tree.
2. **Interview** — fill what the user already said; ask targeted questions for the rest. The
   non-negotiables are precisely the schema's required fields: fanout's exact list; parallel's
   barrier justification (no defensible reason → restructure, don't decorate); loop's stop and
   no-progress conditions; resolvable handoff names; concrete begin args and end review. Mid-run
   human decisions split into two threads (see §10 / contract C8). Reuse is checked before new work
   is drawn.
3. **Validate** — `scripts/validate-thread.mjs`, deterministic, no dependencies. Errors block;
   the agent must resolve them **by asking, not guessing**.
4. **Approve** — the engineer approves the rendered diagram, not JSON, not code. No codegen before
   an explicit yes.
5. **Codegen** — per the contract (§10), grounded by the worked example.
6. **Close** — artifacts recorded; future edits go thread-first, then regen.

The two hardest guarantees, stated as invariants:

- **No workflow JavaScript is ever written from a thread that has validation errors or an
  unapproved diagram.**
- **No validation error is ever resolved by the agent guessing.**

---

# 6. Validation (deterministic, thread-only)

`scripts/validate-thread.mjs` — plain Node, zero dependencies, exit 1 on errors. It validates the
thread, never generated JS. Errors (block codegen):

```text
- malformed shape (unknown kinds, missing required fields, non-kebab meta.name)
- a handoff reference ({name} in does / call args, or fanout.over) that nothing in scope produces
  (the message lists what IS in scope — typo repair is one glance)
- parallel without barrierReason, or with fewer than two branches
- loop missing stopCondition or noProgressCondition
- missing end.review
```

Warnings (surfaced, don't block):

```text
- orchestrate fanout over a name that doesn't read as a list
- compare fanout without a pinned agent count
- duplicate produces names; args shadowed by produces
- call target not present in .claude/workflows/ (composition order — generate the callee first)
- meta.name colliding with an existing generated workflow
- fan-outs nested 3+ deep (agent counts multiply; runtime caps ~16 concurrent / 1000 total)
- missing begin node; single-step sequences
```

---

# 7. Visualization (deterministic, generated, never hand-drawn)

`scripts/render-thread.mjs` — thread → Mermaid flowchart; `--doc` emits the full
`threads/<name>.md` (diagram + handoff table + human nodes + artifact pointer). Mapping: agents are
boxes (⚙, with `→ produces` shown), fanouts/loops/parallels are labeled subgraphs (⤨ / ↻ / ∥ with
the barrier reason inline), `call` is a subroutine box (⇢), begin/end are dashed stadium nodes
(◇/◆). Because the diagram is a pure function of the thread, it is the trusted review surface:
the engineer approves the diagram, and "show me what this workflow does" is answered by rendering,
never by pasting JavaScript. Existing hand-written workflows enter the system via **decompile**
(script → thread → diagram; flagged for review).

---

# 8. Templates

Shipped inside the skill (`templates/*.thread.json`), all schema-valid, placeholders in
`<angle brackets>`:

```text
Thread types:            c-sequential, p-parallel-barrier, b-nested-orchestration, f-fanout-compare
Workflow patterns:       inspect-implement-verify, fanout-and-synthesize, adversarial-verification,
                         generate-and-filter, tournament, loop-until-done
```

Harvesting is `cp`: any real thread that proves reusable gets its values re-placeholder-ed and
committed as a new template.

---

# 9. Catalog & Composition

The catalog **is the filesystem**: `threads/` holds intent, `.claude/workflows/` holds artifacts,
git holds history. A `call` activity references a workflow by `meta.name`; codegen compiles it to
`workflow('<name>', args)` (runtime nesting: one level). During elicitation the skill scans both
directories and proposes `call` over redefinition when an existing workflow covers a step. The
validator warns when a `call` targets a workflow that doesn't exist yet, which also enforces
generation order for compositions.

---

# 10. Codegen Contract

Ships as `skills/threadforge/references/codegen-contract.md` (normative copy), grounded by
`references/worked-example.md` (the §12 Jira thread with its rendered diagram and generated script).
Summary of the rules — the runtime's own dynamic-workflows documentation is authoritative over all
of them if they ever diverge:

```text
C1  plain JS only; no imports, no fs/shell, no Date.now()/Math.random()/argless new Date()
C2  pure-literal export const meta; meta.name = thread name = filename
C3  activity→primitive mapping; pipeline() is the default fan-out; parallel() only for declared
    barriers (thread parallel / compare judge); explicit phase inside fan-outs; filter(Boolean)
C4  every consumed handoff gets an inferred JSON schema; interpolate fields, not JSON.stringify blobs
C5  args read as real structured values; required per the begin sketch
C6  'does' is intent — expand to self-contained subagent prompts
C7  worktree isolation only for overlapping parallel file mutation; isolationHint is a signal
C8  human checkpoints split into two threads; a workflow never pauses for input
C9  return shape derived from end.review, with counts so gaps are visible; log() at boundaries
C10 respect runtime caps; never bound coverage silently
```

---

# 11. Distribution

The repo is a standard `skills`-CLI skill repository:

```text
threadforge/
  README.md
  LICENSE
  docs/spec.md                          # this document
  skills/
    threadforge/
      SKILL.md                          # the protocol (frontmatter: name + description)
      scripts/validate-thread.mjs       # deterministic gate
      scripts/render-thread.mjs         # deterministic view
      references/thread-schema.json     # normative thread schema
      references/codegen-contract.md    # normative codegen rules
      references/worked-example.md      # canonical thread→diagram→script chain
      templates/*.thread.json           # 10 starting shapes
```

Install: `npx skills add Sarps/threadforge` (project) or `-g` (global); works for Claude Code and
every agent the CLI supports. Update: `npx skills update threadforge`. The skill's supporting files
travel with the install, so validator, renderer, templates, and contract are always version-matched
to the protocol.

**Compatibility note:** thread authoring, validation, and rendering work in any agent that loads
skills. *Executing* the generated script requires an agent with the dynamic-workflows runtime
(Claude Code). The scripts require only Node ≥ 16, already present wherever `npx` ran.

---

# 12. Motivating Example

Unchanged in spirit from v3, now a shipped artifact: `references/worked-example.md` carries the
`verify-jira-stories` thread (fetch epics → per-epic fetch stories → per-story 3-verifier majority
vote), its rendered diagram, and the generated workflow, with each codegen decision annotated
against the contract. Agents in that workflow reach Jira via MCP tools at run time; ThreadForge does
not model MCP wiring — the `does` prose names the board and the agents reach the tools themselves.

---

# 13. Non-Goals

```text
- a web app, canvas editor, or any GUI (v3's central mistake; revisit only per §16)
- a compiler/IR the tool must keep in sync with the runtime API (v2's central mistake)
- validating or linting generated JavaScript (the runtime docs + contract own code correctness;
  the skill only syntax-checks)
- Mermaid as the source of truth (it's a projection; it cannot fail validation, so it cannot guard)
- projects, clients, requirements management, multi-tenant, auth, collaboration, sync
- an npm package of ThreadForge itself — the `skills` CLI is the distribution channel
```

---

# 14. Acceptance Criteria

1. `npx skills add <path-or-repo>` discovers and installs the `threadforge` skill.
2. Asking for a workflow in prose triggers the protocol: template selection, an interview that asks
   for (at minimum) any missing fanout list, barrier reason, loop conditions, and end review.
3. The interview writes `threads/<name>.thread.json` conforming to `thread-schema.json`.
4. `validate-thread.mjs` exits 1 on: dangling handoffs, barrier-less parallels, condition-less
   loops, missing end review, unknown kinds — and its dangling-handoff message names what is in scope.
5. `render-thread.mjs --doc` produces valid Mermaid for nested fan-outs (the §12 two-level shape),
   loops, parallels, and calls; the diagram is shown and approved before any codegen.
6. No `.js` is written while the thread has validation errors or the diagram is unapproved.
7. Generated scripts satisfy the contract: pure-literal meta, plain JS, pipeline-default,
   schema-realized handoffs, structured args, no pausing for humans; they syntax-check.
8. The §12 thread generates a workflow whose topology matches by inspection and runs in Claude Code.
9. A `call` activity to a cataloged workflow compiles to `workflow('<name>', ...)`; calling a
   non-existent workflow is warned at validation time.
10. All 10 shipped templates validate with zero errors.
11. Editing a thread and regenerating updates diagram and script; hand-editing the generated JS is
    warned against by the protocol.
12. Decompile recovers a validating thread + diagram from the worked example's script.

---

# 15. Verified at Build Time

Criteria 3, 4, 5, 7 (syntax check), and 10 were verified during initial implementation: the worked
example validates clean and renders; a deliberately vague thread fails with 8 errors naming each
missing commitment; all templates validate; the example workflow body parses.

---

# 16. Post-MVP (only if real usage demands it)

```text
- versioned regeneration diffs (thread unchanged, skill updated → diff the two scripts)
- a static single-file HTML viewer for thread JSON (drag-drop; only if Mermaid-in-markdown proves
  insufficient — this is the ONLY door back toward a UI, and it stays read-only)
- richer decompile (round-trip fidelity report)
- template packs per domain (release engineering, research, migrations)
- a linter for generated scripts against C1–C7 as a safety net
```
