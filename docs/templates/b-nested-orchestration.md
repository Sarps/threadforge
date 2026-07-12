# Thread: template-b-nested-orchestration

> TEMPLATE (B — nested orchestration): discover a list of items, then run a sub-thread per item. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: scope"])
  n2["⚙ #lt;discover: e.g. list every item in {scope} that needs work#gt;<br/>→ produces <b>workItems</b>"]
  subgraph n3 ["⤨ for each item in workItems"]
    direction TB
    n4["⚙ #lt;per-item work: e.g. apply the fix to {item}#gt;<br/>→ produces <b>itemResults</b>"]
    n5["⚙ #lt;per-item check: e.g. verify the fix to {item} using {itemResul…<br/>→ produces <b>itemVerdicts</b>"]
    n4 --> n5
  end
  n2 --> n3
  n6["⚙ summarize {itemVerdicts} into #lt;a final report#gt;<br/>→ produces <b>report</b>"]
  n3 --> n6
  n1 --> n2
  n7(["◆ end — review: #lt;e.g. one verdict per discovered item; no item skipped …"])
  n6 --> n7
  style n1 stroke-dasharray: 4 3
  style n7 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `workItems` | &lt;discover: e.g. list every item in {scope} that… |
| `itemResults` | &lt;per-item work: e.g. apply the fix to {item}&gt; |
| `itemVerdicts` | &lt;per-item check: e.g. verify the fix to {item} … |
| `report` | summarize {itemVerdicts} into &lt;a final report&gt; |

## Human nodes

- **begin:** args `{"scope":"string (required) — <where to discover items, e.g. a directory or board>"}`
- **end (review):** &lt;e.g. one verdict per discovered item; no item skipped silently&gt;

Workflow artifact: `.claude/workflows/template-b-nested-orchestration.js`

