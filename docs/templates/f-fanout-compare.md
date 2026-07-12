# Thread: template-f-fanout-compare

> TEMPLATE (F — fan-out comparative): N independent attempts at the same work, then a judge picks/synthesizes the winner. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: task"])
  n2["⚙ frame {task} into a precise brief: #lt;constraints, success criter…<br/>→ produces <b>brief</b>"]
  subgraph n3 ["⚖ compare: 3 attempts on brief as angle"]
    direction TB
    n4["⚙ independently attempt {brief} from your own {angle} — #lt;e.g. MVP…<br/>→ produces <b>candidates</b>"]
  end
  n2 --> n3
  n5["⚙ judge {candidates} against the {brief}: score each, pick the wi…<br/>→ produces <b>winner</b>"]
  n3 --> n5
  n1 --> n2
  n6(["◆ end — review: #lt;e.g. the winning candidate plus the judge's scoring ra…"])
  n5 --> n6
  style n1 stroke-dasharray: 4 3
  style n6 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `brief` | frame {task} into a precise brief: &lt;constraints… |
| `candidates` | independently attempt {brief} from your own {an… |
| `winner` | judge {candidates} against the {brief}: score e… |

## Human nodes

- **begin:** args `{"task":"string (required) — <the work every attempt takes on>"}`
- **end (review):** &lt;e.g. the winning candidate plus the judge's scoring rationale&gt;

Workflow artifact: `.claude/workflows/template-f-fanout-compare.js`

