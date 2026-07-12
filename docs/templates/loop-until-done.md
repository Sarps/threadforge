# Thread: template-loop-until-done

> TEMPLATE (pattern): repeat a unit of work until a goal condition holds or progress stalls. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: goal"])
  subgraph n2 ["↻ loop until: #lt;e.g. all tests pass / two consecutive … (≤10 rounds)<br/>give up when: #lt;e.g. two consecutive rounds with no im…"]
    direction TB
    n3["⚙ make one round of progress toward {goal}: #lt;e.g. fix the next fa…<br/>→ produces <b>roundReports</b>"]
  end
  n4["⚙ summarize {roundReports}: goal reached or why we stopped, and w…<br/>→ produces <b>summary</b>"]
  n2 --> n4
  n1 --> n2
  n5(["◆ end — review: #lt;e.g. the goal metric verified independently, plus a ro…"])
  n4 --> n5
  style n1 stroke-dasharray: 4 3
  style n5 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `roundReports` | make one round of progress toward {goal}: &lt;e.g.… |
| `summary` | summarize {roundReports}: goal reached or why w… |

## Human nodes

- **begin:** args `{"goal":"string (required) — <the condition that ends the loop, checkable by an agent>"}`
- **end (review):** &lt;e.g. the goal metric verified independently, plus a round-by-round trail&gt;

Workflow artifact: `.claude/workflows/template-loop-until-done.js`

