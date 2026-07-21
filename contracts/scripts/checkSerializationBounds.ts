// SPDX-License-Identifier: BUSL-1.1
//
// Static analyzer that flags Tolk types whose auto-serialization can overflow a single
// cell (1023 bits / 4 refs), using the ABI JSON emitted by `acton compile --abi`.
//
// Why this exists: types with custom pack/unpack (`packToBuilder`/`unpackFromSlice`)
// have a size that the Tolk compiler cannot verify statically -- e.g. CrossChainAddress
// in contracts/ccip/common/types.tolk is a variable-length slice bounded only by an
// `assert()` in hand-written code. The compiler happily lets you inline such a type into
// a struct without boxing it in Cell<>, and only a runtime assertion would ever catch an
// overflow. This script walks the ABI's type graph and computes worst-case bit/ref usage
// for every cell boundary (message bodies, storage, and every Cell<T> field), using a
// `abi.serialization = (minBits, maxBits, minRefs, maxRefs)` doc-comment annotation as the
// ground truth for custom-serialized types.
//
// Usage:
//   yarn ts-node scripts/checkSerializationBounds.ts [--verbose] [abi.json ...]
// With no arguments, the ABI for every contract in Acton.toml is (re)generated via
// `nix develop .#contracts -c acton compile --abi ...` and all of them are analyzed
// together as a single report. Pass explicit ABI JSON paths to skip generation.
// `acton`/`nix` output is captured and suppressed unless generation fails, or --verbose
// is passed.

import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { parseToml } from './abigen/toml'

type TyKind =
  | 'int'
  | 'intN'
  | 'uintN'
  | 'varintN'
  | 'varuintN'
  | 'coins'
  | 'bool'
  | 'cell'
  | 'builder'
  | 'slice'
  | 'string'
  | 'remaining'
  | 'address'
  | 'addressOpt'
  | 'addressExt'
  | 'addressAny'
  | 'bitsN'
  | 'nullLiteral'
  | 'callable'
  | 'void'
  | 'unknown'
  | 'nullable'
  | 'cellOf'
  | 'arrayOf'
  | 'lispListOf'
  | 'tensor'
  | 'shapedTuple'
  | 'mapKV'
  | 'EnumRef'
  | 'StructRef'
  | 'AliasRef'
  | 'genericT'
  | 'union'

interface Ty {
  kind: TyKind
  n?: number
  inner_ty_idx?: number
  items_ty_idx?: number[]
  key_ty_idx?: number
  value_ty_idx?: number
  enum_name?: string
  struct_name?: string
  alias_name?: string
  type_args_ty_idx?: number[]
  variants?: {
    variant_ty_idx: number
    prefix_num: number
    prefix_len: number
  }[]
  name_t?: string
}

interface ABICustomSerializers {
  pack_to_builder: boolean
  unpack_from_slice: boolean
}

interface ABIStructDecl {
  kind: 'struct'
  name: string
  ty_idx: number
  type_params?: string[]
  prefix?: { prefix_num: number; prefix_len: number }
  fields: { name: string; ty_idx: number }[]
  custom_pack_unpack?: ABICustomSerializers
  description?: string
}

interface ABIAliasDecl {
  kind: 'alias'
  name: string
  ty_idx: number
  target_ty_idx: number
  type_params?: string[]
  custom_pack_unpack?: ABICustomSerializers
  description?: string
}

interface ABIEnumDecl {
  kind: 'enum'
  name: string
  ty_idx: number
  encoded_as_ty_idx: number
  members: { name: string; value: string }[]
  custom_pack_unpack?: ABICustomSerializers
  description?: string
}

type ABIDecl = ABIStructDecl | ABIAliasDecl | ABIEnumDecl

interface ABIStructInstantiation {
  ty_idx: number
  struct_name: string
  monomorphic_fields_ty_idx: number[]
  custom_pack_unpack?: ABICustomSerializers
}

interface ABIAliasInstantiation {
  ty_idx: number
  alias_name: string
  monomorphic_target_ty_idx: number
  custom_pack_unpack?: ABICustomSerializers
}

interface ContractABI {
  contract_name: string
  unique_types: Ty[]
  struct_instantiations: ABIStructInstantiation[]
  alias_instantiations: ABIAliasInstantiation[]
  declarations: ABIDecl[]
  storage: { storage_ty_idx?: number; storage_at_deployment_ty_idx?: number }
  incoming_messages: { body_ty_idx: number }[]
  incoming_external: { body_ty_idx: number }[]
  outgoing_messages: { body_ty_idx: number }[]
  emitted_events: { body_ty_idx: number }[]
}

const CELL_MAX_BITS = 1023
const CELL_MAX_REFS = 4

interface Bounds {
  minBits: number
  maxBits: number
  minRefs: number
  maxRefs: number
}

const ZERO: Bounds = { minBits: 0, maxBits: 0, minRefs: 0, maxRefs: 0 }

function add(a: Bounds, b: Bounds): Bounds {
  return {
    minBits: a.minBits + b.minBits,
    maxBits: a.maxBits + b.maxBits,
    minRefs: a.minRefs + b.minRefs,
    maxRefs: a.maxRefs + b.maxRefs,
  }
}

// component-wise widest range across mutually-exclusive alternatives (e.g. union variants)
function widen(alternatives: Bounds[]): Bounds {
  return alternatives.reduce((acc, b) => ({
    minBits: Math.min(acc.minBits, b.minBits),
    maxBits: Math.max(acc.maxBits, b.maxBits),
    minRefs: Math.min(acc.minRefs, b.minRefs),
    maxRefs: Math.max(acc.maxRefs, b.maxRefs),
  }))
}

function bits(n: number): Bounds {
  return { minBits: n, maxBits: n, minRefs: 0, maxRefs: 0 }
}

function refs(n: number): Bounds {
  return { minBits: 0, maxBits: 0, minRefs: n, maxRefs: n }
}

interface CellReport {
  typeName: string
  context: string
  bounds: Bounds
  overflowsBits: boolean
  overflowsRefs: boolean
}

// Human-readable name for a ty_idx, e.g. 'Router_CCIPSend', 'Cell<TokenAmount>', 'A | B'.
function describeTy(abi: ContractABI, tyIdx: number): string {
  const t = abi.unique_types[tyIdx]
  if (!t) return `ty#${tyIdx}`
  switch (t.kind) {
    case 'StructRef':
      return t.struct_name!
    case 'AliasRef':
      return t.alias_name!
    case 'EnumRef':
      return t.enum_name!
    case 'cellOf':
      return `Cell<${describeTy(abi, t.inner_ty_idx!)}>`
    case 'nullable':
      return `${describeTy(abi, t.inner_ty_idx!)}?`
    case 'arrayOf':
      return `array<${describeTy(abi, t.inner_ty_idx!)}>`
    case 'lispListOf':
      return `list<${describeTy(abi, t.inner_ty_idx!)}>`
    case 'mapKV':
      return `map<${describeTy(abi, t.key_ty_idx!)}, ${describeTy(abi, t.value_ty_idx!)}>`
    case 'union':
      return t.variants!.map((v) => describeTy(abi, v.variant_ty_idx)).join(' | ')
    case 'tensor':
      return `(${t.items_ty_idx!.map((i) => describeTy(abi, i)).join(', ')})`
    case 'shapedTuple':
      return `[${t.items_ty_idx!.map((i) => describeTy(abi, i)).join(', ')}]`
    case 'intN':
    case 'uintN':
    case 'bitsN':
      return `${t.kind === 'intN' ? 'int' : t.kind === 'uintN' ? 'uint' : 'bits'}${t.n}`
    default:
      return t.kind
  }
}

interface Diagnostic {
  label: string
  message: string
  severity: 'error' | 'info'
}

// One `abi.serialization = (minBits, maxBits, minRefs, maxRefs)` doc-comment annotation,
// as documented in contracts/contracts/ccip/common/types.tolk.
const SERIALIZATION_ANNOTATION =
  /abi\.serialization\s*=\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/

function parseAnnotation(description: string | undefined): Bounds | null {
  if (!description) return null
  const m = SERIALIZATION_ANNOTATION.exec(description)
  if (!m) return null
  return {
    minBits: Number(m[1]),
    maxBits: Number(m[2]),
    minRefs: Number(m[3]),
    maxRefs: Number(m[4]),
  }
}

function baseName(name: string): string {
  const i = name.indexOf('<')
  return i === -1 ? name : name.slice(0, i)
}

class Analyzer {
  private readonly abi: ContractABI
  private readonly declByName = new Map<string, ABIDecl>()
  private readonly structInstByTyIdx = new Map<number, ABIStructInstantiation>()
  private readonly aliasInstByTyIdx = new Map<number, ABIAliasInstantiation>()
  private readonly boundsMemo = new Map<number, Bounds>()
  private readonly cellReports = new Map<number, CellReport>()
  readonly diagnostics: Diagnostic[] = []
  private readonly visiting = new Set<number>()

  constructor(abi: ContractABI) {
    this.abi = abi
    for (const d of abi.declarations) this.declByName.set(d.name, d)
    for (const si of abi.struct_instantiations) this.structInstByTyIdx.set(si.ty_idx, si)
    for (const ai of abi.alias_instantiations) this.aliasInstByTyIdx.set(ai.ty_idx, ai)
  }

  private ty(tyIdx: number): Ty {
    const t = this.abi.unique_types[tyIdx]
    if (!t) throw new Error(`unknown ty_idx ${tyIdx}`)
    return t
  }

  // Resolves a struct/alias reference to its (possibly monomorphized) fields/target,
  // custom-serializer flag, and the doc-comment description carrying the annotation.
  private resolveStruct(
    tyIdx: number,
    structName: string,
  ): {
    fieldTyIdx: number[]
    fieldNames: string[]
    prefixLen: number
    custom: boolean
    description?: string
  } {
    const decl = this.declByName.get(baseName(structName))
    const inst = this.structInstByTyIdx.get(tyIdx)
    const fieldTyIdx = inst
      ? inst.monomorphic_fields_ty_idx
      : decl && decl.kind === 'struct'
        ? decl.fields.map((f) => f.ty_idx)
        : []
    const fieldNames = decl && decl.kind === 'struct' ? decl.fields.map((f) => f.name) : []
    const custom = !!(
      inst?.custom_pack_unpack ??
      (decl && decl.kind === 'struct' ? decl.custom_pack_unpack : undefined)
    )
    const prefixLen = decl && decl.kind === 'struct' && decl.prefix ? decl.prefix.prefix_len : 0
    return { fieldTyIdx, fieldNames, prefixLen, custom, description: decl?.description }
  }

  private resolveAlias(
    tyIdx: number,
    aliasName: string,
  ): {
    targetTyIdx: number | null
    custom: boolean
    description?: string
  } {
    const decl = this.declByName.get(baseName(aliasName))
    const inst = this.aliasInstByTyIdx.get(tyIdx)
    const targetTyIdx = inst
      ? inst.monomorphic_target_ty_idx
      : decl && decl.kind === 'alias'
        ? decl.target_ty_idx
        : null
    const custom = !!(
      inst?.custom_pack_unpack ??
      (decl && decl.kind === 'alias' ? decl.custom_pack_unpack : undefined)
    )
    return { targetTyIdx, custom, description: decl?.description }
  }

  // Bounds contributed to the CURRENT cell by this type. Struct/alias fields without
  // their own cell boundary (i.e. not `cell`/`Cell<T>`) are inlined and keep accumulating
  // into the same cell; `cell`/`Cell<T>`/`string`/`array`/`map` fields terminate the
  // current cell's accumulation (contributing only their fixed-size flag/ref cost) and
  // register their own contents as independent cell boundaries via `registerCell`.
  computeBounds(tyIdx: number, label: string): Bounds {
    const memoized = this.boundsMemo.get(tyIdx)
    if (memoized) return memoized

    if (this.visiting.has(tyIdx)) {
      // Recursive type reached without crossing a cell boundary in between -- this can
      // only happen for a self-referential inline struct, which the Tolk compiler itself
      // rejects (infinite size), so this is unreachable in valid ABI. Guard defensively.
      this.diagnostics.push({
        label,
        message: `recursive type (ty_idx ${tyIdx}) without an intervening Cell<> boundary`,
        severity: 'error',
      })
      return ZERO
    }
    this.visiting.add(tyIdx)
    const result = this.computeBoundsUncached(tyIdx, label)
    this.visiting.delete(tyIdx)
    this.boundsMemo.set(tyIdx, result)
    return result
  }

  private computeBoundsUncached(tyIdx: number, label: string): Bounds {
    const t = this.ty(tyIdx)
    switch (t.kind) {
      case 'int':
      case 'builder':
      case 'slice':
        this.diagnostics.push({
          label,
          message: `type '${t.kind}' unknown serialization size`,
          severity: 'error',
        })
        return ZERO
      case 'intN':
      case 'uintN':
        return bits(t.n!)
      case 'varintN':
      case 'varuintN':
        // length prefix (4 or 5 bits) + up to N*8 payload bits
        return {
          minBits: t.n === 16 ? 4 : 5,
          maxBits: (t.n === 16 ? 4 : 5) + (t.n === 16 ? 15 : 31) * 8,
          minRefs: 0,
          maxRefs: 0,
        }
      case 'coins':
        return { minBits: 4, maxBits: 4 + 15 * 8, minRefs: 0, maxRefs: 0 }
      case 'bool':
        return bits(1)
      case 'address':
        return bits(267)
      case 'addressOpt':
        return { minBits: 2, maxBits: 267, minRefs: 0, maxRefs: 0 }
      case 'addressExt':
      case 'addressAny':
        return { minBits: 2, maxBits: 523, minRefs: 0, maxRefs: 0 }
      case 'bitsN':
        return bits(t.n!)
      case 'nullLiteral':
      case 'void':
        return ZERO
      case 'remaining':
        // whatever is left in the slice: doesn't add to the encoded size, it's the tail
        return ZERO
      case 'cell':
        return refs(1)
      case 'cellOf': {
        this.registerCell(t.inner_ty_idx!, `${label} (boxed cell content)`)
        return refs(1)
      }
      case 'string':
        // always a ^Cell (STREF); content is snake-encoded and self-chunking
        return refs(1)
      case 'arrayOf': {
        // uint8 length + bool has-next-ref flag, elements/chaining live in the ref chain
        const elemBounds = this.computeBounds(t.inner_ty_idx!, `${label}[]`)
        if (elemBounds.maxBits > CELL_MAX_BITS || elemBounds.maxRefs > CELL_MAX_REFS) {
          this.diagnostics.push({
            label: `${label}[]`,
            message: `array element type alone exceeds a single cell (max ${elemBounds.maxBits} bits / ${elemBounds.maxRefs} refs) and can never be chunked`,
            severity: 'error',
          })
        }
        return { minBits: 9, maxBits: 9, minRefs: 0, maxRefs: 1 }
      }
      case 'lispListOf':
        return refs(1)
      case 'mapKV':
        return { minBits: 1, maxBits: 1, minRefs: 0, maxRefs: 1 }
      case 'nullable': {
        const inner = this.computeBounds(t.inner_ty_idx!, label)
        return {
          minBits: 1,
          maxBits: 1 + inner.maxBits,
          minRefs: 0,
          maxRefs: inner.maxRefs,
        }
      }
      case 'tensor':
      case 'shapedTuple':
        return t.items_ty_idx!.reduce(
          (acc, itemTy, i) => add(acc, this.computeBounds(itemTy, `${label}.${i}`)),
          ZERO,
        )
      case 'union': {
        const alternatives = t.variants!.map((v) =>
          add(
            bits(v.prefix_len),
            this.computeBounds(v.variant_ty_idx, `${label}|${v.variant_ty_idx}`),
          ),
        )
        return widen(alternatives)
      }
      case 'EnumRef': {
        const decl = this.declByName.get(t.enum_name!)
        if (!decl || decl.kind !== 'enum') {
          this.diagnostics.push({
            label,
            message: `enum '${t.enum_name}' not found in declarations`,
            severity: 'error',
          })
          return ZERO
        }
        return this.computeBounds(decl.encoded_as_ty_idx, label)
      }
      case 'StructRef': {
        if (baseName(t.struct_name!) === 'UnsafeBodyNoRef') {
          // Escape hatch documented on the struct itself: the author asserts the wrapped
          // body fits in-place. Not statically verifiable from the ABI -- surfaced as info,
          // not an error, since it's an intentional, documented tradeoff.
          this.diagnostics.push({
            label,
            message: `UnsafeBodyNoRef forces in-place inlining; its bounds rely on a manual guarantee and are not checked here`,
            severity: 'info',
          })
          return ZERO
        }
        const { fieldTyIdx, fieldNames, prefixLen, custom, description } = this.resolveStruct(
          tyIdx,
          t.struct_name!,
        )
        if (custom) return this.customBoundsOrDiagnostic(label, description)
        const fieldsBounds = fieldTyIdx.reduce(
          (acc, fTy, i) =>
            add(acc, this.computeBounds(fTy, `${t.struct_name}.${fieldNames[i] ?? `#${i}`}`)),
          ZERO,
        )
        return add(bits(prefixLen), fieldsBounds)
      }
      case 'AliasRef': {
        const { targetTyIdx, custom, description } = this.resolveAlias(tyIdx, t.alias_name!)
        if (custom) return this.customBoundsOrDiagnostic(label, description)
        if (targetTyIdx === null) {
          this.diagnostics.push({
            label,
            message: `alias '${t.alias_name}' target not found`,
            severity: 'error',
          })
          return ZERO
        }
        return this.computeBounds(targetTyIdx, label)
      }
      case 'genericT':
        this.diagnostics.push({
          label,
          message: `unresolved generic type parameter '${t.name_t ?? ''}'`,
          severity: 'error',
        })
        return ZERO
      case 'callable':
      case 'unknown':
        this.diagnostics.push({
          label,
          message: `type '${t.kind}' cannot be serialized`,
          severity: 'error',
        })
        return ZERO
      default:
        this.diagnostics.push({
          label,
          message: `unhandled ty kind '${(t as Ty).kind}'`,
          severity: 'error',
        })
        return ZERO
    }
  }

  private customBoundsOrDiagnostic(label: string, description?: string): Bounds {
    const annotated = parseAnnotation(description)
    if (!annotated) {
      this.diagnostics.push({
        label,
        message:
          `custom pack/unpack type with no 'abi.serialization = (minBits, maxBits, minRefs, maxRefs)' ` +
          `doc-comment annotation -- bounds cannot be verified statically`,
        severity: 'error',
      })
      return ZERO
    }
    return annotated
  }

  registerCell(tyIdx: number, context: string) {
    if (this.cellReports.has(tyIdx)) return
    const typeName = describeTy(this.abi, tyIdx)
    // reserve the slot before recursing so a Cell<T> that (indirectly) contains another
    // Cell<T> of the same shape doesn't get analyzed twice
    this.cellReports.set(tyIdx, {
      typeName,
      context,
      bounds: ZERO,
      overflowsBits: false,
      overflowsRefs: false,
    })
    const bounds = this.computeBounds(tyIdx, `${typeName} (${context})`)
    const report: CellReport = {
      typeName,
      context,
      bounds,
      overflowsBits: bounds.maxBits > CELL_MAX_BITS,
      overflowsRefs: bounds.maxRefs > CELL_MAX_REFS,
    }
    this.cellReports.set(tyIdx, report)
  }

  getCellReports(): CellReport[] {
    return Array.from(this.cellReports.values())
  }
}

function analyzeAbiFile(filePath: string): {
  abi: ContractABI
  reports: CellReport[]
  diagnostics: Diagnostic[]
} {
  const abi: ContractABI = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const analyzer = new Analyzer(abi)

  const roots: { tyIdx: number; label: string }[] = []
  if (abi.storage.storage_ty_idx !== undefined) {
    roots.push({ tyIdx: abi.storage.storage_ty_idx, label: 'storage' })
  }
  if (abi.storage.storage_at_deployment_ty_idx !== undefined) {
    roots.push({
      tyIdx: abi.storage.storage_at_deployment_ty_idx,
      label: 'storage (at deployment)',
    })
  }
  abi.incoming_messages.forEach((m, i) =>
    roots.push({ tyIdx: m.body_ty_idx, label: `incoming message #${i}` }),
  )
  abi.incoming_external.forEach((m, i) =>
    roots.push({ tyIdx: m.body_ty_idx, label: `incoming external #${i}` }),
  )
  abi.outgoing_messages.forEach((m, i) =>
    roots.push({ tyIdx: m.body_ty_idx, label: `outgoing message #${i}` }),
  )
  abi.emitted_events.forEach((m, i) =>
    roots.push({ tyIdx: m.body_ty_idx, label: `emitted event #${i}` }),
  )

  for (const root of roots) {
    analyzer.registerCell(root.tyIdx, root.label)
  }

  return { abi, reports: analyzer.getCellReports(), diagnostics: analyzer.diagnostics }
}

// ---------------------------------------------------------------------------
//   manifest resolution + acton invocation (mirrors scripts/abigen.ts)
// ---------------------------------------------------------------------------

function findManifest(args: string[]): string {
  if (args.length > 0) {
    return path.resolve(args[0])
  }

  const cwd = process.cwd()
  const candidates = [path.join(cwd, 'Acton.toml'), path.join(cwd, 'contracts', 'Acton.toml')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate)
    }
  }

  throw new Error(
    'Acton.toml not found. Run from the contracts directory, repo root, or pass a manifest path.',
  )
}

interface ManifestContract {
  name: string
  src: string
}

function readManifestContracts(manifestPath: string): {
  projectRoot: string
  contracts: ManifestContract[]
} {
  const manifest = parseToml(fs.readFileSync(manifestPath, 'utf-8'))
  const projectRoot = path.dirname(manifestPath)

  const contractsTable: Record<string, { src: string }> = manifest.contracts ?? {}
  const contracts = Object.entries(contractsTable).map(([name, contract]) => ({
    name,
    src: contract.src,
  }))

  return { projectRoot, contracts }
}

// `nix develop .#contracts` resolves its flake ref relative to a directory containing
// flake.nix, which lives at the repo root, one level above the contracts/ project root.
function findRepoRoot(startDir: string): string {
  let dir = startDir
  while (!fs.existsSync(path.join(dir, 'flake.nix'))) {
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(`Could not find flake.nix above ${startDir}`)
    }
    dir = parent
  }
  return dir
}

function generateAbi(
  repoRoot: string,
  projectRoot: string,
  name: string,
  src: string,
  verbose: boolean,
): string {
  const outputPath = path.join(projectRoot, 'build', 'abi', `${name}.abi.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  try {
    execFileSync(
      'nix',
      ['develop', `${repoRoot}#contracts`, '-c', 'acton', 'compile', '--abi', outputPath, src],
      { cwd: projectRoot, stdio: verbose ? 'inherit' : 'pipe' },
    )
  } catch (err) {
    // acton/nix output is noisy (nix store paths, base64-encoded contract code, etc.) --
    // suppress it on the happy path and only surface it when something actually broke.
    if (!verbose && err && typeof err === 'object') {
      const { stdout, stderr } = err as { stdout?: Buffer | string; stderr?: Buffer | string }
      if (stdout && stdout.length > 0) process.stderr.write(stdout)
      if (stderr && stderr.length > 0) process.stderr.write(stderr)
    }
    throw new Error(`Failed to generate ABI for '${name}' (${src})`)
  }
  return outputPath
}

// ---------------------------------------------------------------------------
//   aggregation across all contracts into a single report
// ---------------------------------------------------------------------------

interface MergedReport {
  typeName: string
  bounds: Bounds
  overflowsBits: boolean
  overflowsRefs: boolean
  contexts: string[]
}

function boundsEqual(a: Bounds, b: Bounds): boolean {
  return (
    a.minBits === b.minBits &&
    a.maxBits === b.maxBits &&
    a.minRefs === b.minRefs &&
    a.maxRefs === b.maxRefs
  )
}

// The same Tolk type has the same bounds no matter which contract references it, so
// entries sharing a type name are folded into one line with all the places it's used.
function mergeReports(
  perContract: { contractName: string; reports: CellReport[] }[],
): MergedReport[] {
  const merged = new Map<string, MergedReport>()
  for (const { contractName, reports } of perContract) {
    for (const r of reports) {
      const context = `${contractName}: ${r.context}`
      const existing = merged.get(r.typeName)
      if (!existing) {
        merged.set(r.typeName, {
          typeName: r.typeName,
          bounds: r.bounds,
          overflowsBits: r.overflowsBits,
          overflowsRefs: r.overflowsRefs,
          contexts: [context],
        })
      } else if (boundsEqual(existing.bounds, r.bounds)) {
        existing.contexts.push(context)
      } else {
        // Unexpected: same name, different bounds across contracts (e.g. distinct local
        // types sharing a name). Keep both, disambiguated by contract.
        merged.set(`${r.typeName} (${contractName})`, {
          typeName: r.typeName,
          bounds: r.bounds,
          overflowsBits: r.overflowsBits,
          overflowsRefs: r.overflowsRefs,
          contexts: [context],
        })
      }
    }
  }
  return Array.from(merged.values())
}

interface MergedDiagnostic {
  label: string
  message: string
  severity: 'error' | 'info'
  contractNames: string[]
}

function mergeDiagnostics(
  perContract: { contractName: string; diagnostics: Diagnostic[] }[],
): MergedDiagnostic[] {
  const merged = new Map<string, MergedDiagnostic>()
  for (const { contractName, diagnostics } of perContract) {
    for (const d of diagnostics) {
      const key = `${d.severity}::${d.label}::${d.message}`
      const existing = merged.get(key)
      if (existing) {
        if (!existing.contractNames.includes(contractName))
          existing.contractNames.push(contractName)
      } else {
        merged.set(key, {
          label: d.label,
          message: d.message,
          severity: d.severity,
          contractNames: [contractName],
        })
      }
    }
  }
  return Array.from(merged.values())
}

function main() {
  const rawArgs = process.argv.slice(2)
  const verbose = rawArgs.includes('--verbose')
  const args = rawArgs.filter((a) => a !== '--verbose')

  const files: string[] =
    args.length > 0
      ? args.map((a) => path.resolve(a))
      : (() => {
          const manifestPath = findManifest([])
          const { projectRoot, contracts } = readManifestContracts(manifestPath)
          const repoRoot = findRepoRoot(projectRoot)
          return contracts.map(({ name, src }) => {
            console.log(`Generating ABI for ${name}...`)
            return generateAbi(repoRoot, projectRoot, name, src, verbose)
          })
        })()

  if (files.length === 0) {
    console.error(
      'No ABI JSON files found. Pass paths explicitly or configure contracts in Acton.toml.',
    )
    process.exit(1)
  }

  const perContract = files.map((file) => {
    const { abi, reports, diagnostics } = analyzeAbiFile(file)
    return { contractName: abi.contract_name, reports, diagnostics }
  })

  const merged = mergeReports(perContract)
  const mergedDiagnostics = mergeDiagnostics(perContract)

  const formatReport = (r: MergedReport) =>
    `${r.typeName}: ${r.bounds.minBits}-${r.bounds.maxBits} bits, ${r.bounds.minRefs}-${r.bounds.maxRefs} refs  (${r.contexts.join(', ')})`

  const unsafe = merged.filter((r) => r.overflowsBits || r.overflowsRefs)
  const safe = merged.filter((r) => !r.overflowsBits && !r.overflowsRefs)

  console.log('\n# Unsafe Types')
  if (unsafe.length === 0) console.log('  (none)')
  for (const r of unsafe) console.log(`  ${formatReport(r)}`)

  console.log('\n# Safe Types')
  if (safe.length === 0) console.log('  (none)')
  for (const r of safe) console.log(`  ${formatReport(r)}`)

  let hasFailure = unsafe.length > 0

  if (mergedDiagnostics.length > 0) {
    console.log('\n# Diagnostics')
    for (const d of mergedDiagnostics) {
      console.log(
        `  [${d.severity === 'error' ? 'WARN' : 'INFO'}] ${d.label}: ${d.message}  (${d.contractNames.join(', ')})`,
      )
      if (d.severity === 'error') hasFailure = true
    }
  }

  process.exit(hasFailure ? 1 : 0)
}

if (require.main === module) {
  main()
}

export { analyzeAbiFile, Analyzer, CELL_MAX_BITS, CELL_MAX_REFS }
