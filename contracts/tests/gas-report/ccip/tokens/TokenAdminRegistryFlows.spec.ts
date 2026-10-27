import { Blockchain, BlockchainTransaction, SendMessageResult } from '@ton/sandbox'
import { Address, Cell, fromNano, toNano } from '@ton/core'
import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'

import { contractCode } from '../../../../wrappers/codeLoader'
import { createEmptyCursePolicy } from '../../../../wrappers/ccip/Router'
import { Costs } from '../../../../wrappers/ccip/TokenAdminRegistry'
import * as tar from '../../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import * as cct from '../../../../wrappers/gen/ccip/cct/JettonMinter'
import { BurnMintTokenPool } from '../../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import { LockReleaseLockboxTokenPool } from '../../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import {
  JettonClient,
  Ownable2Step,
  TokenPool_AdminConfig,
  TokenPool_Data,
  TokenPool_DynamicConfig,
  TokenPool_LocalPolicy,
} from '../../../../wrappers/gen/ccip/pools/TokenPool'
import {
  Fixture,
  entryAddress,
  entryFor,
  setup,
  tokenInfo,
} from '../../../ccip/tokenAdminRegistry/TokenAdminRegistry.Setup'
import { gasReportConfig, gasReportNetwork, isInternal, op, storageFee, txFee } from '../../utils'

// Runs each TokenAdminRegistry flow with exactly its minimum value against a real
// CCT minter and token pools. Each budgeted leg and the flow's own execution must
// cost at most 1/SAFETY_FACTOR of their budget, and the root and entry must not lose
// balance. GAS_REPORT_NETWORK: mainnet (default), testnet or `default` (bundled config).
const NETWORK = gasReportNetwork()
const SNAPSHOT = path.join(__dirname, 'snapshots', `token-admin-registry-flows.${NETWORK}.json`)
const SAFETY_FACTOR = 5n

type LegName = 'walletQuery' | 'poolProbe' | 'relayEvent'
type PoolName = 'BurnMint' | 'LockReleaseLockbox'

const LEG_BUDGET: Record<LegName, bigint> = {
  walletQuery: Costs.walletQuery,
  poolProbe: Costs.poolProbe,
  relayEvent: Costs.relayEvent,
}

type Row = {
  from: string
  to: string
  op: string
  valueIn: string
  gasUsed: number
  fee: string
  success: boolean
}

type FlowResult = {
  rows: Row[]
  value: string
  ownBudget: string
  totalFee: string
  ownFee: string
  legs: { name: LegName; fee: string }[]
  rootDelta: string
  entryDelta: string
}

const results: Record<string, FlowResult> = {}

describe('TokenAdminRegistry flow fees', () => {
  let blockchain: Blockchain
  let fx: Fixture
  let config: Cell | undefined
  let walletCode: Cell
  let pools: Record<PoolName, Address>

  beforeAll(async () => {
    config = await gasReportConfig()
    walletCode = await contractCode.ccip.local('ccip.cct.JettonWallet')
  })

  const cctMinter = async (metadataUri: string) =>
    blockchain.openContract(
      cct.JettonMinter.fromStorage(
        {
          totalSupply: 0n,
          adminAddress: fx.owner.address,
          nextAdminAddress: null,
          jettonWalletCode: walletCode,
          metadataUri,
        },
        { overrideContractCode: await contractCode.ccip.local('ccip.cct.JettonMinter') },
      ),
    )

  beforeEach(async () => {
    global.console = require('console')
    blockchain = await Blockchain.create({ config })
    blockchain.now = 1_800_000_000
    fx = await setup(blockchain)

    const minter = await cctMinter('cct')
    await minter.sendTopUpTons(fx.owner.getSender(), toNano('0.1'), {})
    fx.token = minter.address

    const poolData = TokenPool_Data.create({
      adminConfig: TokenPool_AdminConfig.create({
        ownable: Ownable2Step.create({ owner: fx.owner.address, pendingOwner: null }),
        dynamicConfig: TokenPool_DynamicConfig.create({
          router: fx.owner.address,
          rateLimitAdmin: null,
          feeAdmin: null,
        }),
        allowedDepositNamespaces: new Set(),
        jettonClient: JettonClient.create({
          masterAddress: minter.address,
          jettonWalletCode: walletCode,
        }),
        allowedFinalityConfig: 0n,
        advancedPoolHooks: null,
      }),
      localPolicy: TokenPool_LocalPolicy.create({
        cursePolicy: createEmptyCursePolicy(fx.owner.address),
      }),
      tokenDecimals: 9n,
      remoteChainConfigs: new Map(),
      tokenTransferFeeConfigs: new Map(),
    })
    const burnMint = blockchain.openContract(
      BurnMintTokenPool.fromStorage(
        { poolData },
        { overrideContractCode: await contractCode.ccip.local('ccip.pool.BurnMintTokenPool') },
      ),
    )
    await burnMint.sendDeploy(fx.owner.getSender(), toNano('1'))
    // The probe only needs a configured lockbox address.
    const lockbox = blockchain.openContract(
      LockReleaseLockboxTokenPool.fromStorage(
        { poolData, lockbox: (await blockchain.treasury('lockbox')).address },
        {
          overrideContractCode: await contractCode.ccip.local(
            'ccip.pool.LockReleaseLockboxTokenPool',
          ),
        },
      ),
    )
    await lockbox.sendDeploy(fx.owner.getSender(), toNano('1'))
    pools = { BurnMint: burnMint.address, LockReleaseLockbox: lockbox.address }
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
            own: fromNano(r.ownFee),
            ownMargin: (Number(r.ownBudget) / Number(r.ownFee)).toFixed(1) + 'x',
            legs: r.legs
              .map((l) => `${l.name}=${(Number(LEG_BUDGET[l.name]) / Number(l.fee)).toFixed(1)}x`)
              .join(' '),
            rootDelta: fromNano(r.rootDelta),
            entryDelta: fromNano(r.entryDelta),
          },
        ]),
      ),
    )
  })

  const balance = async (address: Address) => (await blockchain.getContract(address)).balance

  const opName = (value: number | undefined) => {
    if (value === undefined) return ''
    for (const ns of [tar, tare]) {
      for (const [name, v] of Object.entries(ns)) {
        if ((v as { PREFIX?: unknown })?.PREFIX === value) return name
      }
    }
    return '0x' + value.toString(16).padStart(8, '0')
  }

  /** Splits the transactions of a flow into its budgeted legs; the rest is the flow's own fee. */
  const legsOf = (txs: BlockchainTransaction[]) => {
    const entry = entryAddress(fx)
    const legs: { name: LegName; fee: bigint }[] = []
    const roundTrip = (name: LegName, requestOp: number, responseOp: number) => {
      for (const request of txs.filter((tx) => op(tx) === requestOp && isInternal(tx, entry))) {
        const responder = (request.inMessage!.info as { dest: Address }).dest
        const response = txs.find((tx) => op(tx) === responseOp && isInternal(tx, responder, entry))
        legs.push({ name, fee: txFee(request) + (response ? txFee(response) : 0n) })
      }
    }
    roundTrip('walletQuery', tare.RequestWalletAddress.PREFIX, tare.ResponseWalletAddress.PREFIX)
    roundTrip('poolProbe', tare.TokenPool_GetConfig.PREFIX, tare.TokenPool_Config.PREFIX)
    const events: (number | undefined)[] = [
      tar.TokenAdminRegistry_AdministratorTransferRequested.PREFIX,
      tar.TokenAdminRegistry_AdministratorTransferred.PREFIX,
      tar.TokenAdminRegistry_PoolSet.PREFIX,
    ]
    for (const relay of txs.filter(
      (tx) => events.includes(op(tx)) && isInternal(tx, entry, fx.registry.address),
    )) {
      legs.push({ name: 'relayEvent', fee: txFee(relay) })
    }
    return legs
  }

  type Flow = {
    initiator: Address
    value: bigint
    /** Part of `value` for the flow's own execution, besides its legs and any storage reserve. */
    ownBudget: bigint
    /** Transactions expected to abort, as `from->to` names. */
    aborts?: string[]
    run: (via: ReturnType<Blockchain['sender']>, value: bigint) => Promise<SendMessageResult>
    expectOutcome: (result: SendMessageResult) => Promise<void> | void
  }

  const measure = async (name: string, flow: Flow) => {
    const entry = entryAddress(fx)
    const names: Record<string, string> = {
      [flow.initiator.toString()]: 'Initiator',
      [fx.registry.address.toString()]: 'Root',
      [entry.toString()]: 'Entry',
      [fx.token.toString()]: 'Token',
      [pools.BurnMint.toString()]: 'BurnMintPool',
      [pools.LockReleaseLockbox.toString()]: 'LockboxPool',
    }
    const rootBefore = await balance(fx.registry.address)
    const entryBefore = await balance(entry)
    const result = await flow.run(blockchain.sender(flow.initiator), flow.value)

    const txs = result.transactions.filter((tx) => isInternal(tx))
    const rows = txs.map((tx) => {
      const info = tx.inMessage!.info as { src: Address; dest: Address; value: { coins: bigint } }
      const d = tx.description.type === 'generic' ? tx.description : undefined
      const compute = d?.computePhase
      return {
        from: names[info.src.toString()] ?? info.src.toString(),
        to: names[info.dest.toString()] ?? info.dest.toString(),
        op: opName(op(tx)),
        valueIn: fromNano(info.value.coins),
        gasUsed: compute?.type === 'vm' ? Number(compute.gasUsed) : 0,
        fee: fromNano(txFee(tx)),
        success: !!d && !d.aborted,
      }
    })
    const totalFee = txs.reduce((sum, tx) => sum + txFee(tx), 0n)
    const legs = legsOf(txs)
    const rootDelta = (await balance(fx.registry.address)) - rootBefore
    const entryDelta = (await balance(entry)) - entryBefore
    const storageOf = (address: Address) =>
      txs
        .filter((tx) => isInternal(tx, undefined, address))
        .reduce((sum, tx) => sum + storageFee(tx), 0n)
    const ownTotal = totalFee - legs.reduce((sum, l) => sum + l.fee, 0n)
    results[name] = {
      rows,
      value: flow.value.toString(),
      ownBudget: flow.ownBudget.toString(),
      totalFee: totalFee.toString(),
      ownFee: ownTotal.toString(),
      legs: legs.map((l) => ({ name: l.name, fee: l.fee.toString() })),
      rootDelta: rootDelta.toString(),
      entryDelta: entryDelta.toString(),
    }
    console.log(`\n=== ${name}: ${fromNano(totalFee)} TON in fees ===`)
    console.table(rows)

    const aborted = rows.filter((row) => !row.success).map((row) => `${row.from}->${row.to}`)
    expect(aborted).toEqual(flow.aborts ?? [])
    await flow.expectOutcome(result)
    expect(rootDelta + storageOf(fx.registry.address)).toBeGreaterThanOrEqual(0n)
    expect(entryDelta + storageOf(entry)).toBeGreaterThanOrEqual(0n)
    for (const leg of legs) {
      expect({ [leg.name]: leg.fee * SAFETY_FACTOR <= LEG_BUDGET[leg.name] }).toEqual({
        [leg.name]: true,
      })
    }
    expect(ownTotal * SAFETY_FACTOR).toBeLessThanOrEqual(flow.ownBudget)
    return result
  }

  const register = (pool: Address | null = pools.BurnMint) =>
    fx.registry.sendTokenAdminRegistryRegisterToken(
      blockchain.sender(fx.owner.address),
      Costs.registerToken,
      {
        queryId: 0n,
        tokenAddress: fx.token,
        tokenInfo: tokenInfo(fx, pool),
        administrator: fx.administrator.address,
      },
    )

  const accept = () =>
    fx.registry.sendTokenAdminRegistryAcceptAdminRole(
      blockchain.sender(fx.administrator.address),
      Costs.forward,
      {
        queryId: 0n,
        tokenAddress: fx.token,
      },
    )

  const replied = (replyOp: number) => (result: SendMessageResult) =>
    expect(result.transactions).toHaveTransaction({
      from: fx.registry.address,
      op: replyOp,
      success: true,
    })

  const relayed = (event: number) => (result: SendMessageResult) =>
    expect(result.transactions).toHaveTransaction({
      from: entryAddress(fx),
      to: fx.registry.address,
      op: event,
      success: true,
    })

  const expectPool = async (pool: Address | null) => {
    const info = await entryFor(fx).getTokenInfo()
    if (pool === null) {
      expect(info.tokenPool).toBeNull()
    } else {
      expect(info.tokenPool).toEqualAddress(pool)
    }
  }

  for (const poolName of ['BurnMint', 'LockReleaseLockbox'] as const) {
    it(`RegisterToken: ${poolName}`, async () => {
      await measure(`RegisterToken: ${poolName}`, {
        initiator: fx.owner.address,
        value: Costs.registerToken,
        ownBudget: Costs.registerTokenBase + Costs.deployBase + Costs.registrationInitializedBase,
        run: (via, value) =>
          fx.registry.sendTokenAdminRegistryRegisterToken(via, value, {
            queryId: 0n,
            tokenAddress: fx.token,
            tokenInfo: tokenInfo(fx, pools[poolName]),
            administrator: fx.administrator.address,
          }),
        expectOutcome: async (result) => {
          relayed(tar.TokenAdminRegistry_AdministratorTransferRequested.PREFIX)(result)
          relayed(tar.TokenAdminRegistry_PoolSet.PREFIX)(result)
          expect(await entryFor(fx).getEnabled()).toBe(true)
          await expectPool(pools[poolName])
        },
      })
    })

    it(`SetPool: ${poolName}`, async () => {
      await register(poolName === 'BurnMint' ? pools.LockReleaseLockbox : pools.BurnMint)
      await accept()
      await measure(`SetPool: ${poolName}`, {
        initiator: fx.administrator.address,
        value: Costs.setPool,
        ownBudget: Costs.forwardBase,
        run: (via, value) =>
          fx.registry.sendTokenAdminRegistrySetPool(via, value, {
            queryId: 0n,
            tokenAddress: fx.token,
            tokenPool: pools[poolName],
          }),
        expectOutcome: async (result) => {
          relayed(tar.TokenAdminRegistry_PoolSet.PREFIX)(result)
          await expectPool(pools[poolName])
        },
      })
    })

    it(`RefreshPoolConfig: ${poolName}`, async () => {
      await register(pools[poolName])
      await measure(`RefreshPoolConfig: ${poolName}`, {
        initiator: fx.other.address,
        value: Costs.refreshPoolConfig,
        ownBudget: Costs.forwardBase,
        run: (via, value) =>
          fx.registry.sendTokenAdminRegistryRefreshPoolConfig(via, value, {
            queryId: 0n,
            tokenAddress: fx.token,
          }),
        expectOutcome: async (result) => {
          expect(result.transactions).toHaveTransaction({
            from: pools[poolName],
            to: entryAddress(fx),
            op: tare.TokenPool_Config.PREFIX,
            success: true,
          })
          await expectPool(pools[poolName])
        },
      })
    })
  }

  it('SetPool: delist', async () => {
    await register()
    await accept()
    await measure('SetPool: delist', {
      initiator: fx.administrator.address,
      value: Costs.setPool,
      ownBudget: Costs.forwardBase,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistrySetPool(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
          tokenPool: null,
        }),
      expectOutcome: async (result) => {
        relayed(tar.TokenAdminRegistry_PoolSet.PREFIX)(result)
        await expectPool(null)
      },
    })
  })

  // The token is deployed after registration, so the registration query bounced.
  it('VerifyToken', async () => {
    const minter = await cctMinter('deployed after registration')
    fx.token = minter.address
    await register()
    expect(await entryFor(fx).getEnabled()).toBe(false)
    await minter.sendTopUpTons(fx.owner.getSender(), toNano('0.1'), {})
    await measure('VerifyToken', {
      initiator: fx.other.address,
      value: Costs.verifyToken,
      ownBudget: Costs.forwardBase,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryVerifyToken(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
        }),
      expectOutcome: async () => {
        expect(await entryFor(fx).getEnabled()).toBe(true)
      },
    })
  })

  it('GetTokenInfo', async () => {
    await register()
    await measure('GetTokenInfo', {
      initiator: fx.other.address,
      value: Costs.getTokenInfo,
      ownBudget: Costs.getTokenInfo,
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
      ownBudget: Costs.getTokenInfo,
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
    await register()
    await measure('OverridePendingAdministrator', {
      initiator: fx.owner.address,
      value: Costs.forward,
      ownBudget: Costs.forwardBase,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryOverridePendingAdministrator(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
          administrator: fx.replacementAdministrator.address,
        }),
      expectOutcome: relayed(tar.TokenAdminRegistry_AdministratorTransferRequested.PREFIX),
    })
  })

  it('AcceptAdminRole', async () => {
    await register()
    await measure('AcceptAdminRole', {
      initiator: fx.administrator.address,
      value: Costs.forward,
      ownBudget: Costs.forwardBase,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryAcceptAdminRole(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
        }),
      expectOutcome: relayed(tar.TokenAdminRegistry_AdministratorTransferred.PREFIX),
    })
  })

  it('TransferAdminRole', async () => {
    await register()
    await accept()
    await measure('TransferAdminRole', {
      initiator: fx.administrator.address,
      value: Costs.forward,
      ownBudget: Costs.forwardBase,
      run: (via, value) =>
        fx.registry.sendTokenAdminRegistryTransferAdminRole(via, value, {
          queryId: 0n,
          tokenAddress: fx.token,
          newAdministrator: fx.replacementAdministrator.address,
        }),
      expectOutcome: relayed(tar.TokenAdminRegistry_AdministratorTransferRequested.PREFIX),
    })
  })

  // The entry already runs the root's entry code, so this skips the reinstall.
  it('UpgradeEntry', async () => {
    await register()
    await measure('UpgradeEntry', {
      initiator: fx.other.address,
      value: Costs.upgrade,
      ownBudget: Costs.upgrade,
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
