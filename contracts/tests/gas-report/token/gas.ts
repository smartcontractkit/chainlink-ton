import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'

import { builder as minterBuilder } from '../../../wrappers/jetton/JettonMinter'
import { JettonWallet } from '../../../wrappers/jetton/JettonWallet'

/// The token's own gas estimates, read from the on-chain cost model via a harness getter. These are
/// the exact constants the wallet/minter fund against; a calibration test asserts measured == these.
export type TokenGasConstants = {
  jettonTransfer: number
  jettonReceive: number
  burnRequest: number
  burnNotification: number
}

export type MeasuredTokenGas = {
  mintMinterGas: bigint
  mintReceiveGas: bigint
  transferSendGas: bigint
  transferReceiveGas: bigint
  burnRequestGas: bigint
  burnNotificationGas: bigint
  maxSendTransferGas: bigint
  maxReceiveTransferGas: bigint
}

export type BurnOptions = {
  value: bigint
  queryId: bigint
  jettonAmount: bigint
  responseDestination: Address
  customPayload: Cell | null
}

export type SendResult = { transactions: Array<any> }

/// Everything a token needs to expose to the generic calibration runner. `sendBurn` is
/// token-specific because CCT's `AskToBurn` carries an extra optional field. `assertBudget` is an
/// optional extra invariant (e.g. wGRAM checks the pool's buffered reference budget covers it).
export type TokenHandle = {
  minterAddress: Address
  getWalletAddress: (owner: Address) => Promise<Address>
  mintOpcode: number
  sendBurn: (
    owner: SandboxContract<TreasuryContract>,
    walletAddress: Address,
    opts: BurnOptions,
  ) => Promise<SendResult>
  readConstants: () => Promise<TokenGasConstants>
  assertBudget?: (measured: MeasuredTokenGas) => Promise<void>
}

export type TokenGasFixture = {
  name: string
  setup: (
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
  ) => Promise<TokenHandle>
}

export function vmGasUsed(tx: any): bigint {
  if (tx.description.type !== 'generic' || tx.description.computePhase.type !== 'vm') {
    throw new Error('Expected a VM transaction')
  }
  return tx.description.computePhase.gasUsed
}

export function internalTxTo(result: { transactions: Array<any> }, destination: Address) {
  const tx = result.transactions.find((candidate) => {
    return (
      candidate.inMessage?.info.type === 'internal' &&
      candidate.inMessage.info.dest.equals(destination)
    )
  })
  if (!tx) {
    throw new Error(`Missing internal transaction to ${destination.toString()}`)
  }
  return tx
}

export function cellStats(cell: Cell): { bits: number; cells: number } {
  return cell.refs.reduce(
    (stats, ref) => {
      const nested = cellStats(ref)
      return { bits: stats.bits + nested.bits, cells: stats.cells + nested.cells }
    },
    { bits: cell.bits.length, cells: 1 },
  )
}

/// Measures the covered live branches (mint, transfer, burn) for a token and asserts the on-chain
/// fee-management constants match. Any covered-path change that moves gas fails here.
export function runTokenGasCalibration(fixture: TokenGasFixture) {
  describe(`${fixture.name} token gas calibration`, () => {
    let blockchain: Blockchain
    let deployer: SandboxContract<TreasuryContract>
    let alice: SandboxContract<TreasuryContract>
    let bob: SandboxContract<TreasuryContract>
    let recipient: SandboxContract<TreasuryContract>
    let token: TokenHandle
    let nextQueryId: bigint

    beforeEach(async () => {
      blockchain = await Blockchain.create()
      deployer = await blockchain.treasury('deployer')
      alice = await blockchain.treasury('alice')
      bob = await blockchain.treasury('bob')
      recipient = await blockchain.treasury('recipient')
      nextQueryId = 1n
      token = await fixture.setup(blockchain, deployer)
    })

    async function userWallet(owner: Address) {
      return blockchain.openContract(
        JettonWallet.createFromAddress(await token.getWalletAddress(owner)),
      )
    }

    async function mintTo(
      destination: Address,
      jettonAmount: bigint,
      {
        tonAmount = toNano('0.2'),
        forwardTonAmount = 0n,
        forwardPayload = null,
      }: {
        tonAmount?: bigint
        forwardTonAmount?: bigint
        forwardPayload?: Cell | null
      } = {},
    ) {
      const queryId = nextQueryId++
      const body = minterBuilder.messages.in
        .mintNewJettons({ opcode: token.mintOpcode })
        .encode({
          queryId,
          destination,
          tonAmount,
          jettonAmount,
          // Both CCT and wGRAM mint from the minter (the pool path), so no source-wallet initiator.
          from: null,
          responseDestination: deployer.address,
          forwardTonAmount,
          customPayload: forwardPayload,
        })
        .asCell()

      return await deployer.send({
        to: token.minterAddress,
        value: jettonAmount + tonAmount + toNano('0.5'),
        body,
      })
    }

    it('keeps fee-management gas constants aligned with measured wallet and minter execution', async () => {
      const configured = await token.readConstants()
      // Exercise the highest live receive branch: notify recipient owner and still send excesses.
      const transferForwardPayload = beginCell().storeStringTail('gas.forward').endCell()
      const transferCustomPayload = beginCell().storeStringTail('gas.custom').endCell()
      const burnCustomPayload = beginCell().storeStringTail('gas.burn').endCell()
      const mintForwardPayload = beginCell().storeStringTail('gas.mint-forward').endCell()

      const mintResult = await mintTo(alice.address, toNano('1.5'), {
        tonAmount: toNano('0.3'),
        forwardTonAmount: toNano('0.05'),
        forwardPayload: mintForwardPayload,
      })
      const aliceWallet = await userWallet(alice.address)
      const bobWallet = await userWallet(bob.address)

      const transferResult = await aliceWallet.sendTransfer(alice.getSender(), {
        value: toNano('0.8'),
        message: {
          queryId: Number(nextQueryId++),
          jettonAmount: toNano('0.7'),
          destination: bob.address,
          responseDestination: alice.address,
          customPayload: transferCustomPayload,
          forwardTonAmount: toNano('0.05'),
          forwardPayload: transferForwardPayload,
        },
      })

      const burnResult = await token.sendBurn(bob, bobWallet.address, {
        value: toNano('0.2'),
        queryId: nextQueryId++,
        jettonAmount: toNano('0.3'),
        responseDestination: recipient.address,
        customPayload: burnCustomPayload,
      })

      const mintMinterGas = vmGasUsed(internalTxTo(mintResult, token.minterAddress))
      const mintReceiveGas = vmGasUsed(internalTxTo(mintResult, aliceWallet.address))
      const transferSendGas = vmGasUsed(internalTxTo(transferResult, aliceWallet.address))
      const transferReceiveGas = vmGasUsed(internalTxTo(transferResult, bobWallet.address))
      const burnRequestGas = vmGasUsed(internalTxTo(burnResult, bobWallet.address))
      const burnNotificationGas = vmGasUsed(internalTxTo(burnResult, token.minterAddress))

      const measured: MeasuredTokenGas = {
        mintMinterGas,
        mintReceiveGas,
        transferSendGas,
        transferReceiveGas,
        burnRequestGas,
        burnNotificationGas,
        maxSendTransferGas: transferSendGas > mintMinterGas ? transferSendGas : mintMinterGas,
        maxReceiveTransferGas:
          transferReceiveGas > mintReceiveGas ? transferReceiveGas : mintReceiveGas,
      }

      console.table([
        { operation: 'mint minter (worst candidate)', gasUsed: mintMinterGas },
        { operation: 'mint receive (candidate)', gasUsed: mintReceiveGas },
        { operation: 'transfer sender wallet (worst candidate)', gasUsed: transferSendGas },
        { operation: 'transfer receiver wallet (worst candidate)', gasUsed: transferReceiveGas },
        { operation: 'burn sender wallet', gasUsed: burnRequestGas },
        { operation: 'burn minter notification', gasUsed: burnNotificationGas },
      ])

      expect({
        jettonTransfer: Number(measured.maxSendTransferGas),
        jettonReceive: Number(measured.maxReceiveTransferGas),
        burnRequest: Number(burnRequestGas),
        burnNotification: Number(burnNotificationGas),
      }).toEqual(configured)

      await token.assertBudget?.(measured)
    })
  })
}
