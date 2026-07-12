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

const squash = (s) => String(s).replace(/[\r\n]+/g, ' ').trim()
const clipRaw = (s, max = 64) => {
  const t = squash(s)
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}
// Mermaid label escaping (mermaid entity syntax); our own <br/>/<b> markup is added after escaping.
const esc = (s) => squash(s).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')
const clip = (s, max = 64) => esc(clipRaw(s, max))
// Markdown-context escaping for the --doc sections.
const md = (s) => squash(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Render an activity. Returns { entry, exits } — node ids to attach incoming and
// outgoing edges to. Subgraph containers are linked by their subgraph id.
const whenTag = (node, max = 44) => node?.when ? ` — only if: ${clip(node.when, max)}` : ''
const whenLine = (node, max = 48) => node?.when ? `<br/>only if: ${clip(node.when, max)}` : ''

function render(node, depth) {
  switch (node?.kind) {
    case 'agent': {
      const a = id()
      const typ = node.agentType ? ` [${esc(node.agentType)}]` : ''
      const rules = node.rules ? `<br/>rules: ${clip(node.rules, 44)}` : ''
      const prod = node.produces ? `<br/>→ produces <b>${esc(node.produces)}</b>` : ''
      emit(depth, `${a}["⚙${typ} ${clip(node.does)}${whenLine(node)}${rules}${prod}"]`)
      return { entry: a, exits: [a] }
    }
    case 'transform': {
      const t = id()
      const prod = node.produces ? `<br/>→ produces <b>${esc(node.produces)}</b>` : ''
      emit(depth, `${t}{{"ƒ ${clip(node.does)}${whenLine(node)}${prod}"}}`)
      return { entry: t, exits: [t] }
    }
    case 'call': {
      const c = id()
      const prod = node.produces ? `<br/>→ produces <b>${esc(node.produces)}</b>` : ''
      emit(depth, `${c}[["⇢ call: ${esc(node.workflowName)}${whenLine(node)}${prod}"]]`)
      return { entry: c, exits: [c] }
    }
    case 'sequence': {
      // A guarded sequence gets a container so the condition is visible on the group.
      const sg = node.when ? id() : null
      if (sg) {
        emit(depth, `subgraph ${sg} ["?${whenTag(node, 56).replace(' — ', ' ')}"]`)
        emit(depth + 1, 'direction TB')
        depth += 1
      }
      let entry = null
      let prevExits = []
      for (const step of node.steps ?? []) {
        const r = render(step, depth)
        if (!entry) entry = r.entry
        for (const x of prevExits) emit(depth, `${x} --> ${r.entry}`)
        prevExits = r.exits
      }
      if (sg) {
        emit(depth - 1, 'end')
        return { entry: sg, exits: [sg] }
      }
      return { entry: entry ?? unknown(depth, 'empty sequence'), exits: prevExits }
    }
    case 'parallel': {
      const sg = id()
      emit(depth, `subgraph ${sg} ["∥ parallel — barrier: ${clip(node.barrierReason ?? '?', 48)}${whenTag(node)}"]`)
      emit(depth + 1, 'direction TB')
      for (const b of node.branches ?? []) render(b, depth + 1)
      emit(depth, 'end')
      return { entry: sg, exits: [sg] }
    }
    case 'fanout': {
      const sg = id()
      const seq = node.ordering === 'sequential' ? ` · one at a time: ${clip(node.orderingReason ?? '?', 40)}` : ''
      const label = node.mode === 'compare'
        ? `⚖ compare: ${node.agents ?? 'N'} attempts on ${esc(node.over)} as ${esc(node.as)}`
        : `⤨ for each ${esc(node.as)} in ${esc(node.over)}${seq}`
      emit(depth, `subgraph ${sg} ["${label}${whenTag(node)}"]`)
      emit(depth + 1, 'direction TB')
      render(node.body ?? {}, depth + 1)
      emit(depth, 'end')
      return { entry: sg, exits: [sg] }
    }
    case 'loop': {
      const sg = id()
      const rounds = node.maxRounds ? ` (≤${node.maxRounds} rounds)` : ''
      emit(depth, `subgraph ${sg} ["↻ loop until: ${clip(node.stopCondition ?? '?', 40)}${rounds}${whenTag(node)}<br/>give up when: ${clip(node.noProgressCondition ?? '?', 40)}"]`)
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
const constNames = Object.keys(thread.begin?.constants ?? {})
const beginParts = []
if (argNames.length) beginParts.push(`args: ${argNames.join(', ')}`)
if (constNames.length) beginParts.push(`constants: ${constNames.join(', ')}`)
const beginLabel = beginParts.length ? `begin — ${beginParts.join(' · ')}` : 'begin'
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
const ruledAgents = []
;(function collect(node, path) {
  if (!node || typeof node !== 'object') return
  if (node.produces) handoffs.push({ name: node.produces, from: node.kind === 'call' ? `call ${node.workflowName}` : node.kind === 'transform' ? `ƒ ${md(clipRaw(node.does ?? '?', 48))}` : md(clipRaw(node.does ?? node.kind, 48)) })
  if (node.kind === 'agent' && node.rules) ruledAgents.push({ agent: md(clipRaw(node.does ?? '?', 48)), text: md(clipRaw(node.rules, 120)) })
  const kids = node.kind === 'sequence' ? node.steps
    : node.kind === 'parallel' ? node.branches
    : (node.kind === 'fanout' || node.kind === 'loop') ? [node.body]
    : []
  for (const k of kids ?? []) collect(k, path)
})(thread.root)

const constRows = constNames.map((k) => {
  const v = thread.begin.constants[k]
  const shape = Array.isArray(v) ? `array (${v.length} items)`
    : v !== null && typeof v === 'object' ? `object (${Object.keys(v).length} keys)`
    : typeof v
  return `| \`${k}\` | ${shape} |`
})

const doc = [
  `# Thread: ${thread.meta?.name ?? '(unnamed)'}`,
  '',
  `> ${md(thread.meta?.description ?? '')}`,
  '',
  '**This document is generated from the thread JSON — edit the thread, then re-render. Do not edit by hand.**',
  '',
  '```mermaid',
  mermaid,
  '```',
  '',
  '## Handoffs',
  '',
  handoffs.length || constNames.length
    ? ['| name | produced by |', '| --- | --- |',
       ...constNames.map((k) => `| \`${k}\` | begin (constant) |`),
       ...handoffs.map((h) => `| \`${h.name}\` | ${h.from} |`)].join('\n')
    : '_none_',
  '',
  ...(constNames.length ? ['## Constants', '', '| name | shape |', '| --- | --- |', ...constRows, ''] : []),
  ...(ruledAgents.length ? ['## Standing orders (woven verbatim into the agent prompt)', '', ...ruledAgents.map((r) => `- **${r.agent}** — ${r.text}`), ''] : []),
  '## Human nodes',
  '',
  `- **begin:** args \`${JSON.stringify(thread.begin?.args ?? {})}\`${constNames.length ? ` · constants: ${constNames.map((c) => `\`${c}\``).join(', ')}` : ''}${thread.begin?.intent ? ` — ${md(thread.begin.intent)}` : ''}`,
  `- **end (review):** ${md(thread.end?.review ?? '?')}`,
  '',
  `Workflow artifact: \`.claude/workflows/${thread.meta?.name ?? '<name>'}.js\``,
  '',
].join('\n')

console.log(doc)
