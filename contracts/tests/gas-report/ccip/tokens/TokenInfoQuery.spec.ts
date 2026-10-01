import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'

import { contractCode } from '../../../../wrappers/codeLoader'
import * as namespace from '../../../../wrappers/ccip/NameSpace'
import * as tar from '../../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../../wrappers/gen/ccip/TokenAdminRegistryEntry'

// Token-info query cost for the CCIP read path, counting every transaction
// triggered by the query (the requester's own wallet send is excluded). Writes
// snapshots/token-info-query.root-routed.json and prints the overhead against
// token-info-query.direct.json, recorded while executors queried entries
// directly.
const MODEL = 'root-routed'
const OTHER_MODEL = 'direct'

const SNAPSHOT_DIR = path.join(__dirname, 'snapshots')
const snapshotPath = (model: string) => path.join(SNAPSHOT_DIR, `token-info-query.${model}.json`)

type ScenarioResult = {
  transactions: {
    from: string
    to: string
    opCode: string
    gasUsed: number
    computeFee: string
    forwardFee: string
    totalFee: string
  }[]
  totalTransactions: number
  totalGasUsed: number
  totalFee: string
  totalFeeTON: string
}

const results: Record<string, ScenarioResult> = {}

describe('TokenAdminRegistry token info query gas', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let administrator: SandboxContract<TreasuryContract>
  let requester: SandboxContract<TreasuryContract>
  let registry: SandboxContract<tar.TokenAdminRegistry>
  let entry: SandboxContract<tare.TokenAdminRegistryEntry>
  let token: Address
  let pool: Address
  let deployableCode: Cell

  beforeEach(async () => {
    global.console = require('console')
    blockchain = await Blockchain.create()
    deployableCode = await contractCode.ccip.local('Deployable')
    owner = await blockchain.treasury('owner')
    administrator = await blockchain.treasury('administrator')
    requester = await blockchain.treasury('requester')
    token = (await blockchain.treasury('token')).address
    pool = (await blockchain.treasury('pool')).address

    registry = blockchain.openContract(
      tar.TokenAdminRegistry.fromStorage(
        { id: 1n, ownable: tar.Ownable2Step.create({ owner: owner.address }) },
        { overrideContractCode: await contractCode.ccip.local('TokenAdminRegistry') },
      ),
    )
    await registry.sendDeploy(owner.getSender(), toNano('0.1'))
    await registry.sendTokenAdminRegistryRegisterToken(owner.getSender(), toNano('0.1'), {
      tokenAddress: token,
      tokenInfo: tar.TokenRegistry_TokenInfo.create({
        tokenPool: pool,
        minterAddress: token,
        version: 1n,
      }),
      administrator: administrator.address,
    })
    entry = blockchain.openContract(
      tare.TokenAdminRegistryEntry.fromAddress(
        namespace.deriveAddress(
          registry.address,
          namespace.CCIPNamespace.TokenRegistry,
          beginCell().storeAddress(token),
          deployableCode,
        ),
      ),
    )
    await registry.sendTokenAdminRegistryAcceptAdminRole(administrator.getSender(), toNano('0.1'), {
      tokenAddress: token,
    })
  })

  afterAll(() => {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
    fs.writeFileSync(snapshotPath(MODEL), JSON.stringify(results, null, 2) + '\n')
    printComparison()
  })

  // The CCIP read path for the current model.
  const query = () =>
    registry.sendTokenAdminRegistryGetTokenInfo(requester.getSender(), toNano('0.1'), {
      queryId: 1n,
      token,
    })

  const expectReply = (result: SendMessageResult) => {
    const reply = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.dest.equals(requester.address) &&
        tx.inMessage.info.src.equals(registry.address),
    )
    expect(reply).toBeDefined()
  }

  const measure = async (scenario: string) => {
    const result = await query()
    expectReply(result)
    const names: Record<string, string> = {
      [requester.address.toString()]: 'Requester',
      [registry.address.toString()]: 'TokenAdminRegistry',
      [entry.address.toString()]: 'TokenAdminRegistryEntry',
    }
    const rows = result.transactions
      .filter((tx) => tx.inMessage?.info.type === 'internal')
      .map((tx) => {
        const info = tx.inMessage!.info as { src: Address; dest: Address }
        const body = tx.inMessage!.body.beginParse()
        const compute = tx.description.type === 'generic' ? tx.description.computePhase : undefined
        const action = tx.description.type === 'generic' ? tx.description.actionPhase : undefined
        const gasUsed = compute?.type === 'vm' ? Number(compute.gasUsed) : 0
        const computeFee = compute?.type === 'vm' ? compute.gasFees : 0n
        const forwardFee = action?.totalFwdFees ?? 0n
        return {
          from: names[info.src.toString()] ?? info.src.toString(),
          to: names[info.dest.toString()] ?? info.dest.toString(),
          opCode:
            body.remainingBits >= 32
              ? '0x' + body.preloadUint(32).toString(16).padStart(8, '0')
              : '',
          gasUsed,
          computeFee: computeFee.toString(),
          forwardFee: forwardFee.toString(),
          totalFee: (computeFee + forwardFee).toString(),
        }
      })
    const totalFee = rows.reduce((sum, row) => sum + BigInt(row.totalFee), 0n)
    results[scenario] = {
      transactions: rows,
      totalTransactions: rows.length,
      totalGasUsed: rows.reduce((sum, row) => sum + row.gasUsed, 0),
      totalFee: totalFee.toString(),
      totalFeeTON: (Number(totalFee) / 1e9).toFixed(9),
    }
    console.log(`\n=== Token info query (${MODEL}, ${scenario}) ===`)
    console.table(rows)
    console.log(
      `total: ${results[scenario].totalGasUsed} gas, ${results[scenario].totalFeeTON} TON`,
    )
  }

  it('current entry', async () => {
    await measure('current-entry')
  })
})

function printComparison() {
  if (!fs.existsSync(snapshotPath(OTHER_MODEL))) {
    return
  }
  const other: Record<string, ScenarioResult> = JSON.parse(
    fs.readFileSync(snapshotPath(OTHER_MODEL), 'utf8'),
  )
  const [baseline, changed] = [other, results]
  console.log('\n=== TOKEN INFO QUERY: direct vs root-routed ===\n')
  for (const scenario of Object.keys(baseline)) {
    const base = baseline[scenario]
    const next = changed[scenario]
    if (!next) continue
    const deltaFee = BigInt(next.totalFee) - BigInt(base.totalFee)
    const pct = (Number(deltaFee) / Number(BigInt(base.totalFee))) * 100
    console.log(
      `${scenario.padEnd(15)} txs ${base.totalTransactions} -> ${next.totalTransactions} | ` +
        `gas ${base.totalGasUsed} -> ${next.totalGasUsed} (Δ ${next.totalGasUsed - base.totalGasUsed}) | ` +
        `fee ${base.totalFeeTON} -> ${next.totalFeeTON} TON (Δ ${(Number(deltaFee) / 1e9).toFixed(9)} TON, ${pct.toFixed(1)}%)`,
    )
  }
}
