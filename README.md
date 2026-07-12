# ThreadForge

**Draw the topology of engineering work as a thread. Let your agent write the workflow code.**

ThreadForge is an [agent skill](https://agentskills.io) that turns a prose request like *"verify
every story on my Jira board against its acceptance criteria"* into:

1. a **thread** — a small, validated JSON tree capturing the *topology of intent*: what happens in
   sequence, what fans out over what, what loops until when, and where you (the human) begin and end
2. a **Mermaid diagram** — generated from the thread, so you review a picture, never JavaScript
3. a **runnable Claude dynamic-workflow script** — generated from the approved thread

You own strategy (topology, handoffs, review criteria). The agent owns mechanism (primitives,
prompts, schemas). The thread is the contract between the two — and the only artifact you maintain.

```text
"make me a workflow that ..."
    ↓  interview: the skill asks until topology, handoffs, and stop conditions are pinned
threads/<name>.thread.json          ← source of truth, git-versioned
    ↓  validate (deterministic; errors block codegen)
    ↓  render   (deterministic; Mermaid)
threads/<name>.md                   ← you approve THIS diagram
    ↓  codegen per the shipped contract
.claude/workflows/<name>.js         ← regenerable artifact; runs in Claude Code
```

## Install

```bash
# into the current project (recommended — threads belong in the repo)
npx skills add Sarps/threadforge

# or globally, for every project
npx skills add Sarps/threadforge -g
```

Works with Claude Code and [60+ other agents](https://github.com/vercel-labs/skills#supported-agents)
via the `skills` CLI. Authoring/validation/rendering work anywhere; *executing* generated workflows
requires an agent with the dynamic-workflows runtime (Claude Code).

## Use

Just ask your agent:

- **"Make me a workflow that audits every route handler for missing auth checks"** → template →
  interview → thread → diagram → your approval → script
- **"Show me what verify-jira-stories does"** → renders the diagram (never dumps JS at you)
- **"Change it to also check unit test coverage per story"** → edits the thread, re-validates,
  re-renders, regenerates
- **"The workflow runtime got new primitives — regenerate everything"** → threads are stable;
  scripts are disposable
- **"Turn my existing hand-written workflow into a thread"** → decompile

## Why a thread, not just a prompt?

A vague prompt can't fail. A thread can:

```text
ERROR  $.root.steps[0].over
       fans out over "epics" but nothing in scope produces it (in scope: nothing)
ERROR  $.root.steps[1].barrierReason
       parallel requires barrierReason: why must a later step see ALL branch results at once?
ERROR  $.root.steps[2].stopCondition
       loop requires stopCondition: when is it done? An unbounded loop is a vague loop
```

The schema's required fields are exactly the things vague prompts leave unsaid. The skill interviews
you until they're pinned, and refuses to write code until validation passes and you've approved the
diagram.

## What's in the skill

```text
skills/threadforge/
  SKILL.md                        the protocol (interview → validate → render → approve → codegen)
  scripts/validate-thread.mjs     deterministic structural validation (no deps, Node ≥ 16)
  scripts/render-thread.mjs       deterministic thread → Mermaid rendering (no deps)
  references/thread-schema.json   the thread JSON Schema
  references/codegen-contract.md  the rules every generated script must satisfy
  references/worked-example.md    a full thread → diagram → script chain, annotated
  templates/                      10 starting shapes: C/P/B/F thread types + six workflow patterns
```

Rendered diagrams for every template: [docs/templates/](docs/templates/).
Full design rationale: [docs/spec.md](docs/spec.md).

## License

MIT
