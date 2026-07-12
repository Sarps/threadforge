# Template Gallery

Rendered diagrams for every template shipped in the skill
(`skills/threadforge/templates/*.thread.json`). Each page is generated with
`render-thread.mjs --doc` — regenerate after editing a template; never edit these by hand:

```bash
for f in skills/threadforge/templates/*.thread.json; do
  node skills/threadforge/scripts/render-thread.mjs "$f" --doc > "docs/templates/$(basename "$f" .thread.json).md"
done
```

## Thread types

| Template                                            | Shape                                                                    |
|-----------------------------------------------------|--------------------------------------------------------------------------|
| [c-sequential](c-sequential.md)                     | **C** — phases in order with a named handoff between them                |
| [p-parallel-barrier](p-parallel-barrier.md)         | **P** — fixed branches at once, then a step needing all results together |
| [b-nested-orchestration](b-nested-orchestration.md) | **B** — discover a list, run a sub-thread per item                       |
| [f-fanout-compare](f-fanout-compare.md)             | **F** — N independent attempts at the same work, judged                  |

## Workflow patterns

| Template                                                | Pattern                                                        |
|---------------------------------------------------------|----------------------------------------------------------------|
| [inspect-implement-verify](inspect-implement-verify.md) | plan from real code, apply, independently check                |
| [fanout-and-synthesize](fanout-and-synthesize.md)       | decompose a question, research aspects in parallel, merge      |
| [adversarial-verification](adversarial-verification.md) | produce findings, fan out skeptics per finding, keep survivors |
| [generate-and-filter](generate-and-filter.md)           | generate many candidates cheaply, score, keep the best         |
| [tournament](tournament.md)                             | head-to-head elimination rounds until one candidate remains    |
| [loop-until-done](loop-until-done.md)                   | repeat a unit of work until a goal holds or progress stalls    |
