import * as fs from 'fs'
import * as path from 'path'
import { Slice } from '@ton/core'
import { setupGenBindings } from '../../wrappers/gen'

const GEN_DIR = path.resolve(__dirname, '../../wrappers/gen')

export interface OpcodeEntry {
  name: string
  fromSlice: (s: Slice) => Record<string, unknown> & { readonly $: string }
}

function hasPrefix(value: unknown): value is { PREFIX: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).PREFIX === 'number'
  )
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
let names: Map<number, Set<string>> | undefined

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
  try {
    // Individual spec files call this themselves when they need it directly; here we call it
    // defensively so decoding still works even for specs (like debugging via `dump()`) that
    // never call it. Swallow "already registered" errors since a spec file may have called it
    // first.
    setupGenBindings()
  } catch {
    // already registered by the spec under test
  }

  let localRegistry = new Map<number, OpcodeEntry[]>()
  let localNames = new Map<number, Set<string>>()
  for (const file of collectGenFiles(GEN_DIR)) {
    let mod: Record<string, unknown>
    try {
      mod = require(file) as Record<string, unknown>
    } catch {
      continue
    }
    for (const [exportName, value] of Object.entries(mod)) {
      if (hasPrefix(value)) {
        const nameSet = localNames.get(value.PREFIX) ?? new Set<string>()
        nameSet.add(exportName)
        localNames.set(value.PREFIX, nameSet)
      }
      if (isOpcodeStruct(value)) {
        const entries = localRegistry.get(value.PREFIX) ?? []
        entries.push({ name: exportName, fromSlice: value.fromSlice })
        localRegistry.set(value.PREFIX, entries)
      }
    }
  }
  registry = localRegistry
  names = localNames
  return registry
}

/**
 * Names of every struct declaring a given opcode `PREFIX`, even ones with no `fromSlice` (e.g.
 * generic structs like `FeeQuoter_GetValidatedFee<T>`, whose `context: T` field depends on the
 * call site and so can't be decoded generically). Used as a fallback label when nothing in
 * `getOpcodeRegistry()` can actually decode the body.
 */
export function getOpcodeNames(opcode: number): string[] {
  getOpcodeRegistry()
  return Array.from(names?.get(opcode) ?? [])
}
