# Thread: template-tournament

> TEMPLATE (pattern, F + bracket): generate candidates, then judge them head-to-head in elimination rounds until one remains. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: task"])
  n2["⚙ generate #lt;8#gt; independent candidates for {task}, each from a dis…<br/>→ produces <b>candidates</b>"]
  subgraph n3 ["↻ loop until: one candidate remains (≤4 rounds)<br/>give up when: a round fails to eliminate anyone"]
    direction TB
    n4["⚙ pair up the remaining {candidates}, judge each pair head-to-hea…<br/>→ produces <b>survivors</b>"]
  end
  n2 --> n3
  n5["⚙ present the final winner from {survivors} with the bracket hist…<br/>→ produces <b>winner</b>"]
  n3 --> n5
  n1 --> n2
  n6(["◆ end — review: #lt;e.g. a single winner plus a bracket that shows the jud…"])
  n5 --> n6
  style n1 stroke-dasharray: 4 3
  style n6 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `candidates` | generate &lt;8&gt; independent candidates for {task},… |
| `survivors` | pair up the remaining {candidates}, judge each … |
| `winner` | present the final winner from {survivors} with … |

## Human nodes

- **begin:** args `{"task":"string (required) — <what the candidates compete on>"}`
- **end (review):** &lt;e.g. a single winner plus a bracket that shows the judging was real&gt;

Workflow artifact: `.claude/workflows/template-tournament.js`

