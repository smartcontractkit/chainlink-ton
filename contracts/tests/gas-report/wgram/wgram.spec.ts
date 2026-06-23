import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'

import { compile } from '@ton/blueprint'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox'

import { JettonMinter, builder as minterBuilder } from '../../../wrappers/jetton/JettonMinter'
import { JettonWallet, builder as walletBuilder } from '../../../wrappers/jetton/JettonWallet'
import { WGRAM_MINT_OPCODE } from '../../../wrappers/wgram'

const JETTON_DATA_URI = 'wgram.gas'

type ConfiguredGasConstants = {
  GAS_CONSUMPTION_JettonTransfer: number
  GAS_CONSUMPTION_JettonReceive: number
  GAS_CONSUMPTION_BurnRequest: number
  GAS_CONSUMPTION_BurnNotification: number
}

type ConfiguredShapeConstants = {
  MESSAGE_SIZE_BurnNotification_bits: number
  MESSAGE_SIZE_BurnNotification_cells: number
  MESSAGE_SIZE_ReturnExcesses_bits: number
  MESSAGE_SIZE_ReturnExcesses_cells: number
}

function readFeesManagementConstant(source: string, name: string) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`))
  if (!match) {
    throw new Error(`Missing constant ${name} in fees-management.tolk`)
  }
  return Number(match[1])
}

function readFeesManagementSource() {
  const feesFile = path.join(__dirname, '../../../contracts/wgram/fees-management.tolk')
  return fs.readFileSync(feesFile, 'utf8')
}

function readConfiguredGasConstants(): ConfiguredGasConstants {
  const source = readFeesManagementSource()

  return {
    GAS_CONSUMPTION_JettonTransfer: readFeesManagementConstant(
      source,
      'GAS_CONSUMPTION_JettonTransfer',
    ),
    GAS_CONSUMPTION_JettonReceive: readFeesManagementConstant(
      source,
      'GAS_CONSUMPTION_JettonReceive',
    ),
    GAS_CONSUMPTION_BurnRequest: readFeesManagementConstant(source, 'GAS_CONSUMPTION_BurnRequest'),
    GAS_CONSUMPTION_BurnNotification: readFeesManagementConstant(
      source,
      'GAS_CONSUMPTION_BurnNotification',
    ),
  }
}

function readConfiguredShapeConstants(): ConfiguredShapeConstants {
  const source = readFeesManagementSource()

  return {
    MESSAGE_SIZE_BurnNotification_bits: readFeesManagementConstant(
      source,
      'MESSAGE_SIZE_BurnNotification_bits',
    ),
    MESSAGE_SIZE_BurnNotification_cells: readFeesManagementConstant(
      source,
      'MESSAGE_SIZE_BurnNotification_cells',
    ),
    MESSAGE_SIZE_ReturnExcesses_bits: readFeesManagementConstant(
      source,
      'MESSAGE_SIZE_ReturnExcesses_bits',
    ),
    MESSAGE_SIZE_ReturnExcesses_cells: readFeesManagementConstant(
      source,
      'MESSAGE_SIZE_ReturnExcesses_cells',
    ),
  }
}

function cellStats(cell: Cell): { bits: number; cells: number } {
  return cell.refs.reduce(
    (stats, ref) => {
      const nested = cellStats(ref)
      return {
        bits: stats.bits + nested.bits,
        cells: stats.cells + nested.cells,
      }
    },
    { bits: cell.bits.length, cells: 1 },
  )
}

function vmGasUsed(tx: any) {
  if (tx.description.type !== 'generic' || tx.description.computePhase.type !== 'vm') {
    throw new Error('Expected a VM transaction')
  }

  return tx.description.computePhase.gasUsed
}

function internalTxTo(result: { transactions: Array<any> }, destination: Address) {
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

describe('wGRAM gas calibration', () => {
  let blockchain: Blockchain
  let minterCode: Cell
  let walletCode: Cell

  let minter: SandboxContract<JettonMinter>
  let deployer: SandboxContract<TreasuryContract>
  let alice: SandboxContract<TreasuryContract>
  let bob: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let nextQueryId: bigint

  beforeAll(async () => {
    minterCode = await compile('wgram.JettonMinter')
    walletCode = await compile('wgram.JettonWallet')
  })

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    alice = await blockchain.treasury('alice')
    bob = await blockchain.treasury('bob')
    recipient = await blockchain.treasury('recipient')
    nextQueryId = 1n

    const content = beginCell().storeStringTail(JETTON_DATA_URI).endCell()
    minter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: null,
          transferAdmin: null,
          walletCode,
          jettonContent: content,
          totalSupply: 0n,
        },
        minterCode,
      ),
    )

    await minter.sendTopUpTons(deployer.getSender(), toNano('0.01'))
  })

  async function userWallet(owner: Address) {
    return blockchain.openContract(
      JettonWallet.createFromAddress(await minter.getWalletAddress(owner)),
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
      .mintNewJettons({ opcode: WGRAM_MINT_OPCODE })
      .encode({
        queryId,
        destination,
        tonAmount,
        jettonAmount,
        from: null,
        responseDestination: deployer.address,
        forwardTonAmount,
        customPayload: forwardPayload,
      })
      .asCell()

    return await deployer.send({
      to: minter.address,
      value: jettonAmount + tonAmount + toNano('0.5'),
      body,
    })
  }

  it('keeps fee-management gas constants aligned with measured wallet and minter execution', async () => {
    const configured = readConfiguredGasConstants()
    // Exercise the highest live receive branch: notify recipient owner and still send excesses.
    const transferForwardPayload = beginCell().storeStringTail('wgram.gas.forward').endCell()
    const transferCustomPayload = beginCell().storeStringTail('wgram.gas.custom').endCell()
    const burnCustomPayload = beginCell().storeStringTail('wgram.gas.burn').endCell()
    const mintForwardPayload = beginCell().storeStringTail('wgram.gas.mint-forward').endCell()

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

    const burnResult = await bobWallet.sendBurn(bob.getSender(), {
      value: toNano('0.2'),
      message: {
        queryId: nextQueryId++,
        jettonAmount: toNano('0.3'),
        responseDestination: recipient.address,
        customPayload: burnCustomPayload,
      },
    })

    const mintMinterGas = vmGasUsed(internalTxTo(mintResult, minter.address))
    const mintReceiveGas = vmGasUsed(internalTxTo(mintResult, aliceWallet.address))
    const transferSendGas = vmGasUsed(internalTxTo(transferResult, aliceWallet.address))
    const transferReceiveGas = vmGasUsed(internalTxTo(transferResult, bobWallet.address))
    const burnRequestGas = vmGasUsed(internalTxTo(burnResult, bobWallet.address))
    const burnNotificationGas = vmGasUsed(internalTxTo(burnResult, minter.address))
    const maxSendTransferGas = Number(
      transferSendGas > mintMinterGas ? transferSendGas : mintMinterGas,
    )
    const maxReceiveTransferGas = Number(
      transferReceiveGas > mintReceiveGas ? transferReceiveGas : mintReceiveGas,
    )

    console.table([
      { operation: 'mint minter (worst candidate)', gasUsed: mintMinterGas },
      { operation: 'mint receive (candidate)', gasUsed: mintReceiveGas },
      { operation: 'transfer sender wallet (worst candidate)', gasUsed: transferSendGas },
      { operation: 'transfer receiver wallet (worst candidate)', gasUsed: transferReceiveGas },
      { operation: 'burn sender wallet', gasUsed: burnRequestGas },
      { operation: 'burn minter notification', gasUsed: burnNotificationGas },
    ])

    printTransactionFees(mintResult.transactions)
    printTransactionFees(transferResult.transactions)
    printTransactionFees(burnResult.transactions)

    expect({
      GAS_CONSUMPTION_JettonTransfer: maxSendTransferGas,
      GAS_CONSUMPTION_JettonReceive: maxReceiveTransferGas,
      GAS_CONSUMPTION_BurnRequest: Number(burnRequestGas),
      GAS_CONSUMPTION_BurnNotification: Number(burnNotificationGas),
    }).toEqual(configured)
  })

  it('keeps fee-shape constants aligned with live transfer and burn message bodies', () => {
    const configured = readConfiguredShapeConstants()
    const forwardPayload = beginCell().storeStringTail('wgram.gas.shape').endCell()
    const maxCoins = (1n << 120n) - 1n

    const transferBodyStats = cellStats(
      walletBuilder.messages.out.internalTransferStep
        .encode({
          queryId: 1n,
          jettonAmount: toNano('0.7'),
          transferInitiator: alice.address,
          responseDestination: deployer.address,
          forwardTonAmount: toNano('0.05'),
          forwardPayload,
        })
        .asCell(),
    )
    const notificationBodyStats = cellStats(
      walletBuilder.messages.out.transferNotificationForRecipient
        .encode({
          queryId: 1,
          jettonAmount: toNano('0.7'),
          senderAddress: alice.address,
          forwardPayload,
        })
        .asCell(),
    )
    const burnNotificationLiveStats = cellStats(
      walletBuilder.messages.out.burnNotificationForMinter
        .encode({
          queryId: 1n,
          jettonAmount: toNano('0.3'),
          burnInitiator: bob.address,
          responseDestination: recipient.address,
        })
        .asCell(),
    )
    const burnNotificationWorstCaseStats = cellStats(
      walletBuilder.messages.out.burnNotificationForMinter
        .encode({
          queryId: 1n,
          jettonAmount: maxCoins,
          burnInitiator: bob.address,
          responseDestination: recipient.address,
        })
        .asCell(),
    )
    const returnExcessesStats = cellStats(
      walletBuilder.messages.out.returnExcessesBack.encode({ queryId: 1n }).asCell(),
    )

    expect(burnNotificationWorstCaseStats).toEqual({
      bits: configured.MESSAGE_SIZE_BurnNotification_bits,
      cells: configured.MESSAGE_SIZE_BurnNotification_cells,
    })
    expect(returnExcessesStats).toEqual({
      bits: configured.MESSAGE_SIZE_ReturnExcesses_bits,
      cells: configured.MESSAGE_SIZE_ReturnExcesses_cells,
    })
    expect(burnNotificationLiveStats.bits).toBeLessThanOrEqual(
      configured.MESSAGE_SIZE_BurnNotification_bits,
    )
    expect(burnNotificationLiveStats.cells).toBeLessThanOrEqual(
      configured.MESSAGE_SIZE_BurnNotification_cells,
    )
    expect(notificationBodyStats.bits).toBeLessThan(transferBodyStats.bits)
    expect(notificationBodyStats.cells).toBeLessThanOrEqual(transferBodyStats.cells)

    // checkAmountIsEnoughToTransfer and checkAmountIsEnoughToMint both reuse in.originalForwardFee
    // (the fwd-fee for the *incoming* message) as the budget for the *outgoing* message. That is
    // only safe while every outgoing body remains <= its incoming counterpart in both bits and
    // cells. These assertions lock that invariant: a future change that grows InternalTransferStep
    // beyond AskToTransfer (transfer flow) or beyond MintNewJettons (mint flow) will break the
    // budget silently in gas terms, so we catch it here at the shape level.
    const askToTransferBodyStats = cellStats(
      walletBuilder.messages.in.askToTransfer
        .encode({
          queryId: 1,
          jettonAmount: toNano('0.7'),
          // SMALLEST realistic incoming: customPayload is null (one bit, no ref). Any real call
          // is at least this big.
          customPayload: null,
          destination: alice.address,
          responseDestination: deployer.address,
          forwardTonAmount: toNano('0.05'),
          forwardPayload,
        })
        .asCell(),
    )
    expect(transferBodyStats.bits).toBeLessThan(askToTransferBodyStats.bits)
    expect(transferBodyStats.cells).toBeLessThanOrEqual(askToTransferBodyStats.cells)

    const mintNewJettonsBodyStats = cellStats(
      minterBuilder.messages.in
        .mintNewJettons({ opcode: WGRAM_MINT_OPCODE })
        .encode({
          queryId: 1n,
          destination: alice.address,
          tonAmount: toNano('0.3'),
          jettonAmount: toNano('0.7'),
          // The wGRAM minter enforces transferInitiator == null on mint, so the actual outgoing
          // InternalTransferStep is smaller than transferBodyStats. We use transferBodyStats as
          // a strict upper bound for the outgoing — if that bound fits inside the incoming,
          // the real outgoing fits too.
          from: null,
          responseDestination: deployer.address,
          // The minter wrapper's `customPayload` field maps to the inner InternalTransferStep's
          // forwardPayload position in the wire layout. Reuse the same forwardPayload here so
          // the comparison is apples-to-apples with transferBodyStats above.
          customPayload: forwardPayload,
          forwardTonAmount: toNano('0.05'),
        })
        .asCell(),
    )
    expect(transferBodyStats.bits).toBeLessThan(mintNewJettonsBodyStats.bits)
    expect(transferBodyStats.cells).toBeLessThan(mintNewJettonsBodyStats.cells)
  })
})
