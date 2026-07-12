---
name: threadforge
description: Draw the topology of engineering work as a "thread" (a validated JSON tree of agent activities), see it as a diagram, and generate a runnable Claude dynamic-workflow script from it. Use when the user wants to create, edit, visualize, regenerate, list, or decompile a workflow/thread; says "threadforge"; asks to "make a workflow" for multi-agent work; or wants to reuse one workflow inside another. Guards against vague prompting - it interviews until the topology, handoffs, and stop conditions are pinned, and refuses to write workflow code before the thread validates and the user approves the diagram.
---

# ThreadForge

The engineer owns **strategy** (topology, handoffs, human begin/end boundaries); you own
**mechanism** (primitives, prompts, schemas). The thread — a small JSON tree — is the contract
between the two, and the only artifact the engineer maintains. Never make the engineer read or write
workflow JavaScript, and never write workflow JavaScript from an unvalidated or unapproved thread.

## Project conventions

```text
threads/<name>.thread.json      the thread — source of truth, git-versioned
threads/<name>.md               generated view: mermaid diagram + handoff table (never hand-edited)
.claude/workflows/<name>.js     generated workflow script (regenerable from the thread)
```

## This skill's toolbox (paths relative to this skill's directory)

```text
scripts/validate-thread.mjs     node scripts/validate-thread.mjs threads/x.thread.json [--project <dir>] [--json]
scripts/render-thread.mjs       node scripts/render-thread.mjs threads/x.thread.json [--doc]
references/thread-schema.json   the thread JSON Schema (field-level reference)
references/codegen-contract.md  rules generated scripts must satisfy — READ BEFORE ANY CODEGEN
references/worked-example.md    canonical thread -> diagram -> script example — READ BEFORE ANY CODEGEN
templates/*.thread.json         starting shapes: C/P/B/F + six workflow patterns
```

## Modes

Pick by what the user asked for:

| Request | Mode |
| --- | --- |
| "make a workflow that…", "new thread" | **new** — interview → thread → validate → render → approve → codegen |
| "regenerate", "the runtime changed", thread edited | **regen** — re-validate, re-render, re-run codegen from the existing thread |
| "show me <workflow>", "what does it look like" | **show** — render the thread's diagram; never answer by pasting JS |
| "change the thread so that…" | **edit** — apply to the thread JSON, then the full validate → render → approve → codegen loop |
| "list threads/workflows" | **list** — table of `threads/` + `.claude/workflows/` with descriptions |
| "visualize this existing workflow .js" | **decompile** — reverse a script into a thread (below) |

## The protocol (new / edit)

**1. Start from a shape, not a blank page.** Match the request to the nearest template
(`templates/`): sequential phases → `c-sequential`; fixed independent branches merged →
`p-parallel-barrier`; per-item work over a discovered list → `b-nested-orchestration`; independent
attempts judged → `f-fanout-compare`; or one of the pattern templates (inspect-implement-verify,
fanout-and-synthesize, adversarial-verification, generate-and-filter, tournament, loop-until-done).
Copy it to `threads/<name>.thread.json` and rename `meta.name`. Say which template you picked and why.

**2. Interview until the thread is pinned.** This is the point of the tool. Fill placeholders from
what the user already said; for what's missing, ask targeted questions (batch them; use option lists
where the choice is structural). **Never guess topology.** The non-negotiables:

- **fanout** — what exact list does it iterate (`over` must be a named upstream handoff — a field
  of one is fine, e.g. `over: "scout.sections"` — or a `begin.constants` array)? Per-item work =
  orchestrate; N attempts at the same work = compare (and how many attempts?). Items one at a time
  instead of concurrently → `ordering: "sequential"` + `orderingReason` (shared mutable resource,
  serialized merges); no defensible reason → concurrent
- **transform** — deterministic derivations between steps (group, chunk, union/dedupe, derive a
  slug/path, coalesce an arg with a computed fallback) are `transform` nodes with the exact rule in
  `does` — never buried in an agent's prompt, never left for codegen to invent. A grouping key or
  batch size is strategy: ask for it (group by what? max how many per batch?)
- **constants** — curated data the workflow bakes in (story batches, frame/node-id tables, locale
  maps) goes in `begin.constants`, never into runtime args or `does` prose. It is engineer-owned:
  codegen copies it verbatim and regen round-trips it
- **rules** — standing orders that must reach an agent's prompt word-for-word (hands-off policy,
  stage boundaries, orthography requirements) go in that agent's `rules` field, verbatim; `does`
  stays short intent that codegen may reword, `rules` never gets reworded. Workflow-scoped only: a
  rule that holds for any work in the repo belongs in the target repo's CLAUDE.md, not in the
  thread — push back when the engineer pastes repo conventions in. Identical text on several
  agents is fine (codegen hoists it into one shared constant in the script)
- **when** — a step that sometimes doesn't run (skip the phase when there's nothing to do, fall back
  to re-reading a report when an arg is absent) gets a `when` guard naming its condition — never
  bury conditionality in prose. And ask: what does the engineer see when it's skipped?
- **agentType** — should a step run as a specific custom subagent (e.g. `senior-qa`,
  `lead-engineer`)? That's strategy — pin it on the agent; leave it off for the default
- **parallel** — why must a later step see ALL branch results at once? No defensible `barrierReason`
  → it's not a barrier; restructure as sequence or fanout and tell the user why
- **loop** — when is it done (`stopCondition`)? When do we give up (`noProgressCondition`)? Cap
  rounds (`maxRounds`)?
- **handoffs** — every output a later step consumes gets a `produces` name; downstream refers to it
  as `{name}` or a field of it as `{name.field}`. Names must resolve — no "the results from
  before". Referencing a fanout body's `produces` from outside the fanout means the collected
  array of per-item outputs; a loop body's, the last round's value. An optional arg with a
  when-guarded producer of the same name is the fallback idiom (arg if given, else computed)
- **begin/end** — what args does the engineer supply? What exactly will they look at to call it done
  (`end.review`)? A thread without a concrete review is not done being drawn
- **phases** — should the run display group work under stable titles across regens? Pin them in
  `meta.phases` (title + optional detail); omit to let codegen choose each time
- **reuse** — before adding an agent subtree, scan `.claude/workflows/*.js` metas and `threads/`; if
  an existing workflow covers a step, propose a `call` activity instead of redefining the work
- **mid-run human decision** (approve-then-apply) — split into two threads with the human between
  them; a workflow must never pause for input (contract C8)

Keep `does` as intent prose — no primitive names, no code, no schema fields.

**3. Validate — the hard gate.** Run `validate-thread.mjs`. Resolve every ERROR **by asking the
user, never by silently guessing**; use your judgment on warnings but tell the user which ones you
accepted and why. Do not proceed while errors remain.

**4. Render and get approval.** Run `render-thread.mjs --doc > threads/<name>.md` and show the
mermaid diagram (not the JSON) to the user. Ask: "this is the workflow I'll generate — correct?"
Structural feedback goes into the thread JSON, then repeat from step 3. **No codegen before an
explicit yes.**

**5. Codegen.** Read `references/codegen-contract.md` and `references/worked-example.md`, then write
`.claude/workflows/<meta.name>.js`. Primitive signatures come from the runtime's own
dynamic-workflows documentation (Workflow tool description / dynamic-workflows skill) — it is
authoritative over the contract if they diverge. Syntax-check the result (wrap the body in an async
function, strip `export`, `node --check`). Show the user a summary of codegen decisions (primitive
choices, schemas inferred, barrier justifications) — not the raw script — and where the three
artifacts live.

**6. Close the loop.** Remind the user how to run it (in Claude Code: "run the <name> workflow" with
their args) — and that future changes go to the thread, then regen; hand-edits to the `.js` are lost
on regeneration.

## Decompile (existing `.js` → thread)

For a workflow that predates its thread: read the script, recover the topology (`pipeline` chains →
`sequence` + `fanout·orchestrate`; `parallel` → `parallel` with the barrier reason from
comments/structure, or a compare `fanout` if followed by a judge; awaited `for...of` over a list →
`fanout·orchestrate` with `ordering: "sequential"` + the reason from comments; bounded `while` →
`loop`; `if` around a stage → `when`; plain-JS derivations between awaits — grouping, chunking,
unions, slicing, slug/path building — → `transform` nodes with the derivation spelled exactly;
`args.x ?? <computed>` fallbacks → a when-guarded producer named after the arg; `workflow()` →
`call`), and recover the data plane (top-level `const` data tables → `begin.constants` verbatim;
shared prompt-rule strings → the `rules` field of each agent whose prompt included them, verbatim;
`opts.agentType` → the agent's `agentType`; the script's `meta.phases` → thread `meta.phases`
verbatim), write the thread with `does` summarizing each agent
prompt's intent, then validate and render as usual. Flag anything the script does that the thread
model cannot express. Mark the thread's `whenToUse` with `(decompiled — review before trusting)`.

## Hard rules

1. Never write or modify workflow JavaScript before its thread validates with zero errors AND the
   user approved the rendered diagram.
2. Never resolve a validation error by guessing — ask.
3. Never hand-edit `threads/<name>.md` or ask the user to read the generated JS to understand their
   workflow — the diagram is the review surface.
4. Thread and script always change together via regen; if you find them out of sync, say so and
   offer regen or decompile.
5. When the user asks for something the thread model can't express, say so plainly rather than
   bending the JSON — and offer the nearest expressible shape.
