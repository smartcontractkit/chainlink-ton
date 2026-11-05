import {
  Blockchain,
  BlockchainTransaction,
  createMetricStore,
  fetchConfig,
  SendMessageResult,
} from '@ton/sandbox'
import { Address, Cell, fromNano, Slice } from '@ton/core'
import { loadConfigParamsAsSlice, parseFullConfig } from '@ton/ton'
import { flattenTransaction } from '@ton/test-utils'
import type { FlatTransaction } from '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import { opName } from './ccip/opNames'

// Contracts whose min values this report is for are `ccip`; `registry` (TokenAdminRegistry and
// entries) and `token` (pools, lockboxes, minters, jetton wallets) are budgeted on their own.
export type Owner = 'ccip' | 'registry' | 'token' | 'external'
type HopOwner = Owner | 'unknown'

/** Min values are 3x the measured compute (and storage) and 2x the measured forward fees. */
export const SAFETY_FACTOR = 3n
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
  try {
    return Cell.fromBase64(fs.readFileSync(file, 'utf8').trim())
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const config = await fetchConfig(network)
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(file, config.toBoc().toString('base64') + '\n')
  return config
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
  /** Incoming message op name; the raw opcode, phases and message value live on `tx`. */
  op: string
  /** Bounce kind of the incoming message (`simple`/`rich`), or null for normal messages. */
  bounce: BounceKind | null
  /** The flattened transaction (@ton/test-utils): `tx.success`, `tx.exitCode`, `tx.value`, ... */
  tx: FlatTransaction
  /** Gas units burned by the compute phase. */
  gasUsed: bigint
  /** Compute-fee component of the transaction, charged to the receiving contract. */
  computeFee: bigint
  /** Storage fee collected from the receiving contract (0 with `blockchain.now` frozen). */
  storageFee: bigint
  /**
   * Full forward fees of the receiving contract's OUTGOING messages, paid from its balance
   * (or from the outgoing messages' value, depending on the send mode). Not the forward fee
   * of the incoming message — that one was paid by the sender of this hop.
   */
  forwardFee: bigint
  /** Part of `forwardFee` actually charged in the action phase (the rest is the sender's share). */
  actionFee: bigint
  /** Sender-attributed: storage + compute + full forward fees of the outgoing messages. */
  cost: bigint
  /** TON carried by the receiving contract's outgoing internal messages. */
  valueOut: bigint
  /**
   * Balance change of the receiving contract: `tx.value` (value in) minus `valueOut`, all fees
   * and bounce fees. Positive = the contract kept value (a sink unless covered by a rule).
   */
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

/**
 * Classifies a bounced message: `simple` (0xffffffff prefix, up to 256 bits of the original body
 * follow) or `rich` (0xfffffffe prefix, a `RichBounceBody` ref carries the original body). The
 * original op is recovered from the bounce body so rules can name the message that bounced.
 */
function classifyBounce(body: Slice): { bounce: BounceKind; op: string } {
  const prefix = body.loadUint(32)
  if (prefix === 0xfffffffe) {
    // RichBounceBody { originalBody: cell, ... }: the original op is its first 32 bits.
    const originalBody = body.loadRef().beginParse()
    return {
      bounce: 'rich',
      op: originalBody.remainingBits >= 32 ? opName(originalBody.preloadUint(32)) : 'empty',
    }
  }
  // Simple bounce: the original body (op first) follows the 0xffffffff prefix.
  return { bounce: 'simple', op: body.remainingBits >= 32 ? opName(body.preloadUint(32)) : 'empty' }
}

/** Op name and bounce kind of a transaction's incoming message, shared by hops and violations. */
function inMessageOp(tx: BlockchainTransaction): { op: string; bounce: BounceKind | null } {
  const inMsg = tx.inMessage
  const internal = inMsg?.info.type === 'internal' ? inMsg.info : null
  const body = inMsg?.body.beginParse()
  if (!internal) return { op: 'external', bounce: null }
  if (internal.bounced) return classifyBounce(body!)
  return {
    op: body && body.remainingBits >= 32 ? opName(body.preloadUint(32)) : 'empty',
    bounce: null,
  }
}

function summarizeHop(
  tx: BlockchainTransaction,
  index: number,
  indexOf: Map<BlockchainTransaction, number>,
  book: AddressBook,
): HopSummary {
  const inMsg = tx.inMessage
  const internal = inMsg?.info.type === 'internal' ? inMsg.info : null
  const dest = inMsg?.info.dest instanceof Address ? inMsg.info.dest : null

  const { op: opLabel, bounce } = inMessageOp(tx)

  let gasUsed = 0n
  let computeFee = 0n
  let storage = 0n
  let forwardFee = 0n
  let actionFee = 0n
  let bounceFee = 0n
  if (tx.description.type === 'generic') {
    const { computePhase, actionPhase, storagePhase, bouncePhase } = tx.description
    if (computePhase.type === 'vm') {
      gasUsed = computePhase.gasUsed
      computeFee = computePhase.gasFees
    }
    storage = storagePhase?.storageFeesCollected ?? 0n
    forwardFee = actionPhase?.totalFwdFees ?? 0n
    actionFee = actionPhase?.totalActionFees ?? 0n
    // The bounce message's forward fee is taken from the value and is not part of totalFees.
    if (bouncePhase?.type === 'ok') bounceFee = bouncePhase.forwardFees
  }

  // Inputs to `retained`; the flattened tx carries the message value and total fees themselves.
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
    bounce,
    tx: flattenTransaction(tx),
    gasUsed,
    computeFee,
    storageFee: storage,
    forwardFee,
    actionFee,
    cost: storage + computeFee + forwardFee,
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
    .filter((hop) => hop.owner === 'ccip' && hop.bounce === null)
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
  const { exitCode, actionResultCode } = hop.tx
  if (exitCode !== undefined && exitCode !== 0 && exitCode !== 1) return String(exitCode)
  return `action ${actionResultCode ?? '-'}`
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
          ton(hop.tx.value ?? 0n).padStart(widths[10]),
          ton(hop.valueOut).padStart(widths[11]),
          ton(hop.retained).padStart(widths[12]),
          hop.tx.success ? String(hop.tx.exitCode ?? '-') : `FAIL ${failureCode(hop)}`,
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

/** A transaction whose receiving contract's balance changed without being whitelisted. */
export interface BalanceViolation {
  /** Raw address of the receiving contract; resolved to its book name after `discover`. */
  address: string
  op: string
  /** Logical time of the violation's transaction; matches the hop's `tx.lt`. */
  lt: bigint
  /** Balance after minus before, in nanotons. */
  delta: bigint
  /** Receiving contract's balance after the transaction, in nanotons. */
  balance: bigint
  valueIn: bigint
  /** How the incoming message was bounced, or `null` for a normal message. */
  bounce: BounceKind | null
}

/**
 * Bounce kinds, mirroring the Tolk `BounceMode` of the message that bounced back:
 * - `simple`: `Only256BitsOfBody` (the default `bounce: true`) — the body is the 0xffffffff
 *   prefix followed by up to 256 bits of the original outgoing body, so the original op can
 *   be read right after the prefix.
 * - `rich`: `RichBounceBody` (0xfffffffe prefix) — a struct carrying the original body as a
 *   cell, plus exit codes.
 */
export type BounceKind = 'simple' | 'rich'

/** Analyzed flow handed to amount callbacks, so a rule can reference other hops. */
export interface BalanceContext {
  /** All hops of the flow, in execution order. */
  hops: HopSummary[]
  /** The hop the rule is being evaluated against (same as the violation's hop). */
  readonly current: HopSummary
  /** The `occurrence`-th (0-based) hop with the given op; throws when absent. */
  hop(op: string, occurrence?: number): HopSummary
  /** Summed balance delta of the contract's hops, optionally filtered by op. */
  delta(contract: string, op?: string): bigint
}

/**
 * Allowed balance change of a hop, as an absolute amount or derived from the analyzed flow
 * (e.g. `(ctx) => ctx.hop('MintNewJettons').valueOut`).
 */
export type BalanceAmount = bigint | ((ctx: BalanceContext) => bigint)

/** Selector shared by every rule shape. */
export interface BalanceRuleSelector {
  /** AddressBook name of the receiving contract. */
  contract: string
  /**
   * Bounce kind to match: `'simple'`/`'rich'` match only bounces of that kind (the rule's `op`
   * names the ORIGINAL message that bounced), `null` matches only non-bounced messages, and
   * omitted matches both. For a simple bounce the op is read from the 32 bits after the
   * 0xffffffff prefix; for a rich bounce, from the original body cell.
   */
  bounce?: BounceKind | null
  /** Incoming message op name; each rule matches exactly the one message it names. */
  op: string
  /** Sender name, to disambiguate repeated (contract, op) pairs. */
  from?: string
  /**
   * The rule's amount constraint may go unexercised: no error when no balance violation matches
   * it (the hop must still exist — use for hops that only sometimes retain value, e.g. a jetton
   * wallet keeping its storage reserve on the transfer that deploys it).
   */
  optional?: boolean
}

/**
 * A balance-change expectation for the hops of one contract, in exactly one of seven shapes:
 * an exact delta, a delta range (`min` and/or `max`), an exact resulting balance, a balance
 * range, a full drain (ending balance exactly 0), an exact outgoing send, keeping the whole
 * incoming value, or a custom predicate. Amounts are absolute nanotons or derived from the
 * analyzed flow (e.g. `(ctx) => ctx.hop('MintNewJettons').valueOut`). The `kind` discriminant
 * makes mixing shapes (e.g. `deltaExact` with `min`) a type error; a `*Range` rule without any
 * bound throws (it would match every hop).
 */
export type BalanceRule = BalanceRuleSelector &
  (
    | { kind: 'deltaExact'; delta: BalanceAmount }
    | { kind: 'deltaRange'; min?: BalanceAmount; max?: BalanceAmount }
    | { kind: 'balanceExact'; value: BalanceAmount }
    | { kind: 'balanceRange'; min?: BalanceAmount; max?: BalanceAmount }
    | { kind: 'drain' }
    /**
     * The handler ignores the incoming value and pays exactly `value` from its balance
     * (e.g. a query sent with `SEND_MODE_PAY_FEES_SEPARATELY`). With
     * `payForwardFromBalance`, the outgoing messages' forward fee is also paid from the
     * balance and accounted for in the delta.
     */
    | { kind: 'sendExact'; value: BalanceAmount; payForwardFromBalance?: boolean }
    /** The handler forwards nothing onward: it is a sink for the value, minus its own fees. */
    | { kind: 'keep' }
    | { kind: 'custom'; expect: (hop: HopSummary, ctx: BalanceContext) => boolean }
  )

type BalanceSnapshot = { balance: bigint; deployed: boolean }

/**
 * Steps through the flow one transaction at a time (the same per-message queue stepping
 * `sendMessageIter` uses) and snapshots the receiving contract's balance before and after each
 * transaction. With `blockchain.now` frozen no storage fees are charged, so a handler that passes
 * the message value forward ends with a delta of exactly 0; anything else is recorded as a
 * violation unless the hop is exempt (aborted, destroy, external owner or a `spec.retains`
 * name). Bounces are NOT exempt: how a handler (or the TVM) routes the bounced value must be
 * covered by a rule. Deployments are NOT exempt either: the deploy value a contract keeps must
 * be covered by a rule (e.g. `deltaExact: Costs.executorDeployment`).
 */
async function watchBalances(
  blockchain: Blockchain,
  spec: FlowSpec,
): Promise<[SendMessageResult, BalanceViolation[]]> {
  const violations: BalanceViolation[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = (blockchain as any).defaultQueueManager
  const original = queue.processTx.bind(queue)
  const snapshot = async (address: Address): Promise<BalanceSnapshot> => {
    const contract = await blockchain.getContract(address)
    return { balance: contract.balance, deployed: contract.accountState?.type === 'active' }
  }
  queue.processTx = async () => {
    const pending = queue.messageQueue[0]
    const dest =
      pending?.type === 'message' && pending.info.type === 'internal' ? pending.info.dest : null
    const before = dest ? await snapshot(dest) : null
    const tx = await original()
    if (dest && before && !tx.done) {
      const after = await snapshot(dest)
      const info = tx.value.inMessage?.info
      const description = tx.value.description
      const aborted = description.type === 'generic' && description.aborted
      // Name-based exemptions (external owner, `retains`) are applied in `measure` after
      // `discover` has registered addresses that only become known during the run.
      // Bounces are checked like any other hop: the bounced value's routing must be covered
      // by a rule. Deployments and destructions too: the value a contract keeps on deploy,
      // or drains on destroy, must be covered by a rule.
      if (!aborted && after.balance !== before.balance) {
        // Bounces are checked like any other hop: the op is recovered from the bounce body so
        // rules can name the message that bounced.
        const { op: opLabel, bounce } = inMessageOp(tx.value)
        violations.push({
          address: dest.toRawString(),
          op: opLabel,
          lt: tx.value.lt,
          delta: after.balance - before.balance,
          balance: after.balance,
          valueIn: info?.type === 'internal' ? info.value.coins : 0n,
          bounce,
        })
      }
    }
    return tx
  }
  try {
    const result = await measureFlow(spec.run)
    return [result, violations]
  } finally {
    queue.processTx = original
  }
}

export interface FlowSpec {
  run: () => Promise<SendMessageResult>
  book: AddressBook
  /** Names addresses only known after the run (executors, deposit accounts). */
  discover?: (result: SendMessageResult, book: AddressBook) => void | Promise<void>
  /** Hops expected to abort, as `From->To`. */
  aborts?: string[]
  /**
   * Expected balance changes. Every hop whose receiving contract's balance changes must be
   * covered by a rule satisfying its amount constraint, and every rule must match at least one
   * hop — a rule that matches nothing fails the flow (catches silent drift after op renames).
   */
  retains?: BalanceRule[]
  /** CCIP part of the value the entrypoint was sent; when set, the CCIP subtree's min value basis must fit in it. */
  budget?: bigint
}

type Json = { [key: string]: Json } | Json[] | string | number | boolean | null

const resolveAmount = (amount: BalanceAmount, ctx: BalanceContext): bigint =>
  typeof amount === 'function' ? amount(ctx) : amount

const ruleSelectorMatches = (
  rule: BalanceRule,
  hop: { to: string; from: string; op: string; bounce?: BounceKind | null },
): boolean =>
  rule.contract === hop.to &&
  rule.op === hop.op &&
  (rule.from === undefined || rule.from === hop.from) &&
  // `bounce` omitted matches both bounces and normal messages; `null` matches only normal.
  (rule.bounce === undefined || rule.bounce === (hop.bounce ?? null))

const ruleAmountSatisfied = (
  rule: BalanceRule,
  v: { delta: bigint; balance: bigint; valueIn: bigint },
  hop: HopSummary,
  ctx: BalanceContext,
): boolean => {
  switch (rule.kind) {
    case 'deltaExact':
      return v.delta === resolveAmount(rule.delta, ctx)
    case 'deltaRange':
      if (rule.min !== undefined && v.delta < resolveAmount(rule.min, ctx)) return false
      if (rule.max !== undefined && v.delta > resolveAmount(rule.max, ctx)) return false
      return true
    case 'balanceExact':
      return v.balance === resolveAmount(rule.value, ctx)
    case 'balanceRange':
      if (rule.min !== undefined && v.balance < resolveAmount(rule.min, ctx)) return false
      if (rule.max !== undefined && v.balance > resolveAmount(rule.max, ctx)) return false
      return true
    case 'drain':
      return v.balance === 0n
    case 'keep':
      return hop.valueOut === 0n
    case 'sendExact': {
      const sent = resolveAmount(rule.value, ctx)
      return (
        v.delta ===
        v.valueIn - sent - hop.computeFee - (rule.payForwardFromBalance ? hop.forwardFee : 0n)
      )
    }
    case 'custom':
      return rule.expect(hop, ctx)
  }
}

/** Formats a nanoton amount for error messages: `0.084784658 TON (84784658n)`. */
const amount = (nano: bigint): string => `${fromNano(nano)} TON (${nano}n)`

/** The amount constraint of a rule, resolved and formatted for error messages. */
function describeRuleAmount(rule: BalanceRule, ctx: BalanceContext): string {
  const range = (min: BalanceAmount | undefined, max: BalanceAmount | undefined) =>
    `[${min !== undefined ? amount(resolveAmount(min, ctx)) : '-inf'}, ${max !== undefined ? amount(resolveAmount(max, ctx)) : '+inf'}]`
  switch (rule.kind) {
    case 'deltaExact':
      return `delta == ${amount(resolveAmount(rule.delta, ctx))}`
    case 'deltaRange':
      return `delta in ${range(rule.min, rule.max)}`
    case 'balanceExact':
      return `balance == ${amount(resolveAmount(rule.value, ctx))}`
    case 'balanceRange':
      return `balance in ${range(rule.min, rule.max)}`
    case 'drain':
      return 'balance == 0 TON (0n)'
    case 'keep':
      return 'forwards no value out (a value sink, keeping value in minus its own fees)'
    case 'sendExact':
      return `sends exactly ${amount(resolveAmount(rule.value, ctx))} from balance${
        rule.payForwardFromBalance ? ' + forward fee' : ''
      }`
    case 'custom':
      return 'custom predicate'
  }
}

/**
 * Checks the recorded balance changes against the spec's `retains` rules and returns one
 * human-readable problem string per issue:
 * - a hop whose balance changed without a satisfying rule (no rule matches its selector, or a
 *   matching rule's amount constraint fails — the expectation is spelled out either way),
 * - a rule that matched no hop at all (matched against every hop of the flow, not just the ones
 *   that changed a balance — a rule for an op whose delta is 0, or whose hop is exempt as a
 *   deploy, still counts as matched),
 * - a rule that matched hops but never satisfied any violation — its amount constraint was
 *   never exercised (e.g. a rule for a hop that only keeps value on some flows): redundant or
 *   misplaced, since a flow variant where the hop retains value would fail it. `optional` rules
 *   are exempt from this check (but must still match a hop).
 * External-owned receivers (users, transmitters) are always exempt: they are value sinks by design.
 */
function checkBalanceRules(
  violations: (BalanceViolation & { to: string; from: string })[],
  spec: FlowSpec,
  flow: FlowSummary,
): string[] {
  const rules = spec.retains ?? []
  // A range rule without bounds matches every hop — always a typo.
  for (const rule of rules) {
    if (rule.kind === 'deltaRange' && rule.min === undefined && rule.max === undefined)
      throw new Error(
        `Invalid retains rule for ${rule.contract}: 'deltaRange' needs min and/or max`,
      )
    if (rule.kind === 'balanceRange' && rule.min === undefined && rule.max === undefined)
      throw new Error(
        `Invalid retains rule for ${rule.contract}: 'balanceRange' needs min and/or max`,
      )
  }
  // Two rules with the same selector is an error: the weaker constraint satisfies whatever the
  // stronger rejects, masking the regression the stronger rule was written to catch. Split the
  // flows instead, so each selector names exactly one expectation.
  const selectorKey = (rule: BalanceRule) =>
    `${rule.contract}:${rule.op}:${rule.from ?? '*'}:${rule.bounce ?? '*'}:${rule.optional ? 'optional' : 'required'}`
  const seen = new Map<string, BalanceRule>()
  for (const rule of rules) {
    const key = selectorKey(rule)
    const previous = seen.get(key)
    if (previous)
      throw new Error(
        `Overlapping retains rules for ${rule.contract}:${rule.op} (${rule.kind} and ${previous.kind}): both match the same (contract, op, from, bounce) selector — the weaker constraint masks the stronger. Split the flows instead.`,
      )
    seen.set(key, rule)
  }
  // A fresh context per violation, so amount callbacks read `ctx.current` as the hop the rule
  // is being evaluated against.
  const makeCtx = (current: HopSummary): BalanceContext => ({
    hops: flow.hops,
    current,
    hop: (op, occurrence = 0) => {
      const matches = flow.hops.filter((h) => h.op === op)
      const hit = matches[occurrence]
      if (!hit) throw new Error(`No hop with op ${op} (occurrence ${occurrence})`)
      return hit
    },
    delta: (contract, op) =>
      flow.hops
        .filter((h) => h.to === contract && (op === undefined || h.op === op))
        .reduce((sum, h) => sum + h.retained, 0n),
  })

  const matched = new Set<number>()
  for (const hop of flow.hops) {
    rules.forEach((rule, i) => {
      if (ruleSelectorMatches(rule, hop)) matched.add(i)
    })
  }

  const problems: string[] = []
  const satisfied = new Set<number>()
  for (const v of violations) {
    const address = Address.parseRaw(v.address)
    if (spec.book.owner(address) === 'external') continue
    // The violation carries its transaction's lt, so the hop match is exact even when several
    // hops share the same (contract, op) pair.
    const hop = flow.hops.find((h) => h.tx.lt === v.lt)
    if (!hop) continue
    const ctx = makeCtx(hop)
    const where = `${v.to}:${v.op} (from ${v.from})`
    const facts = `kept ${amount(v.delta)}; balance after ${amount(v.balance)}, value in ${amount(v.valueIn)}`
    const covering = rules.filter((rule) => ruleSelectorMatches(rule, v))
    const satisfying = covering.filter((rule) => ruleAmountSatisfied(rule, v, hop, ctx))
    if (satisfying.length > 0) {
      satisfying.forEach((rule) => satisfied.add(rules.indexOf(rule)))
      continue
    }
    if (covering.length === 0) {
      problems.push(
        `${where} ${facts}. No retains rule matches this hop — add one for ${v.to}:${v.op}.`,
      )
    } else {
      const expectations = covering
        .map((rule) => `${rule.kind} (${describeRuleAmount(rule, ctx)})`)
        .join(' or ')
      problems.push(
        `${where} ${facts}. A rule matches but none is satisfied — expected ${expectations}.`,
      )
    }
  }
  for (const [i, rule] of rules.entries()) {
    if (!matched.has(i)) {
      problems.push(
        `retains rule ${rule.contract}:${rule.op} (${rule.kind}) matched no hop of this flow — the op was renamed, the flow changed, or the hop is exempt (deploy/bounce/abort).`,
      )
    } else if (!satisfied.has(i) && !rule.optional) {
      problems.push(
        `retains rule ${rule.contract}:${rule.op} (${rule.kind}) never satisfied a balance change — its constraint is not exercised by this flow (redundant, or belongs in a flow-specific fragment).`,
      )
    }
  }
  return problems
}

function toJson(value: unknown): Json {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Address) return value.toString()
  if (Array.isArray(value)) return value.map(toJson)
  if (value && typeof value === 'object') {
    // Cells (message bodies, init code) are noise in the snapshot; undefined drops the key.
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined && !(v instanceof Cell))
        .map(([k, v]) => [k, toJson(v)]),
    )
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
    const [result, balanceViolations] = await watchBalances(this.blockchain, spec)
    await spec.discover?.(result, spec.book)
    const flow = analyzeFlow(label, result, spec.book)
    printFlowAnalysis(flow, this.gasPrice)
    this.flows.push(flow)

    const unknown = flow.hops.filter((hop) => hop.owner === 'unknown').map((hop) => hop.to)
    expect({ unknownAddresses: [...new Set(unknown)] }).toEqual({ unknownAddresses: [] })

    const aborted = flow.hops
      .filter((hop) => !hop.tx.success)
      .map((hop) => `${hop.from}->${hop.to}`)
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

    // Every message handler must pass the value it received forward; a balance change on a
    // non-exempt hop means the contract is silently keeping (or funding) value. Expected
    // changes are declared as `retains` rules; names resolve after `discover` so addresses
    // that only became known during the run are matched too.
    const balanceChanges = balanceViolations.map((v) => {
      const address = Address.parseRaw(v.address)
      const hop = flow.hops.find((h) => h.tx.lt === v.lt)
      return { ...v, to: spec.book.name(address), from: hop?.from ?? 'External' }
    })
    const problems = checkBalanceRules(balanceChanges, spec, flow)
    if (problems.length > 0) {
      throw new Error(
        `Balance rules violated in flow "${label}":\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      )
    }

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
