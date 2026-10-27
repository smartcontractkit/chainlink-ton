import {
  Blockchain,
  BlockchainTransaction,
  createMetricStore,
  fetchConfig,
  SendMessageResult,
} from '@ton/sandbox'
import { Address, Cell, fromNano } from '@ton/core'
import { loadConfigParamsAsSlice, parseFullConfig } from '@ton/ton'
import * as fs from 'fs'
import * as path from 'path'
import { opName } from './ccip/opNames'

// Contracts whose min values this report is for are `ccip`; `registry` (TokenAdminRegistry and
// entries) and `token` (pools, lockboxes, minters, jetton wallets) are budgeted on their own.
export type Owner = 'ccip' | 'registry' | 'token' | 'external'
type HopOwner = Owner | 'unknown'

/** Min values are 5x the measured compute (and storage) and 2x the measured forward fees. */
export const SAFETY_FACTOR = 5n
export const SAFETY_FACTOR_FORWARD = 2n

/** Min value a subtree must be given: compute and storage at SAFETY_FACTOR, forward fees at SAFETY_FACTOR_FORWARD. */
export function minValueBasis(hops: HopSummary[], root: number, owner: Owner = 'ccip'): bigint {
  let out = 0n
  const visit = (i: number) => {
    const hop = hops[i]
    if (hop.owner === owner) {
      out +=
        (hop.computeFee + hop.storageFee) * SAFETY_FACTOR + hop.forwardFee * SAFETY_FACTOR_FORWARD
    }
    hop.children.forEach(visit)
  }
  visit(root)
  return out
}

export type Network = 'mainnet' | 'testnet' | 'default'

export function gasReportNetwork(): Network {
  return (process.env['GAS_REPORT_NETWORK'] ??
    process.env['TAR_FLOWS_NETWORK'] ??
    'mainnet') as Network
}

export const SNAPSHOT_DIR = path.join(__dirname, 'ccip', 'snapshots')
const CONFIG_DIR = path.join(__dirname, 'ccip', 'config')

/** Blockchain config for the selected network, fetched once and kept in `ccip/config/`. */
export async function gasReportConfig(): Promise<Cell | undefined> {
  const network = gasReportNetwork()
  if (network === 'default') return undefined
  const file = path.join(CONFIG_DIR, `${network}.base64`)
  if (!fs.existsSync(file)) {
    const config = await fetchConfig(network)
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(file, config.toBoc().toString('base64') + '\n')
  }
  return Cell.fromBase64(fs.readFileSync(file, 'utf8').trim())
}

// Receiver-attributed fees used by the TokenAdminRegistry specs: a transaction pays the forward
// fee of its incoming message. A message's forwardFee excludes the 1/3 its sender paid in totalFees.
export const fullForwardFee = (remaining: bigint) => (remaining * 3n) / 2n

export const inForwardFee = (tx: BlockchainTransaction) => {
  const info = tx.inMessage?.info
  return info?.type === 'internal' ? fullForwardFee(info.forwardFee) : 0n
}

/** Fees a transaction pays besides the forward fees of the internal messages it sends. */
export const ownFee = (tx: BlockchainTransaction) =>
  tx.totalFees.coins -
  tx.outMessages
    .values()
    .reduce((sum, m) => sum + (m.info.type === 'internal' ? m.info.forwardFee / 2n : 0n), 0n)

export const txFee = (tx: BlockchainTransaction) => inForwardFee(tx) + ownFee(tx)

export const storageFee = (tx: BlockchainTransaction) =>
  tx.description.type === 'generic' ? (tx.description.storagePhase?.storageFeesCollected ?? 0n) : 0n

export const op = (tx: BlockchainTransaction) => {
  const body = tx.inMessage!.body.beginParse()
  return body.remainingBits >= 32 ? body.preloadUint(32) : undefined
}

export const isInternal = (tx: BlockchainTransaction, src?: Address, dest?: Address) => {
  const info = tx.inMessage?.info
  return (
    info?.type === 'internal' &&
    (src === undefined || info.src.equals(src)) &&
    (dest === undefined || info.dest.equals(dest))
  )
}

export interface HopSummary {
  index: number
  parent: number | null
  children: number[]
  from: string
  to: string
  owner: HopOwner
  op: string
  success: boolean
  exitCode: number | null
  actionResultCode: number | null
  gasUsed: bigint
  computeFee: bigint
  storageFee: bigint
  forwardFee: bigint
  actionFee: bigint
  totalFee: bigint
  /** Sender-attributed: storage + compute + full forward fees of the outgoing messages. */
  cost: bigint
  valueIn: bigint
  valueOut: bigint
  /** Balance change of the receiving contract */
  retained: bigint
}

export type OwnerTotals = Record<Owner, bigint>

export interface EntrypointCost {
  hop: number
  contract: string
  op: string
  /** Cost of the hop and everything downstream of it, by owner */
  cost: OwnerTotals
  retained: bigint
}

export interface FlowSummary {
  label: string
  hops: HopSummary[]
  totals: OwnerTotals
  retained: Record<string, bigint>
  entrypoints: EntrypointCost[]
}

export class AddressBook {
  private readonly names = new Map<string, string>()
  private readonly owners = new Map<string, Owner>()

  constructor(entries: Record<string, [Address | { address: Address }, Owner]> = {}) {
    for (const [name, [addr, owner]] of Object.entries(entries)) this.set(name, addr, owner)
  }

  set(name: string, addr: Address | { address: Address }, owner: Owner): this {
    const raw = (addr instanceof Address ? addr : addr.address).toRawString()
    this.names.set(raw, name)
    this.owners.set(raw, owner)
    return this
  }

  name(address: Address | null | undefined): string {
    if (!address) return 'External'
    const raw = address.toRawString()
    return this.names.get(raw) ?? `${raw.slice(0, 8)}…${raw.slice(-4)}`
  }

  owner(address: Address | null | undefined): HopOwner {
    if (!address) return 'external'
    return this.owners.get(address.toRawString()) ?? 'unknown'
  }

  address(name: string): Address | undefined {
    for (const [raw, n] of this.names) if (n === name) return Address.parseRaw(raw)
    return undefined
  }

  entries(): [string, Address][] {
    return [...this.names].map(([raw, name]) => [name, Address.parseRaw(raw)])
  }
}

const emptyTotals = (): OwnerTotals => ({ ccip: 0n, registry: 0n, token: 0n, external: 0n })

function summarizeHop(
  tx: BlockchainTransaction,
  index: number,
  indexOf: Map<BlockchainTransaction, number>,
  book: AddressBook,
): HopSummary {
  const inMsg = tx.inMessage
  const internal = inMsg?.info.type === 'internal' ? inMsg.info : null
  const dest = inMsg?.info.dest instanceof Address ? inMsg.info.dest : null

  let opLabel = 'empty'
  const body = inMsg?.body.beginParse()
  if (!internal) {
    opLabel = 'external'
  } else if (internal.bounced) {
    opLabel = 'bounced'
  } else if (body && body.remainingBits >= 32) {
    opLabel = opName(body.preloadUint(32))
  }

  let gasUsed = 0n
  let computeFee = 0n
  let storage = 0n
  let forwardFee = 0n
  let actionFee = 0n
  let bounceFee = 0n
  let success = true
  let exitCode: number | null = null
  let actionResultCode: number | null = null
  if (tx.description.type === 'generic') {
    const { computePhase, actionPhase, storagePhase, bouncePhase, aborted } = tx.description
    if (computePhase.type === 'vm') {
      gasUsed = computePhase.gasUsed
      computeFee = computePhase.gasFees
      exitCode = computePhase.exitCode
    }
    storage = storagePhase?.storageFeesCollected ?? 0n
    forwardFee = actionPhase?.totalFwdFees ?? 0n
    actionFee = actionPhase?.totalActionFees ?? 0n
    actionResultCode = actionPhase?.resultCode ?? null
    // The bounce message's forward fee is taken from the value and is not part of totalFees.
    if (bouncePhase?.type === 'ok') bounceFee = bouncePhase.forwardFees
    success = !aborted
  }

  const valueIn = internal?.value.coins ?? 0n
  const valueOut = tx.outMessages
    .values()
    .reduce((sum, msg) => sum + (msg.info.type === 'internal' ? msg.info.value.coins : 0n), 0n)
  const totalFee = tx.totalFees.coins

  return {
    index,
    parent: tx.parent ? (indexOf.get(tx.parent) ?? null) : null,
    children: tx.children
      .map((child) => indexOf.get(child))
      .filter((i): i is number => i !== undefined),
    from: internal ? book.name(internal.src) : 'External',
    to: book.name(dest),
    owner: book.owner(dest),
    op: opLabel,
    success,
    exitCode,
    actionResultCode,
    gasUsed,
    computeFee,
    storageFee: storage,
    forwardFee,
    actionFee,
    totalFee,
    cost: storage + computeFee + forwardFee,
    valueIn,
    valueOut,
    retained: valueIn - valueOut - totalFee - (forwardFee - actionFee) - bounceFee,
  }
}

function subtreeCost(hops: HopSummary[], root: number): { cost: OwnerTotals; retained: bigint } {
  const cost = emptyTotals()
  let retained = 0n
  const visit = (i: number) => {
    const hop = hops[i]
    if (hop.owner !== 'unknown') cost[hop.owner] += hop.cost
    retained += hop.retained
    hop.children.forEach(visit)
  }
  visit(root)
  return { cost, retained }
}

export function analyzeFlow(
  label: string,
  result: SendMessageResult,
  book: AddressBook,
): FlowSummary {
  const indexOf = new Map(result.transactions.map((tx, i) => [tx, i]))
  const hops = result.transactions.map((tx, i) => summarizeHop(tx, i, indexOf, book))

  const totals = emptyTotals()
  const retained: Record<string, bigint> = {}
  for (const hop of hops) {
    if (hop.owner !== 'unknown') totals[hop.owner] += hop.cost
    retained[hop.to] = (retained[hop.to] ?? 0n) + hop.retained
  }
  const entrypoints = hops
    .filter((hop) => hop.owner === 'ccip' && hop.op !== 'bounced')
    .map((hop) => ({
      hop: hop.index,
      contract: hop.to,
      op: hop.op,
      ...subtreeCost(hops, hop.index),
    }))

  return { label, hops, totals, retained, entrypoints }
}

export function formatRow(cells: string[], widths: number[]): string {
  return cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ')
}

const ton = (nano: bigint) => fromNano(nano)

function failureCode(hop: HopSummary): string {
  if (hop.exitCode !== null && hop.exitCode !== 0 && hop.exitCode !== 1) return String(hop.exitCode)
  return `action ${hop.actionResultCode ?? '-'}`
}

/** Basechain gas price from config param 21, in nanotons per 2^16 gas units. */
export function gasPrice(blockchain: Blockchain): bigint {
  const config = parseFullConfig(loadConfigParamsAsSlice(blockchain.configBase64))
  return config.gasPrices.workchain.other.gasPrice
}

export function printFlowAnalysis(flow: FlowSummary, gasPrice: bigint): void {
  console.log(`\n=== ${flow.label.toUpperCase()} ===\n`)

  const widths = [3, 22, 22, 8, 40, 8, 10, 10, 10, 10, 10, 10, 10, 5]
  console.log(
    formatRow(
      [
        '#',
        'From',
        'To',
        'Owner',
        'Op',
        'Gas',
        'Compute',
        'Storage',
        'Fwd (out)',
        'Cost',
        'Value in',
        'Value out',
        'Retained',
        'Exit',
      ],
      widths,
    ),
  )
  for (const hop of flow.hops) {
    console.log(
      formatRow(
        [
          String(hop.index + 1),
          hop.from,
          hop.to,
          hop.owner,
          hop.op,
          hop.gasUsed.toString().padStart(widths[5]),
          ton(hop.computeFee).padStart(widths[6]),
          ton(hop.storageFee).padStart(widths[7]),
          ton(hop.forwardFee).padStart(widths[8]),
          ton(hop.cost).padStart(widths[9]),
          ton(hop.valueIn).padStart(widths[10]),
          ton(hop.valueOut).padStart(widths[11]),
          ton(hop.retained).padStart(widths[12]),
          hop.success ? String(hop.exitCode ?? '-') : `FAIL ${failureCode(hop)}`,
        ],
        widths,
      ),
    )
  }

  console.log('\nCost by owner (TON):')
  for (const owner of Object.keys(flow.totals) as Owner[]) {
    console.log(`  ${owner.padEnd(9)} ${ton(flow.totals[owner])}`)
  }
  const total = Object.values(flow.totals).reduce((a, b) => a + b, 0n)
  console.log(`  ${'total'.padEnd(9)} ${ton(total)}`)

  console.log('\nEntrypoint subtree cost (TON; the hop and everything downstream of it):')
  const ewidths = [3, 22, 40, 10, 10, 10, 10, 10, 10, 10]
  console.log(
    formatRow(
      [
        '#',
        'Contract',
        'Op',
        'CCIP',
        'Registry',
        'Token',
        'External',
        'Total',
        'Gas eq',
        'Retained',
      ],
      ewidths,
    ),
  )
  for (const e of flow.entrypoints) {
    const sum = Object.values(e.cost).reduce((a, b) => a + b, 0n)
    console.log(
      formatRow(
        [
          String(e.hop + 1),
          e.contract,
          e.op,
          ton(e.cost.ccip).padStart(ewidths[3]),
          ton(e.cost.registry).padStart(ewidths[4]),
          ton(e.cost.token).padStart(ewidths[5]),
          ton(e.cost.external).padStart(ewidths[6]),
          ton(sum).padStart(ewidths[7]),
          ((sum << 16n) / gasPrice).toString().padStart(ewidths[8]),
          ton(e.retained).padStart(ewidths[9]),
        ],
        ewidths,
      ),
    )
  }

  const sinks = Object.entries(flow.retained).filter(([, v]) => v !== 0n)
  if (sinks.length > 0) {
    console.log('\nBalance change per contract (TON):')
    for (const [name, v] of sinks) console.log(`  ${name.padEnd(24)} ${ton(v)}`)
  }
}

// The sandbox reporter persists whatever is left in the metric store when a test file finishes,
// so measured flows are tracked to drop setup transactions in `keepOnlyMeasuredMetrics`.
const measuredMetrics: unknown[] = []

export async function measureFlow(
  send: () => Promise<SendMessageResult>,
): Promise<SendMessageResult> {
  const store = createMetricStore()
  const start = store.length
  const result = await send()
  measuredMetrics.push(...store.slice(start))
  return result
}

export function keepOnlyMeasuredMetrics(): void {
  const store = createMetricStore()
  store.length = 0
  store.push(...(measuredMetrics as typeof store))
}

export interface FlowSpec {
  run: () => Promise<SendMessageResult>
  book: AddressBook
  /** Names addresses only known after the run (executors, deposit accounts). */
  discover?: (result: SendMessageResult, book: AddressBook) => void | Promise<void>
  /** Hops expected to abort, as `From->To`. */
  aborts?: string[]
  /** CCIP part of the value the entrypoint was sent; when set, the CCIP subtree's min value basis must fit in it. */
  budget?: bigint
}

type Json = { [key: string]: Json } | Json[] | string | number | boolean | null

function toJson(value: unknown): Json {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(toJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]))
  }
  return value as Json
}

export class GasReport {
  readonly network = gasReportNetwork()
  readonly gasPrice: bigint
  readonly flows: FlowSummary[] = []

  constructor(
    readonly name: string,
    readonly blockchain: Blockchain,
  ) {
    this.gasPrice = gasPrice(blockchain)
  }

  private async balances(book: AddressBook): Promise<Map<string, bigint>> {
    const out = new Map<string, bigint>()
    for (const [name, address] of book.entries()) {
      out.set(name, (await this.blockchain.getContract(address)).balance)
    }
    return out
  }

  async measure(
    label: string,
    spec: FlowSpec,
  ): Promise<{ result: SendMessageResult; flow: FlowSummary }> {
    const before = await this.balances(spec.book)
    const result = await measureFlow(spec.run)
    await spec.discover?.(result, spec.book)
    const flow = analyzeFlow(label, result, spec.book)
    printFlowAnalysis(flow, this.gasPrice)
    this.flows.push(flow)

    const unknown = flow.hops.filter((hop) => hop.owner === 'unknown').map((hop) => hop.to)
    expect({ unknownAddresses: [...new Set(unknown)] }).toEqual({ unknownAddresses: [] })

    const aborted = flow.hops.filter((hop) => !hop.success).map((hop) => `${hop.from}->${hop.to}`)
    expect({ aborted }).toEqual({ aborted: spec.aborts ?? [] })

    // `retained` must match the real balance change, and no CCIP contract may fund the flow beyond
    // its own storage fees, unless it is drained on purpose (executors, MerkleRoot).
    const after = await this.balances(spec.book)
    const losses: Record<string, string> = {}
    for (const [name, address] of spec.book.entries()) {
      const delta = after.get(name)! - (before.get(name) ?? 0n)
      const retained = flow.retained[name] ?? 0n
      // Storage fees round by a nanoton per transaction.
      const drift = delta > retained ? delta - retained : retained - delta
      expect({ [name]: { delta, retained, withinTolerance: drift <= 10n } }).toMatchObject({
        [name]: { withinTolerance: true },
      })
      const owner = spec.book.owner(address)
      const storage = flow.hops
        .filter((hop) => hop.to === name)
        .reduce((s, hop) => s + hop.storageFee, 0n)
      if (
        (owner === 'ccip' || owner === 'registry') &&
        delta + storage < 0n &&
        after.get(name) !== 0n
      ) {
        losses[name] = fromNano(delta)
      }
    }
    expect({ losses }).toEqual({ losses: {} })

    if (spec.budget !== undefined) {
      const basis = minValueBasis(flow.hops, flow.entrypoints[0].hop)
      expect({
        ccipCost: fromNano(flow.entrypoints[0].cost.ccip),
        minValueBasis: fromNano(basis),
        budget: fromNano(spec.budget),
        fits: basis <= spec.budget,
      }).toMatchObject({ fits: true })
    }
    return { result, flow }
  }

  /** Writes the snapshot and keeps only measured transactions in the sandbox report. */
  finish(): void {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
    const file = path.join(SNAPSHOT_DIR, `${this.name}.${this.network}.json`)
    const snapshot = { network: this.network, gasPrice: this.gasPrice, flows: this.flows }
    fs.writeFileSync(file, JSON.stringify(toJson(snapshot), null, 2) + '\n')
    keepOnlyMeasuredMetrics()
  }
}
