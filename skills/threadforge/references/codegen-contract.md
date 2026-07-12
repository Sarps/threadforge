# ThreadForge Codegen Contract

The rules the codegen agent must satisfy when turning a validated thread into a Claude workflow
script. The runtime's own dynamic-workflows documentation (the `Workflow` tool description /
dynamic-workflows skill available in your session) is the **authoritative and evolving** source for
primitive signatures and behavior; where it and this contract diverge, the runtime documentation wins.
This contract adds only what is ThreadForge-specific.

## C1. Output — plain JavaScript only

The generated script must be plain JavaScript, never TypeScript. It must not contain:

- TypeScript type annotations, interfaces, or generics
- module imports of any kind (no Node.js APIs)
- direct filesystem or shell access — the script only *coordinates* agents; agents do the repo work
- `Date.now()`, `Math.random()`, or argless `new Date()` (they break workflow resume)

File path: `.claude/workflows/<meta.name>.js` — extension `.js`, never `.ts`. `meta.name` must equal
the thread's `meta.name`.

## C2. Required shape — pure-literal `meta`

The script begins with a pure-literal `export const meta` — no variables, calls, spreads, or template
interpolation:

```js
export const meta = {
    name: 'verify-jira-stories',          // = thread meta.name = filename
    description: '...',                    // = thread meta.description
    whenToUse: '...',                      // from the thread, if present
    phases: [{title: 'Discover'}, {title: 'Verify'}],  // if phase() is used, titles match exactly
}
```

If the thread pins `meta.phases`, copy its titles (and details) **verbatim** — the same titles in the
script's `meta.phases` and its `phase()` calls, in the same order. Regen must not rename pinned
phases. If the thread omits `meta.phases`, choose phases yourself.

## C3. Activity → primitive mapping

| Thread activity                          | Compiles to                                                                                          |
|------------------------------------------|------------------------------------------------------------------------------------------------------|
| `agent`                                  | `agent(prompt, opts)` — `agentType` passes through as `opts.agentType`                               |
| `transform`                              | plain JavaScript between awaits — never an `agent()` call, never LLM work; the `does` prose is the exact spec (grouping key, chunk size, fallback order) and is implemented literally |
| `sequence`                               | sequential `await`s, or `pipeline()` stages when the sequence is a fanout body                       |
| `parallel`                               | `parallel([...])` — only because the thread declared a barrier                                       |
| `fanout` mode `orchestrate`              | `pipeline(list, item => ...)`, nesting as the body nests                                             |
| `fanout` orchestrate + `ordering: "sequential"` | a `for...of` over the list, awaiting each item before the next — the `orderingReason` becomes the code comment |
| `fanout` mode `compare`                  | `parallel(Array.from({length: N}, ...))` + the downstream judge                                      |
| `loop`                                   | a bounded `while` honoring `stopCondition`, `noProgressCondition`, `maxRounds`                       |
| `call`                                   | `workflow('<workflowName>', args)` (nesting is one level — a called workflow must not itself `call`) |
| any activity with `when`                 | a plain `if` around the compiled activity — skipped work is surfaced in the return value (a count, a `skipped:` note), never silent |

Rules:

- **`pipeline()` is the default fan-out.** Use `parallel()` only for (a) a thread `parallel` activity
  — its `barrierReason` is your justification; reflect it in a comment — or (b) a `compare` fanout,
  where the judge genuinely needs all attempts at once. Never use a barrier because the code reads
  more cleanly.
- Inside any fan-out body, set an explicit `phase` in `agent()` options (the global `phase()` state
  races inside `pipeline()`/`parallel()`).
- `pipeline()`/`parallel()` results can contain `null` (skipped/failed agents) — `.filter(Boolean)`
  before use, and make per-item failure visible in the return value rather than silently dropped.
- Deterministic derivation never migrates into an agent prompt: if you find yourself asking an LLM
  to group, chunk, dedupe, or coalesce, the thread should carry a `transform` — flag the gap to the
  engineer instead of compiling it into a prompt.

## C4. Handoffs → schemas

Every thread handoff (`produces` consumed downstream via `{name}` or `fanout.over`) must be realized
as a **JSON schema** on the producing `agent()` call. The engineer named the handoff; you infer the
fields the downstream prompts actually need — no more. A `produces` that nothing consumes may stay
unstructured text.

`{name}` references in `does` prose become real interpolations of the structured value's relevant
fields — never `JSON.stringify` an entire object into a prompt when specific fields are what the
downstream agent needs (an id, a title, a list of criteria). A dotted reference (`{scout.slug}`, or
`over: "scout.sections"`) addresses a field of the handoff directly — the producing agent's schema
must carry every field so referenced.

**Collection semantics.** A `produces` declared inside a fanout body and referenced outside the
fanout compiles to the **collected array** of per-item outputs (`.filter(Boolean)` applied, per-item
failures surfaced in the return value). A `produces` declared inside a loop body and referenced
after the loop compiles to the **last completed round's** value.

## C5. Args

Read `args` as real structured values, with the thread's `begin.args` sketch deciding which are
required:

```js
const boardId = args?.boardId
if (!boardId) throw new Error('boardId required')
const targetPath = args?.targetPath || 'src'
```

Never require args the thread doesn't sketch; never ignore ones it marks required.

**Fallback idiom.** An activity producing the same name as an optional arg, guarded by a `when` on
that arg's absence, compiles to a coalesce — the arg when given, else the computed value:

```js
let flows = Array.isArray(args?.flows) && args.flows.length ? args.flows : null
if (!flows) {
  const loaded = await agent(/* the fallback producer */)
  flows = loaded?.flows ?? []
}
if (!flows.length) throw new Error('no flows — pass args.flows or ensure the report exists on disk')
```

## C6. Prompts

The thread's `does` is intent, not the prompt. Expand it into a self-contained subagent prompt:
what to do, where to look, what evidence counts, and what to return (matching the schema). Subagents
have no conversation context — the prompt must carry everything, including relevant values from
in-scope handoffs, plus the agent's `rules` payload if it has one (C12).

## C7. Worktree isolation

Add `isolation: 'worktree'` to an `agent()` call only when **all** hold: multiple agents edit files
concurrently; their target files may overlap; the change is substantial or the thread's
`isolationHint` is set. Never for read-only work. `isolationHint: true` is a signal, not a mandate —
a hinted agent that runs alone needs no worktree.

## C8. Human checkpoints — split, don't pause

A workflow must never block waiting for a human. If the thread's `end.review` implies a decision that
feeds later automated work (approve a plan, then apply it), that is **two threads → two workflows**
with the human between them — tell the engineer to split rather than emitting a pausing script. The
begin/end nodes are outside the script: begin = the engineer invoking with args; end = the return
value shaped so the engineer can perform the review described in `end.review`.

## C9. Return shape

The return value is the artifact the engineer reviews. Shape it directly from `end.review` — if the
review is "one verdict per story, grouped by epic", return exactly that structure, plus enough counts
(`discovered`, `checked`, `skipped`) to notice silent gaps. `log()` progress at phase boundaries and
whenever coverage is bounded (top-N, sampling), so truncation is never silent. When a discovery step
finds nothing to work on, return a structured error object (what was searched, the query used)
rather than throwing — the engineer's review starts from the return value.

## C10. Scale honestly

Respect runtime caps (concurrency ~16 per workflow, 1000 agents total, 4096 items per fan-out call).
For nested fan-outs whose item counts multiply, keep per-item work in one agent where reasonable, and
surface dropped work via `log()` — never bound coverage silently.

## C11. Constants — engineer-owned data, copied verbatim

Each `begin.constants` entry compiles to a top-level `const <name> = <value>` with the JSON value
reproduced **byte-for-byte** — never re-typed, summarized, reordered, or "cleaned up". The thread is
the single source of truth for this data; regen must round-trip it exactly. A constant array used as
`fanout.over` is iterated directly; a constant map is indexed with in-scope bindings (e.g.
`orthography[locale]`). Interpolate the specific entries a prompt needs — never `JSON.stringify` a
whole table into a prompt (C4 applies to constants too).

## C12. Rules — engineer-owned prompt payload, woven verbatim

An agent's `rules` string is appended to its generated prompt **verbatim**, after the task-specific
body — these are hard-won standing orders (hands-off policy, stage boundaries, orthography
requirements), not prose to improve. `{name}` references inside it become real interpolations, like
in `does`. When several agents carry byte-identical `rules` text, hoist it into ONE shared top-level
`const` and interpolate it into each prompt — the thread tolerates the duplication; the script must
not. Derived prompts codegen invents for the same activity (retry, kickback-fix, loop-continuation
prompts) carry the same rules. Never paraphrase, trim, or merge rules; never attach rules to an
agent whose thread node doesn't carry them. Repo-wide conventions do not belong here — agents
already receive the target repo's CLAUDE.md; if the thread's rules duplicate it, tell the engineer
during the interview, don't compile the duplicate.

## C13. Repeated subtrees — hoist one helper

When the thread repeats a structurally identical subtree in two or more places (same shape, same
`rules`, same `agentType`s, differing only in interpolated values — e.g. an implement → QA-gate →
ship gate under both a foundation branch and a per-flow fanout body), compile it as ONE shared
`async function` and call it from each site with the differing values as parameters. The thread
tolerates the duplication (it has no fragment construct by design — the diagram should show every
occurrence); the script must not. Same spirit as C12's rules hoisting.
