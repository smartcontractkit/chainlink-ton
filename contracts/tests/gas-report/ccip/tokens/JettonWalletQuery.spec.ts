import { Blockchain, BlockchainTransaction, SendMessageResult, fetchConfig } from '@ton/sandbox'
import { Address, Cell, beginCell, fromNano, toNano } from '@ton/core'
import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'

import { contractCode } from '../../../../wrappers/codeLoader'
import { Costs } from '../../../../wrappers/ccip/TokenAdminRegistry'
import * as tare from '../../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import * as cct from '../../../../wrappers/gen/ccip/cct/JettonMinter'
import { JettonMinter } from '../../../../wrappers/jetton/JettonMinter'
import {
  Fixture,
  entryAddress,
  entryFor,
  setup,
  tokenInfo,
} from '../../../ccip/tokenAdminRegistry/TokenAdminRegistry.Setup'

// Fees of the TEP-89 wallet query an entry sends to its token (request and
// response forward fees, minter execution, entry handling the response) for
// each available jetton minter, checked against SAFETY_FACTOR times
// TokenAdminRegistryEntry_WALLET_QUERY_VALUE. Uses the TAR_FLOWS_NETWORK config
// and writes snapshots/jetton-wallet-query.<network>.json.
const NETWORK = (process.env['TAR_FLOWS_NETWORK'] ?? 'mainnet') as 'mainnet' | 'testnet' | 'default'
const SNAPSHOT = path.join(__dirname, 'snapshots', `jetton-wallet-query.${NETWORK}.json`)
const SAFETY_FACTOR = 5n

type Minter = { address: Address; deploy: () => Promise<unknown> }

type Row = {
  from: string
  to: string
  op: string
  gasUsed: number
  computeFee: string
  fwdFee: string
}

const results: Record<string, { rows: Row[]; fee: string }> = {}

describe('Jetton wallet query fees', () => {
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
    const max = Object.values(results).reduce((m, r) => (BigInt(r.fee) > m ? BigInt(r.fee) : m), 0n)
    console.log(`\n=== Jetton wallet query (${NETWORK}, TON) ===`)
    console.table(
      Object.fromEntries(
        Object.entries(results).map(([name, r]) => [
          name,
          {
            fee: fromNano(r.fee),
            margin: (Number(Costs.walletQuery) / Number(r.fee)).toFixed(1) + 'x',
          },
        ]),
      ),
    )
    console.log(
      `max ${fromNano(max)} TON, ${SAFETY_FACTOR}x = ${fromNano(max * SAFETY_FACTOR)} TON, ` +
        `WALLET_QUERY_VALUE = ${fromNano(Costs.walletQuery)} TON`,
    )
  })

  const minters: Record<string, () => Promise<Minter>> = {
    // ton-blockchain/jetton-contract reference implementation.
    'reference jetton': async () => {
      const minter = blockchain.openContract(
        JettonMinter.createFromConfig(
          {
            totalSupply: 0n,
            admin: fx.owner.address,
            transferAdmin: null,
            walletCode: await contractCode.jetton('JettonWallet'),
            jettonContent: beginCell().storeStringTail('reference').endCell(),
          },
          await contractCode.jetton('JettonMinter'),
        ),
      )
      return {
        address: minter.address,
        deploy: () => minter.sendTopUpTons(fx.owner.getSender(), toNano('0.1')),
      }
    },
    wGRAM: async () => {
      const minter = blockchain.openContract(
        JettonMinter.createFromConfig(
          {
            totalSupply: 0n,
            admin: null,
            transferAdmin: null,
            walletCode: await contractCode.ccip.local('wgram.JettonWallet'),
            jettonContent: beginCell().storeStringTail('wgram').endCell(),
          },
          await contractCode.ccip.local('wgram.JettonMinter'),
        ),
      )
      return {
        address: minter.address,
        deploy: () => minter.sendTopUpTons(fx.owner.getSender(), toNano('0.1')),
      }
    },
    CCT: async () => {
      const minter = blockchain.openContract(
        cct.JettonMinter.fromStorage(
          {
            totalSupply: 0n,
            adminAddress: fx.owner.address,
            nextAdminAddress: null,
            jettonWalletCode: await contractCode.ccip.local('ccip.cct.JettonWallet'),
            metadataUri: 'cct',
          },
          { overrideContractCode: await contractCode.ccip.local('ccip.cct.JettonMinter') },
        ),
      )
      return {
        address: minter.address,
        deploy: async () => {
          await minter.sendTopUpTons(fx.owner.getSender(), toNano('0.1'), {})
        },
      }
    },
  }

  const register = (token: Address) =>
    fx.registry.sendTokenAdminRegistryRegisterToken(
      blockchain.sender(fx.owner.address),
      Costs.registerToken,
      {
        queryId: 0n,
        tokenAddress: token,
        tokenInfo: tokenInfo(fx, fx.pool, token),
        administrator: fx.administrator.address,
      },
    )

  const measure = async (name: string, token: Address, result: SendMessageResult) => {
    const entry = entryAddress(fx, token)
    const names: Record<string, string> = {
      [entry.toString()]: 'Entry',
      [token.toString()]: 'Minter',
    }
    const isInternal = (tx: BlockchainTransaction, src: Address, dest: Address, op: number) => {
      const info = tx.inMessage?.info
      return (
        info?.type === 'internal' &&
        info.src.equals(src) &&
        info.dest.equals(dest) &&
        tx.inMessage!.body.beginParse().preloadUint(32) === op
      )
    }
    const request = result.transactions.find((tx) =>
      isInternal(tx, entry, token, tare.RequestWalletAddress.PREFIX),
    )
    const response = result.transactions.find((tx) =>
      isInternal(tx, token, entry, tare.ResponseWalletAddress.PREFIX),
    )
    expect(request).toBeDefined()
    expect(response).toBeDefined()

    // forwardFee excludes the ~1/3 the sender keeps in its totalFees; add back
    // the entry's share of the request, which no measured transaction includes.
    const requestFwd = (request!.inMessage!.info as { forwardFee: bigint }).forwardFee
    let fee = (requestFwd * 3n) / 2n - requestFwd
    const rows = [request!, response!].map((tx) => {
      const info = tx.inMessage!.info as { src: Address; dest: Address; forwardFee: bigint }
      const d = tx.description.type === 'generic' ? tx.description : undefined
      const compute = d?.computePhase
      expect(d && !d.aborted).toBe(true)
      fee += info.forwardFee + tx.totalFees.coins
      return {
        from: names[info.src.toString()],
        to: names[info.dest.toString()],
        op: tx === request ? 'RequestWalletAddress' : 'ResponseWalletAddress',
        gasUsed: compute?.type === 'vm' ? Number(compute.gasUsed) : 0,
        computeFee: fromNano(compute?.type === 'vm' ? compute.gasFees : 0n),
        fwdFee: fromNano(info.forwardFee),
      }
    })

    results[name] = { rows, fee: fee.toString() }
    console.log(`\n=== ${name}: ${fromNano(fee)} TON ===`)
    console.table(rows)

    expect(await entryFor(fx, token).getEnabled()).toBe(true)
    expect(fee * SAFETY_FACTOR).toBeLessThanOrEqual(Costs.walletQuery)
  }

  for (const [minterName, build] of Object.entries(minters)) {
    it(`RegisterToken: ${minterName}`, async () => {
      const minter = await build()
      await minter.deploy()
      const result = await register(minter.address)
      await measure(`RegisterToken: ${minterName}`, minter.address, result)
    })

    // The token was deployed after registration, so the first query bounced.
    it(`VerifyToken: ${minterName}`, async () => {
      const minter = await build()
      await register(minter.address)
      expect(await entryFor(fx, minter.address).getEnabled()).toBe(false)
      await minter.deploy()
      const result = await fx.registry.sendTokenAdminRegistryVerifyToken(
        blockchain.sender(fx.other.address),
        Costs.verifyToken,
        { queryId: 0n, tokenAddress: minter.address },
      )
      await measure(`VerifyToken: ${minterName}`, minter.address, result)
    })
  }
})
