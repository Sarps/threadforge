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
  phases: [{ title: 'Discover' }, { title: 'Verify' }],  // if phase() is used, titles match exactly
}
```

## C3. Activity → primitive mapping

| Thread activity | Compiles to |
| --- | --- |
| `agent` | `agent(prompt, opts)` |
| `sequence` | sequential `await`s, or `pipeline()` stages when the sequence is a fanout body |
| `parallel` | `parallel([...])` — only because the thread declared a barrier |
| `fanout` mode `orchestrate` | `pipeline(list, item => ...)`, nesting as the body nests |
| `fanout` mode `compare` | `parallel(Array.from({length: N}, ...))` + the downstream judge |
| `loop` | a bounded `while` honoring `stopCondition`, `noProgressCondition`, `maxRounds` |
| `call` | `workflow('<workflowName>', args)` (nesting is one level — a called workflow must not itself `call`) |

Rules:

- **`pipeline()` is the default fan-out.** Use `parallel()` only for (a) a thread `parallel` activity
  — its `barrierReason` is your justification; reflect it in a comment — or (b) a `compare` fanout,
  where the judge genuinely needs all attempts at once. Never use a barrier because the code reads
  more cleanly.
- Inside any fan-out body, set an explicit `phase` in `agent()` options (the global `phase()` state
  races inside `pipeline()`/`parallel()`).
- `pipeline()`/`parallel()` results can contain `null` (skipped/failed agents) — `.filter(Boolean)`
  before use, and make per-item failure visible in the return value rather than silently dropped.

## C4. Handoffs → schemas

Every thread handoff (`produces` consumed downstream via `{name}` or `fanout.over`) must be realized
as a **JSON schema** on the producing `agent()` call. The engineer named the handoff; you infer the
fields the downstream prompts actually need — no more. A `produces` that nothing consumes may stay
unstructured text.

`{name}` references in `does` prose become real interpolations of the structured value's relevant
fields — never `JSON.stringify` an entire object into a prompt when specific fields are what the
downstream agent needs (an id, a title, a list of criteria).

## C5. Args

Read `args` as real structured values, with the thread's `begin.args` sketch deciding which are
required:

```js
const boardId = args?.boardId
if (!boardId) throw new Error('boardId required')
const targetPath = args?.targetPath || 'src'
```

Never require args the thread doesn't sketch; never ignore ones it marks required.

## C6. Prompts

The thread's `does` is intent, not the prompt. Expand it into a self-contained subagent prompt:
what to do, where to look, what evidence counts, and what to return (matching the schema). Subagents
have no conversation context — the prompt must carry everything, including relevant values from
in-scope handoffs.

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
whenever coverage is bounded (top-N, sampling), so truncation is never silent.

## C10. Scale honestly

Respect runtime caps (concurrency ~16 per workflow, 1000 agents total, 4096 items per fan-out call).
For nested fan-outs whose item counts multiply, keep per-item work in one agent where reasonable, and
surface dropped work via `log()` — never bound coverage silently.
