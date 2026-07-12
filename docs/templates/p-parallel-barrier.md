# Thread: template-p-parallel-barrier

> TEMPLATE (P — parallel + barrier): fixed branches run at once, then a step that needs ALL their results together. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: target"])
  subgraph n2 ["∥ parallel — barrier: #lt;why a later step needs all branch results at o…"]
    direction TB
    n3["⚙ #lt;branch 1: e.g. audit {target} for security issues#gt;<br/>→ produces <b>securityFindings</b>"]
    n4["⚙ #lt;branch 2: e.g. audit {target} for performance issues#gt;<br/>→ produces <b>perfFindings</b>"]
    n5["⚙ #lt;branch 3: e.g. audit {target} for missing test coverage#gt;<br/>→ produces <b>coverageFindings</b>"]
  end
  n6["⚙ merge {securityFindings}, {perfFindings} and {coverageFindings}…<br/>→ produces <b>report</b>"]
  n2 --> n6
  n1 --> n2
  n7(["◆ end — review: #lt;e.g. one merged report, deduplicated, ranked by severi…"])
  n6 --> n7
  style n1 stroke-dasharray: 4 3
  style n7 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `securityFindings` | &lt;branch 1: e.g. audit {target} for security iss… |
| `perfFindings` | &lt;branch 2: e.g. audit {target} for performance … |
| `coverageFindings` | &lt;branch 3: e.g. audit {target} for missing test… |
| `report` | merge {securityFindings}, {perfFindings} and {c… |

## Human nodes

- **begin:** args `{"target":"string (required) — <what all branches examine>"}`
- **end (review):** &lt;e.g. one merged report, deduplicated, ranked by severity&gt;

Workflow artifact: `.claude/workflows/template-p-parallel-barrier.js`

