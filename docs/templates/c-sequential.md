# Thread: template-c-sequential

> TEMPLATE (C — chained/sequential): phases in order with a named handoff between them. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: target"])
  n2["⚙ #lt;first phase: e.g. inspect {target} and list everything that ne…<br/>→ produces <b>findings</b>"]
  n3["⚙ #lt;second phase: act on {findings}#gt;<br/>→ produces <b>outcome</b>"]
  n2 --> n3
  n1 --> n2
  n4(["◆ end — review: #lt;what you will look at to call this done, e.g. every fi…"])
  n3 --> n4
  style n1 stroke-dasharray: 4 3
  style n4 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `findings` | &lt;first phase: e.g. inspect {target} and list ev… |
| `outcome` | &lt;second phase: act on {findings}&gt; |

## Human nodes

- **begin:** args `{"target":"string (required) — <what the work runs against, e.g. a path or ticket id>"}` — &lt;why this thread is being run&gt;
- **end (review):** &lt;what you will look at to call this done, e.g. every finding addressed or explicitly skipped with a reason&gt;

Workflow artifact: `.claude/workflows/template-c-sequential.js`

