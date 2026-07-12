#!/usr/bin/env node
// ThreadForge structural validator.
// Usage: node validate-thread.mjs <thread.json> [--project <dir>] [--json]
//
// Exit codes: 0 = valid (warnings allowed), 1 = errors, 2 = unusable input.
// Validates the THREAD ONLY (topology, handoffs, human nodes) — never generated JS.
// No dependencies; Node >= 16.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const KINDS = ['agent', 'transform', 'sequence', 'parallel', 'fanout', 'loop', 'call']
const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const REF_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}/g
const LISTY_RE = /(s|list|items|set|batch|results|findings|matches)$/i

const errors = []
const warnings = []
const err = (path, msg) => errors.push({ path, msg })
const warn = (path, msg) => warnings.push({ path, msg })

// ---------- input ----------

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const projectIdx = argv.indexOf('--project')
const projectDir = projectIdx !== -1 ? resolve(argv[projectIdx + 1]) : process.cwd()
const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--project')

if (!file) {
  console.error('usage: node validate-thread.mjs <thread.json> [--project <dir>] [--json]')
  process.exit(2)
}

let thread
try {
  thread = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error(`unusable: ${file}: ${e.message}`)
  process.exit(2)
}

// ---------- shape checks ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string'
const nonEmpty = (v) => isStr(v) && v.trim().length > 0

const CONSTANTS = isObj(thread?.begin?.constants) ? thread.begin.constants : {}
const referenced = new Set()          // head of every {name} / {name.field} / over seen anywhere
const transformProduces = new Map()   // produces name -> path, for the dead-transform check

function checkTop(t) {
  if (!isObj(t)) return err('$', 'thread must be a JSON object')
  if (t.schemaVersion !== '1') err('$.schemaVersion', `expected "1", got ${JSON.stringify(t.schemaVersion)}`)

  if (!isObj(t.meta)) err('$.meta', 'meta is required')
  else {
    if (!nonEmpty(t.meta.name)) err('$.meta.name', 'name is required')
    else if (!NAME_RE.test(t.meta.name)) err('$.meta.name', `"${t.meta.name}" is not kebab-case`)
    if (!nonEmpty(t.meta.description)) err('$.meta.description', 'description is required')
    if (t.meta.phases !== undefined) {
      if (!Array.isArray(t.meta.phases) || t.meta.phases.length === 0) {
        err('$.meta.phases', 'phases must be a non-empty array of { title, detail? } — omit it to let codegen pick phases')
      } else t.meta.phases.forEach((p, i) => {
        if (!isObj(p) || !nonEmpty(p.title)) err(`$.meta.phases[${i}]`, 'each phase needs a non-empty title')
        else if (p.detail !== undefined && !nonEmpty(p.detail)) err(`$.meta.phases[${i}].detail`, 'detail, when present, must be a non-empty string')
      })
    }
  }

  if (t.begin !== undefined) {
    if (!isObj(t.begin)) err('$.begin', 'begin must be an object')
    else {
      if (t.begin.args !== undefined) {
        if (!isObj(t.begin.args)) err('$.begin.args', 'args must be an object of name -> type sketch')
        else for (const [k, v] of Object.entries(t.begin.args)) {
          if (!IDENT_RE.test(k)) err(`$.begin.args.${k}`, `arg name "${k}" is not a valid identifier`)
          if (!nonEmpty(v)) err(`$.begin.args.${k}`, 'arg sketch must be a non-empty string')
        }
      }
      if (t.begin.constants !== undefined) {
        if (!isObj(t.begin.constants)) err('$.begin.constants', 'constants must be an object of name -> JSON value')
        else for (const k of Object.keys(t.begin.constants)) {
          if (!IDENT_RE.test(k)) err(`$.begin.constants.${k}`, `constant name "${k}" is not a valid identifier`)
          if (isObj(t.begin.args) && k in t.begin.args) warn(`$.begin.constants.${k}`, `"${k}" is both an arg and a constant — references are ambiguous; rename one`)
        }
      }
    }
  } else {
    warn('$.begin', 'no begin node: every thread starts with a human — add begin.args (or begin.intent) even if empty of args')
  }

  if (!isObj(t.end) || !nonEmpty(t.end.review)) {
    err('$.end.review', 'end.review is required: say what "done/validated" means — it drives the workflow return shape')
  }

  if (!isObj(t.root)) err('$.root', 'root activity is required')
}

// ---------- activity checks + scope walk ----------

// Collect every `produces` name declared in a subtree.
function collectProduces(node, out = []) {
  if (!isObj(node)) return out
  if (nonEmpty(node.produces)) out.push(node.produces)
  for (const child of childrenOf(node)) collectProduces(child, out)
  return out
}

function childrenOf(node) {
  switch (node.kind) {
    case 'sequence': return Array.isArray(node.steps) ? node.steps : []
    case 'parallel': return Array.isArray(node.branches) ? node.branches : []
    case 'fanout':
    case 'loop': return isObj(node.body) ? [node.body] : []
    default: return []
  }
}

function refsIn(text) {
  const out = []
  for (const m of String(text).matchAll(REF_RE)) out.push(m[1])
  return out
}

// A reference may be a bare name {stories} or a dotted path into a handoff {scout.sections};
// only the head must resolve in scope — the fields are the codegen agent's schema inference (C4).
function checkRefs(text, scope, path, field) {
  for (const name of refsIn(text)) {
    const head = name.split('.')[0]
    referenced.add(head)
    if (!scope.has(head)) {
      err(`${path}.${field}`, `references {${name}} but nothing in scope produces "${head}" (in scope: ${[...scope].join(', ') || 'nothing'})`)
    }
  }
}

// Walk the tree carrying the set of names in scope.
// Scope = begin args ∪ produces of earlier siblings' subtrees ∪ ancestor fanout bindings.
function walk(node, scope, path, depth) {
  if (!isObj(node)) return err(path, 'activity must be an object')
  if (!KINDS.includes(node.kind)) return err(`${path}.kind`, `unknown kind ${JSON.stringify(node.kind)} (expected one of: ${KINDS.join(', ')})`)

  if (node.produces !== undefined && !IDENT_RE.test(String(node.produces))) {
    err(`${path}.produces`, `"${node.produces}" is not a valid identifier`)
  }

  if (node.when !== undefined) {
    if (!nonEmpty(node.when)) err(`${path}.when`, '"when" must be a non-empty prose condition (it guards whether this activity runs)')
    else checkRefs(node.when, scope, path, 'when')
  }

  switch (node.kind) {
    case 'agent': {
      if (!nonEmpty(node.does)) err(`${path}.does`, 'agent needs a "does": the intent, in prose')
      else checkRefs(node.does, scope, path, 'does')
      if (node.agentType !== undefined && !nonEmpty(node.agentType)) {
        err(`${path}.agentType`, 'agentType must be a non-empty string (a custom subagent type) — omit it for the default')
      }
      if (node.rules !== undefined) {
        if (!nonEmpty(node.rules)) err(`${path}.rules`, 'rules must be a non-empty string: standing orders woven verbatim into this agent\'s prompt — omit it when there are none')
        else checkRefs(node.rules, scope, path, 'rules')
      }
      break
    }
    case 'transform': {
      if (!nonEmpty(node.does)) err(`${path}.does`, 'transform needs a "does": the exact derivation in prose (grouping key, chunk size, fallback order) — it compiles to plain JavaScript, never an agent')
      else checkRefs(node.does, scope, path, 'does')
      if (!nonEmpty(node.produces)) err(`${path}.produces`, 'transform requires "produces": a derivation nothing consumes is dead weight — name the output or delete the node')
      else if (IDENT_RE.test(String(node.produces))) transformProduces.set(node.produces, path)
      break
    }
    case 'sequence': {
      if (!Array.isArray(node.steps) || node.steps.length === 0) {
        err(`${path}.steps`, 'sequence needs at least one step')
        break
      }
      if (node.steps.length === 1) warn(`${path}.steps`, 'sequence of one step — inline the step instead')
      let env = new Set(scope)
      node.steps.forEach((step, i) => {
        walk(step, env, `${path}.steps[${i}]`, depth)
        env = new Set([...env, ...collectProduces(step)])
      })
      break
    }
    case 'parallel': {
      if (!Array.isArray(node.branches) || node.branches.length < 2) {
        err(`${path}.branches`, 'parallel needs at least two branches (one branch is a sequence)')
      }
      if (!nonEmpty(node.barrierReason)) {
        err(`${path}.barrierReason`, 'parallel requires barrierReason: why must a later step see ALL branch results at once? If you cannot answer, this is not a barrier — use a sequence or fanout')
      }
      ;(node.branches || []).forEach((b, i) => walk(b, scope, `${path}.branches[${i}]`, depth))
      break
    }
    case 'fanout': {
      if (!['orchestrate', 'compare'].includes(node.mode)) {
        err(`${path}.mode`, `fanout mode must be "orchestrate" (per-item work over a list) or "compare" (N attempts at the same work), got ${JSON.stringify(node.mode)}`)
      }
      if (!nonEmpty(node.over)) err(`${path}.over`, 'fanout needs "over": the handoff name it consumes, optionally with a dotted field path (e.g. "scout.sections")')
      else {
        const segs = String(node.over).split('.')
        const head = segs[0]
        referenced.add(head)
        if (segs.some((s) => !IDENT_RE.test(s))) {
          err(`${path}.over`, `"${node.over}" is not a valid handoff reference — use a name or a dotted path of identifiers (e.g. "scout.sections")`)
        } else if (!scope.has(head)) {
          err(`${path}.over`, `fans out over "${node.over}" but nothing in scope produces "${head}" (in scope: ${[...scope].join(', ') || 'nothing'})`)
        } else if (node.mode === 'orchestrate') {
          if (head in CONSTANTS) {
            let v = CONSTANTS[head]
            let broken = null
            for (const seg of segs.slice(1)) {
              if (isObj(v) && seg in v) v = v[seg]
              else { broken = seg; break }
            }
            if (broken !== null) {
              err(`${path}.over`, `"${node.over}" — field "${broken}" does not exist in constant "${head}"`)
            } else if (!Array.isArray(v)) {
              err(`${path}.over`, `orchestrate iterates a list, but constant "${node.over}" is not an array — store the iteration target as an array (keep lookup maps as separate constants)`)
            }
          } else if (!LISTY_RE.test(segs[segs.length - 1])) {
            warn(`${path}.over`, `orchestrate iterates a list, but "${node.over}" does not read as one — rename it (e.g. "${node.over}List") or confirm it is a list`)
          }
        }
      }
      if (node.ordering !== undefined && !['concurrent', 'sequential'].includes(node.ordering)) {
        err(`${path}.ordering`, `ordering must be "concurrent" or "sequential", got ${JSON.stringify(node.ordering)}`)
      }
      if (node.ordering === 'sequential') {
        if (node.mode === 'compare') warn(`${path}.ordering`, 'sequential ordering only applies to orchestrate — compare attempts are independent by definition')
        if (!nonEmpty(node.orderingReason)) {
          err(`${path}.orderingReason`, 'sequential fanout requires orderingReason: why must items run one at a time (shared mutable resource, serialized merges)? If you cannot answer, keep it concurrent')
        }
      } else if (nonEmpty(node.orderingReason)) {
        warn(`${path}.orderingReason`, 'orderingReason given but ordering is not "sequential" — set ordering: "sequential" or drop the reason')
      }
      if (!nonEmpty(node.as) || !IDENT_RE.test(String(node.as))) {
        err(`${path}.as`, 'fanout needs "as": the per-item binding name used inside the body')
      }
      if (node.agents !== undefined) {
        if (node.mode !== 'compare') warn(`${path}.agents`, '"agents" only applies to compare mode; orchestrate width comes from the list')
        else if (!Number.isInteger(node.agents) || node.agents < 2) err(`${path}.agents`, 'compare needs agents >= 2')
      } else if (node.mode === 'compare') {
        warn(`${path}.agents`, 'compare mode without "agents": codegen will pick a count — set it to pin intent')
      }
      if (!isObj(node.body)) err(`${path}.body`, 'fanout needs a body activity')
      else {
        const inner = new Set(scope)
        if (nonEmpty(node.as)) inner.add(node.as)
        walk(node.body, inner, `${path}.body`, depth + 1)
      }
      if (depth + 1 >= 3) {
        warn(path, 'fan-out nested 3+ deep: item counts multiply — check against runtime concurrency (~16) and total-agent (1000) caps')
      }
      break
    }
    case 'loop': {
      if (!nonEmpty(node.stopCondition)) {
        err(`${path}.stopCondition`, 'loop requires stopCondition: when is it done? An unbounded loop is a vague loop')
      }
      if (!nonEmpty(node.noProgressCondition)) {
        err(`${path}.noProgressCondition`, 'loop requires noProgressCondition: when do we give up?')
      }
      if (node.maxRounds !== undefined && (!Number.isInteger(node.maxRounds) || node.maxRounds < 1)) {
        err(`${path}.maxRounds`, 'maxRounds must be a positive integer')
      }
      if (!isObj(node.body)) err(`${path}.body`, 'loop needs a body activity')
      else {
        // A later round may consume outputs of an earlier round, so body produces are in body scope.
        const inner = new Set([...scope, ...collectProduces(node.body)])
        walk(node.body, inner, `${path}.body`, depth)
      }
      break
    }
    case 'call': {
      if (!nonEmpty(node.workflowName)) err(`${path}.workflowName`, 'call needs workflowName')
      else {
        if (!NAME_RE.test(node.workflowName)) err(`${path}.workflowName`, `"${node.workflowName}" is not kebab-case`)
        const wf = join(projectDir, '.claude', 'workflows', `${node.workflowName}.js`)
        if (!existsSync(wf)) {
          warn(`${path}.workflowName`, `no ${wf} in this project — the call will fail at run time unless "${node.workflowName}" is generated or saved first`)
        }
      }
      if (node.args !== undefined) {
        if (!isObj(node.args)) err(`${path}.args`, 'call args must be an object of name -> value/reference')
        else for (const [k, v] of Object.entries(node.args)) checkRefs(v, scope, `${path}.args`, k)
      }
      break
    }
  }
}

// ---------- duplicate produces + name collision ----------

function checkDuplicates(t) {
  if (!isObj(t.root)) return
  const seen = new Map() // produces name -> { path, guarded }
  const visit = (node, path) => {
    if (!isObj(node)) return
    if (nonEmpty(node.produces)) {
      if (seen.has(node.produces)) {
        warn(`${path}.produces`, `"${node.produces}" is also produced at ${seen.get(node.produces).path} — downstream references are ambiguous; rename one`)
      } else seen.set(node.produces, { path, guarded: nonEmpty(node.when) })
    }
    childrenOf(node).forEach((c, i) => visit(c, `${path}.<${node.kind}>[${i}]`))
  }
  visit(t.root, '$.root')

  // A when-guarded producer named after an arg is the fallback idiom (compute the value
  // only when the arg is absent) — that shadowing is intentional; warn only when unguarded.
  const argNames = Object.keys(t.begin?.args ?? {})
  for (const a of argNames) {
    const hit = seen.get(a)
    if (hit && !hit.guarded) {
      warn('$.begin.args', `arg "${a}" is shadowed by an unguarded produces of the same name at ${hit.path} — rename one, or add a "when" guard on the arg's absence to make it a fallback producer`)
    }
  }
  for (const c of Object.keys(CONSTANTS)) {
    if (seen.has(c)) warn('$.begin.constants', `constant "${c}" is shadowed by a produces of the same name at ${seen.get(c).path}`)
  }
}

function checkCatalogCollision(t) {
  if (!nonEmpty(t?.meta?.name)) return
  const wfDir = join(projectDir, '.claude', 'workflows')
  if (!existsSync(wfDir)) return
  const existing = readdirSync(wfDir).includes(`${t.meta.name}.js`)
  if (existing) warn('$.meta.name', `.claude/workflows/${t.meta.name}.js already exists — regenerating will overwrite it (fine for regen, rename for a new thread)`)
}

// ---------- run ----------

checkTop(thread)
if (isObj(thread.root)) {
  const rootScope = new Set([...Object.keys(thread.begin?.args ?? {}), ...Object.keys(CONSTANTS)])
  walk(thread.root, rootScope, '$.root', 0)
}
checkDuplicates(thread)
checkCatalogCollision(thread)

for (const c of Object.keys(CONSTANTS)) {
  if (!referenced.has(c)) warn('$.begin.constants', `constant "${c}" is never referenced ({${c}} or fanout over) — reference it or drop it`)
}
for (const [name, p] of transformProduces) {
  if (!referenced.has(name)) warn(p, `transform produces "${name}" but nothing references it — consume it downstream or delete the transform`)
}

if (asJson) {
  console.log(JSON.stringify({ valid: errors.length === 0, errors, warnings }, null, 2))
} else {
  for (const e of errors) console.log(`ERROR    ${e.path}\n         ${e.msg}`)
  for (const w of warnings) console.log(`warning  ${w.path}\n         ${w.msg}`)
  console.log(errors.length === 0
    ? `\nVALID — ${warnings.length} warning(s). Thread is ready for codegen.`
    : `\nINVALID — ${errors.length} error(s), ${warnings.length} warning(s). Resolve errors (ask the engineer; do not guess) before codegen.`)
}
process.exit(errors.length === 0 ? 0 : 1)
