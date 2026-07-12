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

- **fanout** — what exact list does it iterate (`over` must be a named upstream handoff)? Per-item
  work = orchestrate; N attempts at the same work = compare (and how many attempts?)
- **parallel** — why must a later step see ALL branch results at once? No defensible `barrierReason`
  → it's not a barrier; restructure as sequence or fanout and tell the user why
- **loop** — when is it done (`stopCondition`)? When do we give up (`noProgressCondition`)? Cap
  rounds (`maxRounds`)?
- **handoffs** — every output a later step consumes gets a `produces` name; downstream refers to it
  as `{name}`. Names must resolve — no "the results from before"
- **begin/end** — what args does the engineer supply? What exactly will they look at to call it done
  (`end.review`)? A thread without a concrete review is not done being drawn
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
comments/structure, or a compare `fanout` if followed by a judge; bounded `while` → `loop`;
`workflow()` → `call`), write the thread with `does` summarizing each agent prompt's intent, then
validate and render as usual. Flag anything the script does that the thread model cannot express.
Mark the thread's `whenToUse` with `(decompiled — review before trusting)`.

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
