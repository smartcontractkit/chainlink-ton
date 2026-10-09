import { Blockchain, BlockchainTransaction, SendMessageResult, fetchConfig } from '@ton/sandbox'
import { Address, Cell, fromNano, toNano } from '@ton/core'
import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'

import * as tar from '../../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import { Costs } from '../../../../wrappers/ccip/TokenAdminRegistry'
import {
  Fixture,
  entryAddress,
  registerToken,
  setup,
  tokenInfo,
} from '../../../ccip/tokenAdminRegistry/TokenAdminRegistry.Setup'

// Runs every TokenAdminRegistry message flow reachable with the current entry
// code with exactly the minimum value the root asserts, and checks that the
// flow completes, that neither the root nor the entry loses balance, and that
// the minimum is at least SAFETY_FACTOR times the measured fees. Flows are
// started with `blockchain.sender` so the initiator's wallet transaction is
// not counted. Fees use the live config of TAR_FLOWS_NETWORK (mainnet by
// default, or `default` for the sandbox's bundled config). Writes
// snapshots/token-admin-registry-flows.<network>.json.
const NETWORK = (process.env['TAR_FLOWS_NETWORK'] ?? 'mainnet') as 'mainnet' | 'testnet' | 'default'
const SNAPSHOT = path.join(__dirname, 'snapshots', `token-admin-registry-flows.${NETWORK}.json`)
const SAFETY_FACTOR = 5n

type Row = {
  from: string
  to: string
  op: string
  valueIn: string
  gasUsed: number
  computeFee: string
  fwdFees: string
  success: boolean
}

type FlowResult = {
  rows: Row[]
  value: string
  budget: string
  totalFee: string
  rootDelta: string
  entryDelta: string
  returned: string
}

const results: Record<string, FlowResult> = {}

describe('TokenAdminRegistry flow fees', () => {
  let blockchain: Blockchain
  let fx: Fixture
  let config: Cell | undefined

  beforeAll(async () => {
    config = NETWORK === 'default' ? undefined : await fetchConfig(NETWORK)
  })

  beforeEach(async () => {
    global.console = require('console')
    blockchain = await Blockchain.create({ config })
    fx = await setup(blockchain)
  })

  afterAll(() => {
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true })
    fs.writeFileSync(SNAPSHOT, JSON.stringify(results, null, 2) + '\n')
    console.log(`\n=== TokenAdminRegistry flows (${NETWORK}, TON) ===`)
    console.table(
      Object.fromEntries(
        Object.entries(results).map(([name, r]) => [
          name,
          {
            value: fromNano(r.value),
            totalFee: fromNano(r.totalFee),
            margin: (Number(r.budget) / Number(r.totalFee)).toFixed(1) + 'x',
            rootDelta: fromNano(r.rootDelta),
            entryDelta: fromNano(r.entryDelta),
            returned: fromNano(r.returned),
          },
        ]),
      ),
    )
  })

  const balance = async (address: Address) => (await blockchain.getContract(address)).balance

  const opName = (op: number) => {
    for (const ns of [tar, tare]) {
      for (const [name, value] of Object.entries(ns)) {
        if ((value as { PREFIX?: unknown })?.PREFIX === op) {
          return name
        }
      }
    }
    return '0x' + op.toString(16).padStart(8, '0')
  }

  type Flow = {
    initiator: Address
    value: bigint
    /** Part of `value` that pays for fees, as opposed to e.g. a storage reserve. */
    budget?: bigint
    /** Transactions expected to abort, as `from->to` names. */
    aborts?: string[]
    run: (via: ReturnType<Blockchain['sender']>, value: bigint) => Promise<SendMessageResult>
    expectOutcome: (result: SendMessageResult) => void
  }

  const measure = async (name: string, flow: Flow) => {
    const entry = entryAddress(fx)
    const names: Record<string, string> = {
      [flow.initiator.toString()]: 'Initiator',
      [fx.registry.address.toString()]: 'Root',
      [entry.toString()]: 'Entry',
    }
    const rootBefore = await balance(fx.registry.address)
    const entryBefore = await balance(entry)
    const result = await flow.run(blockchain.sender(flow.initiator), flow.value)

    let totalFee = 0n
    let returned = 0n
    const rows = result.transactions
      .filter((tx) => tx.inMessage?.info.type === 'internal')
      .map((tx: BlockchainTransaction) => {
        const info = tx.inMessage!.info as { src: Address; dest: Address; value: { coins: bigint } }
        const body = tx.inMessage!.body.beginParse()
        const d = tx.description.type === 'generic' ? tx.description : undefined
        const compute = d?.computePhase
        // totalFees holds the sender's share of each forward fee; the rest
        // travels in the message's forwardFee.
        const outFwd = tx.outMessages
          .values()
          .reduce((sum, m) => sum + (m.info.type === 'internal' ? m.info.forwardFee : 0n), 0n)
        totalFee += tx.totalFees.coins + outFwd
        if (info.dest.equals(flow.initiator)) {
          returned += info.value.coins
        }
        return {
          from: names[info.src.toString()] ?? info.src.toString(),
          to: names[info.dest.toString()] ?? info.dest.toString(),
          op: body.remainingBits >= 32 ? opName(body.preloadUint(32)) : '',
          valueIn: fromNano(info.value.coins),
          gasUsed: compute?.type === 'vm' ? Number(compute.gasUsed) : 0,
          computeFee: fromNano(compute?.type === 'vm' ? compute.gasFees : 0n),
          fwdFees: fromNano(d?.actionPhase?.totalFwdFees ?? 0n),
          success: !!d && !d.aborted,
        }
      })
    const rootDelta = (await balance(fx.registry.address)) - rootBefore
    const entryDelta = (await balance(entry)) - entryBefore
    const budget = flow.budget ?? flow.value
    results[name] = {
      rows,
      value: flow.value.toString(),
      budget: budget.toString(),
      totalFee: totalFee.toString(),
      rootDelta: rootDelta.toString(),
      entryDelta: entryDelta.toString(),
      returned: returned.toString(),
    }
    console.log(`\n=== ${name}: ${fromNano(totalFee)} TON in fees ===`)
    console.table(rows)

    const aborted = rows.filter((row) => !row.success).map((row) => `${row.from}->${row.to}`)
    expect(aborted).toEqual(flow.aborts ?? [])
    flow.expectOutcome(result)
    expect(rootDelta).toBeGreaterThanOrEqual(0n)
    expect(entryDelta).toBeGreaterThanOrEqual(0n)
    expect(totalFee * SAFETY_FACTOR).toBeLessThanOrEqual(budget)
    return result
  }

  const replied = (op: number) => (result: SendMessageResult) =>
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      op,
      success: true,
    })

  /** The root emitted the event an entry relayed, within the relay value. */
  const relayed = (result: SendMessageResult) => {
    const entry = entryAddress(fx)
    const relay = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(entry) &&
        tx.inMessage.info.dest.equals(fx.registry.address),
    )
    expect(relay).toBeDefined()
    expect(relay!.outMessages.values().some((m) => m.info.type === 'external-out')).toBe(true)
    const info = relay!.inMessage!.info as { value: { coins: bigint } }
    const fee = Costs.relayEvent - info.value.coins + relay!.totalFees.coins
    expect(fee * SAFETY_FACTOR).toBeLessThanOrEqual(Costs.relayEvent)
  }

  const accept = async () => {
    await fx.registry.sendTokenAdminRegistryAcceptAdminRole(
      fx.administrator.getSender(),
      Costs.forward,
      { queryId: 0n, tokenAddress: fx.token },
    )
  }

  it('RegisterToken', async () => {
    await measure('RegisterToken', {
      initiator: fx.owner.address,
      value: Costs.registerToken,
      budget: Costs.registerToken - Costs.entryStorageReserve,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryRegisterToken(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
          tokenInfo: tokenInfo(fx),
          administrator: fx.administrator.address,
        }),
      expectOutcome: relayed,
    })
  })

  it('GetTokenInfo', async () => {
    await registerToken(fx)
    await measure('GetTokenInfo', {
      initiator: fx.other.address,
      value: Costs.getTokenInfo,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryGetTokenInfo(via, value, {
          queryId: 0n,
          token: fx.token,
        }),
      expectOutcome: replied(tar.TokenAdminRegistry_TokenInfo.PREFIX),
    })
  })

  it('GetTokenInfo unregistered', async () => {
    await measure('GetTokenInfo unregistered', {
      initiator: fx.other.address,
      value: Costs.getTokenInfo,
      aborts: ['Root->Entry'],
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryGetTokenInfo(via, value, {
          queryId: 0n,
          token: fx.token,
        }),
      expectOutcome: replied(tar.TokenAdminRegistry_GetTokenInfoFailed.PREFIX),
    })
  })

  it('OverridePendingAdministrator', async () => {
    await registerToken(fx)
    await measure('OverridePendingAdministrator', {
      initiator: fx.owner.address,
      value: Costs.forward,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryOverridePendingAdministrator(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
          administrator: fx.replacementAdministrator.address,
        }),
      expectOutcome: relayed,
    })
  })

  it('AcceptAdminRole', async () => {
    await registerToken(fx)
    await measure('AcceptAdminRole', {
      initiator: fx.administrator.address,
      value: Costs.forward,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryAcceptAdminRole(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
        }),
      expectOutcome: relayed,
    })
  })

  it('TransferAdminRole', async () => {
    await registerToken(fx)
    await accept()
    await measure('TransferAdminRole', {
      initiator: fx.administrator.address,
      value: Costs.forward,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryTransferAdminRole(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
          newAdministrator: fx.replacementAdministrator.address,
        }),
      expectOutcome: relayed,
    })
  })

  it('SetPool', async () => {
    await registerToken(fx)
    await accept()
    await measure('SetPool', {
      initiator: fx.administrator.address,
      value: Costs.forward,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistrySetPool(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
          tokenPool: fx.replacementPool,
        }),
      expectOutcome: relayed,
    })
  })

  // The entry already runs the root's entry code, so this skips the reinstall.
  it('UpgradeEntry', async () => {
    await registerToken(fx)
    await measure('UpgradeEntry', {
      initiator: fx.other.address,
      value: Costs.upgrade,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryUpgradeEntry(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
        }),
      expectOutcome: (result) =>
        expect(result.transactions).toHaveTransaction({
          from: fx.registry.address,
          to: entryAddress(fx),
          op: tare.Upgradeable_Upgrade.PREFIX,
          success: true,
        }),
    })
  })
})
