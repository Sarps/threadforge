#!/usr/bin/env node
// ThreadForge renderer: thread JSON -> Mermaid flowchart (stdout).
// Usage: node render-thread.mjs <thread.json> [--doc]
//   (default) print the mermaid source only
//   --doc     print a full markdown document (title, summary, fenced mermaid, handoff table)
//
// Deterministic projection of the thread — the diagram is generated, never hand-drawn,
// so it cannot drift from the thread. No dependencies; Node >= 16.

import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const asDoc = argv.includes('--doc')
const file = argv.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: node render-thread.mjs <thread.json> [--doc]')
  process.exit(2)
}

let thread
try {
  thread = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error(`unusable: ${file}: ${e.message}`)
  process.exit(2)
}

let n = 0
const id = () => `n${++n}`
const lines = []
const emit = (depth, s) => lines.push('  '.repeat(depth + 1) + s)

const esc = (s) => String(s).replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ').trim()
const clip = (s, max = 64) => {
  const t = esc(s)
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// Render an activity. Returns { entry, exits } — node ids to attach incoming and
// outgoing edges to. Subgraph containers are linked by their subgraph id.
function render(node, depth) {
  switch (node?.kind) {
    case 'agent': {
      const a = id()
      const prod = node.produces ? `<br/>→ produces <b>${esc(node.produces)}</b>` : ''
      emit(depth, `${a}["⚙ ${clip(node.does)}${prod}"]`)
      return { entry: a, exits: [a] }
    }
    case 'call': {
      const c = id()
      const prod = node.produces ? `<br/>→ produces <b>${esc(node.produces)}</b>` : ''
      emit(depth, `${c}[["⇢ call: ${esc(node.workflowName)}${prod}"]]`)
      return { entry: c, exits: [c] }
    }
    case 'sequence': {
      let entry = null
      let prevExits = []
      for (const step of node.steps ?? []) {
        const r = render(step, depth)
        if (!entry) entry = r.entry
        for (const x of prevExits) emit(depth, `${x} --> ${r.entry}`)
        prevExits = r.exits
      }
      return { entry: entry ?? unknown(depth, 'empty sequence'), exits: prevExits }
    }
    case 'parallel': {
      const sg = id()
      emit(depth, `subgraph ${sg} ["∥ parallel — barrier: ${clip(node.barrierReason ?? '?', 48)}"]`)
      emit(depth + 1, 'direction TB')
      for (const b of node.branches ?? []) render(b, depth + 1)
      emit(depth, 'end')
      return { entry: sg, exits: [sg] }
    }
    case 'fanout': {
      const sg = id()
      const label = node.mode === 'compare'
        ? `⚖ compare: ${node.agents ?? 'N'} attempts on ${esc(node.over)} as ${esc(node.as)}`
        : `⤨ for each ${esc(node.as)} in ${esc(node.over)}`
      emit(depth, `subgraph ${sg} ["${label}"]`)
      emit(depth + 1, 'direction TB')
      render(node.body ?? {}, depth + 1)
      emit(depth, 'end')
      return { entry: sg, exits: [sg] }
    }
    case 'loop': {
      const sg = id()
      const rounds = node.maxRounds ? ` (≤${node.maxRounds} rounds)` : ''
      emit(depth, `subgraph ${sg} ["↻ loop until: ${clip(node.stopCondition ?? '?', 40)}${rounds}<br/>give up when: ${clip(node.noProgressCondition ?? '?', 40)}"]`)
      emit(depth + 1, 'direction TB')
      render(node.body ?? {}, depth + 1)
      emit(depth, 'end')
      return { entry: sg, exits: [sg] }
    }
    default:
      return { entry: unknown(depth, `unknown kind: ${node?.kind}`), exits: [] }
  }
}

function unknown(depth, msg) {
  const u = id()
  emit(depth, `${u}["⚠ ${esc(msg)}"]`)
  return u
}

// ---------- build ----------

const argNames = Object.keys(thread.begin?.args ?? {})
const beginLabel = argNames.length ? `begin — args: ${argNames.join(', ')}` : 'begin'
const endLabel = `end — review: ${clip(thread.end?.review ?? '?', 56)}`

const begin = id()
emit(0, `${begin}(["◇ ${esc(beginLabel)}"])`)
const body = render(thread.root ?? {}, 0)
emit(0, `${begin} --> ${body.entry}`)
const fin = id()
emit(0, `${fin}(["◆ ${esc(endLabel)}"])`)
for (const x of body.exits) emit(0, `${x} --> ${fin}`)

emit(0, `style ${begin} stroke-dasharray: 4 3`)
emit(0, `style ${fin} stroke-dasharray: 4 3`)

const mermaid = ['flowchart TD', ...lines].join('\n')

// ---------- output ----------

if (!asDoc) {
  console.log(mermaid)
  process.exit(0)
}

const handoffs = []
;(function collect(node, path) {
  if (!node || typeof node !== 'object') return
  if (node.produces) handoffs.push({ name: node.produces, from: node.kind === 'call' ? `call ${node.workflowName}` : clip(node.does ?? node.kind, 48) })
  const kids = node.kind === 'sequence' ? node.steps
    : node.kind === 'parallel' ? node.branches
    : (node.kind === 'fanout' || node.kind === 'loop') ? [node.body]
    : []
  for (const k of kids ?? []) collect(k, path)
})(thread.root)

const doc = [
  `# Thread: ${thread.meta?.name ?? '(unnamed)'}`,
  '',
  `> ${thread.meta?.description ?? ''}`,
  '',
  '**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**',
  '',
  '```mermaid',
  mermaid,
  '```',
  '',
  '## Handoffs',
  '',
  handoffs.length
    ? ['| name | produced by |', '| --- | --- |', ...handoffs.map((h) => `| \`${h.name}\` | ${h.from} |`)].join('\n')
    : '_none_',
  '',
  '## Human nodes',
  '',
  `- **begin:** args \`${JSON.stringify(thread.begin?.args ?? {})}\`${thread.begin?.intent ? ` — ${thread.begin.intent}` : ''}`,
  `- **end (review):** ${thread.end?.review ?? '?'}`,
  '',
  `Workflow artifact: \`.claude/workflows/${thread.meta?.name ?? '<name>'}.js\``,
  '',
].join('\n')

console.log(doc)
