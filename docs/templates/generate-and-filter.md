# Thread: template-generate-and-filter

> TEMPLATE (pattern): generate many candidates cheaply, score each independently, keep the best. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: brief"])
  n2["⚙ generate #lt;20+#gt; diverse candidates for {brief}; favor variety ov…<br/>→ produces <b>candidates</b>"]
  subgraph n3 ["⤨ for each candidate in candidates"]
    direction TB
    n4["⚙ score {candidate} against {brief} on #lt;the criteria that matter#gt;…<br/>→ produces <b>scores</b>"]
  end
  n2 --> n3
  n5["⚙ rank {candidates} by {scores} and keep the top #lt;N#gt; with a one-l…<br/>→ produces <b>shortlist</b>"]
  n3 --> n5
  n1 --> n2
  n6(["◆ end — review: #lt;e.g. a shortlist of N, each with a score and rationale#gt;"])
  n5 --> n6
  style n1 stroke-dasharray: 4 3
  style n6 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `candidates` | generate &lt;20+&gt; diverse candidates for {brief}; … |
| `scores` | score {candidate} against {brief} on &lt;the crite… |
| `shortlist` | rank {candidates} by {scores} and keep the top … |

## Human nodes

- **begin:** args `{"brief":"string (required) — <what to generate and the constraints>"}`
- **end (review):** &lt;e.g. a shortlist of N, each with a score and rationale&gt;

Workflow artifact: `.claude/workflows/template-generate-and-filter.js`

