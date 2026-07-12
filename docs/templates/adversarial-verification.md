# Thread: template-adversarial-verification

> TEMPLATE (pattern, B + F): produce findings, then per finding fan out independent skeptics who try to REFUTE it; keep only survivors. Rename meta.name, then replace every &lt;placeholder&gt;.

**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**

```mermaid
flowchart TD
  n1(["◇ begin — args: scope"])
  n2["⚙ review {scope} and report every #lt;bug/issue/claim#gt; found, each w…<br/>→ produces <b>findings</b>"]
  subgraph n3 ["⤨ for each finding in findings"]
    direction TB
    subgraph n4 ["⚖ compare: 3 attempts on finding as skeptic"]
      direction TB
      n5["⚙ adversarially try to refute {finding}; default to refuted if un…<br/>→ produces <b>verdicts</b>"]
    end
  end
  n2 --> n3
  n6["⚙ keep only entries of {findings} that a majority of {verdicts} c…<br/>→ produces <b>confirmedFindings</b>"]
  n3 --> n6
  n1 --> n2
  n7(["◆ end — review: #lt;e.g. every surviving finding is real and reproducible;…"])
  n6 --> n7
  style n1 stroke-dasharray: 4 3
  style n7 stroke-dasharray: 4 3
```

## Handoffs

| name | produced by |
| --- | --- |
| `findings` | review {scope} and report every &lt;bug/issue/clai… |
| `verdicts` | adversarially try to refute {finding}; default … |
| `confirmedFindings` | keep only entries of {findings} that a majority… |

## Human nodes

- **begin:** args `{"scope":"string (required) — <what to review, e.g. a diff, directory, or document>"}`
- **end (review):** &lt;e.g. every surviving finding is real and reproducible; the kill list looks reasonable&gt;

Workflow artifact: `.claude/workflows/template-adversarial-verification.js`

