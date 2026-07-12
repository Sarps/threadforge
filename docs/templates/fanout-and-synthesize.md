# Thread: template-fanout-and-synthesize

> TEMPLATE (pattern, B + barrier): break a question into aspects, research each in parallel, synthesize one answer. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: question"])
  n2["⚙ decompose {question} into #lt;4-8#gt; independent aspects worth inves…<br/>→ produces <b>aspects</b>"]
  subgraph n3 ["⤨ for each aspect in aspects"]
    direction TB
    n4["⚙ investigate {aspect} in depth: #lt;where to look, what evidence co…<br/>→ produces <b>notes</b>"]
  end
  n2 --> n3
  n5["⚙ synthesize {notes} into one answer to {question}; flag contradi…<br/>→ produces <b>synthesis</b>"]
  n3 --> n5
  n1 --> n2
  n6(["◆ end — review: #lt;e.g. one coherent answer with per-aspect evidence; con…"])
  n5 --> n6
  style n1 stroke-dasharray: 4 3
  style n6 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `aspects` | decompose {question} into &lt;4-8&gt; independent asp… |
| `notes` | investigate {aspect} in depth: &lt;where to look, … |
| `synthesis` | synthesize {notes} into one answer to {question… |

## Human nodes

- **begin:** args `{"question":"string (required) — <the thing to understand>"}`
- **end (review):** &lt;e.g. one coherent answer with per-aspect evidence; contradictions surfaced, not averaged away&gt;

Workflow artifact: `.claude/workflows/template-fanout-and-synthesize.js`

