import * as fs from 'fs'
import * as path from 'path'
import { Slice } from '@ton/core'

const GEN_DIR = path.resolve(__dirname, '../../wrappers/gen')

export interface OpcodeEntry {
  name: string
  fromSlice: (s: Slice) => Record<string, unknown> & { readonly $: string }
}

function collectGenFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectGenFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      files.push(full)
    }
  }
  return files
}

function isOpcodeStruct(value: unknown): value is {
  PREFIX: number
  fromSlice: (s: Slice) => Record<string, unknown> & { readonly $: string }
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).PREFIX === 'number' &&
    typeof (value as Record<string, unknown>).fromSlice === 'function'
  )
}

let registry: Map<number, OpcodeEntry[]> | undefined

/**
 * Builds a map of 32-bit opcode prefix -> candidate decoders, by scanning every generated
 * wrapper under `wrappers/gen` for structs with a `PREFIX` + `fromSlice`. This means new
 * contracts or regenerated bindings are picked up automatically without touching this file.
 *
 * The same struct is often redeclared per-contract-file (e.g. `OnRamp_Send` appears in both
 * `OnRamp.ts` and `Router.ts`), and only the copy living in its "owning" contract has any
 * custom pack/unpack callbacks (e.g. for `CrossChainAddress`) registered against it. So every
 * candidate for a given prefix is kept, and the caller tries each until one decodes cleanly.
 */
export function getOpcodeRegistry(): Map<number, OpcodeEntry[]> {
  if (registry) return registry
  registry = new Map()
  for (const file of collectGenFiles(GEN_DIR)) {
    let mod: Record<string, unknown>
    try {
      mod = require(file) as Record<string, unknown>
    } catch {
      continue
    }
    for (const [exportName, value] of Object.entries(mod)) {
      if (isOpcodeStruct(value)) {
        const entries = registry.get(value.PREFIX) ?? []
        entries.push({ name: exportName, fromSlice: value.fromSlice })
        registry.set(value.PREFIX, entries)
      }
    }
  }
  return registry
}
