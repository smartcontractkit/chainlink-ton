import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano } from '@ton/core'

import { JettonMinter, builder as minterBuilder } from '../../../wrappers/jetton/JettonMinter'
import { JettonWallet, builder as walletBuilder } from '../../../wrappers/jetton/JettonWallet'
import { WGRAM_MINT_OPCODE } from '../../../wrappers/wgram'
import { contractCode } from '../../../wrappers/codeLoader'
import { WgramHarnessContract, deployWgramHarness } from '../harness'
import { runTokenGasCalibration, cellStats } from './gas'

runTokenGasCalibration({
  name: 'wGRAM',
  setup: async (blockchain: Blockchain, deployer: SandboxContract<TreasuryContract>) => {
    const minterCode = await contractCode.ccip.local('wgram.JettonMinter')
    const walletCode = await contractCode.ccip.local('wgram.JettonWallet')

    const minter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: null,
          transferAdmin: null,
          walletCode,
          jettonContent: beginCell().storeStringTail('wgram.gas').endCell(),
          totalSupply: 0n,
        },
        minterCode,
      ),
    )
    await minter.sendTopUpTons(deployer.getSender(), toNano('0.01'))

    const harness = await deployWgramHarness(blockchain, deployer)

    return {
      minterAddress: minter.address,
      getWalletAddress: (owner) => minter.getWalletAddress(owner),
      mintOpcode: WGRAM_MINT_OPCODE,
      sendBurn: (owner, walletAddress, opts) => {
        const wallet = blockchain.openContract(JettonWallet.createFromAddress(walletAddress))
        return wallet.sendBurn(owner.getSender(), {
          value: opts.value,
          message: {
            queryId: opts.queryId,
            jettonAmount: opts.jettonAmount,
            responseDestination: opts.responseDestination,
            customPayload: opts.customPayload,
          },
        })
      },
      readConstants: async () => ({
        jettonTransfer: Number(await harness.getGasConsumptionJettonTransfer()),
        jettonReceive: Number(await harness.getGasConsumptionJettonReceive()),
        burnRequest: Number(await harness.getGasConsumptionBurnRequest()),
        burnNotification: Number(await harness.getGasConsumptionBurnNotification()),
      }),
    }
  },
})

// Fee-shape invariants: the live transfer/burn bodies must fit the message sizes the on-chain fee
// guards budget against, and the budget-reuse assumptions must hold.
describe('wGRAM fee-shape constants', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let alice: SandboxContract<TreasuryContract>
  let bob: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>
  let harness: WgramHarnessContract

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    alice = await blockchain.treasury('alice')
    bob = await blockchain.treasury('bob')
    recipient = await blockchain.treasury('recipient')
    harness = await deployWgramHarness(blockchain, deployer)
  })

  it('keeps fee-shape constants aligned with live transfer and burn message bodies', async () => {
    const configured = {
      messageSizeBurnNotificationBits: Number(await harness.getMessageSizeBurnNotificationBits()),
      messageSizeBurnNotificationCells: Number(await harness.getMessageSizeBurnNotificationCells()),
      messageSizeReturnExcessesBits: Number(await harness.getMessageSizeReturnExcessesBits()),
      messageSizeReturnExcessesCells: Number(await harness.getMessageSizeReturnExcessesCells()),
    }

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
      (() => {
        const b = beginCell()
        walletBuilder.messages.out.transferNotificationForRecipient.store(
          {
            queryId: 1,
            jettonAmount: toNano('0.7'),
            senderAddress: alice.address,
            forwardPayload,
          },
          b,
        )
        return b.endCell()
      })(),
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
      bits: configured.messageSizeBurnNotificationBits,
      cells: configured.messageSizeBurnNotificationCells,
    })
    expect(returnExcessesStats).toEqual({
      bits: configured.messageSizeReturnExcessesBits,
      cells: configured.messageSizeReturnExcessesCells,
    })
    expect(burnNotificationLiveStats.bits).toBeLessThanOrEqual(
      configured.messageSizeBurnNotificationBits,
    )
    expect(burnNotificationLiveStats.cells).toBeLessThanOrEqual(
      configured.messageSizeBurnNotificationCells,
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
      (() => {
        const b = beginCell()
        walletBuilder.messages.in.askToTransfer.store(
          {
            queryId: 1,
            jettonAmount: toNano('0.7'),
            // SMALLEST realistic incoming: customPayload is null (one bit, no ref). Any real call
            // is at least this big.
            customPayload: null,
            destination: alice.address,
            responseDestination: deployer.address,
            forwardTonAmount: toNano('0.05'),
            forwardPayload,
          },
          b,
        )
        return b.endCell()
      })(),
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
