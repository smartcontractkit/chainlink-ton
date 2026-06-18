import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { toNano, Cell, Address, beginCell, contractAddress } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { LogTypes } from '../../../wrappers/ccip/Logs'
import { assertLog } from '../../Logs'
import { WRAPPED_NATIVE } from '../../../src/utils'

import * as fq from '../../../wrappers/ccip/FeeQuoter'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as exe from '../../../wrappers/ccip/CCIPSendExecutor'
import * as deployable from '../../../wrappers/libraries/Deployable'
import {
  TokenRegistry,
  TokenRegistry_GetTokenInfo,
  TokenRegistry_ReturnTokenInfo,
  TokenRegistry_TokenInfo,
} from '../../../wrappers/gen/ccip/TokenRegistry'
import {
  MockTokenPool,
  MockTokenPool_LockOrBurn,
  TokenPool_NotifySuccessfulLockOrBurn,
} from '../../../wrappers/gen/ccip/MockTokenPool'
import { JettonMinter } from '../../../wrappers/jetton/JettonMinter'
import * as jw from '../../../wrappers/jetton/JettonWallet'
import { WTON_MINT_OPCODE } from '../../../wrappers/wton'

import { setup, CHAINSEL_EVM_TEST_90000001, EVM_ADDRESS } from '../router/Router.Setup'

// The gen wrapper's constructor is protected and has no fromStorage (no storage fields).
class DeployableMockTokenPool extends MockTokenPool {
  static create() {
    const init = { code: MockTokenPool.CodeCell, data: Cell.EMPTY }
    return new DeployableMockTokenPool(contractAddress(0, init), init)
  }
}

const JETTON_CONTENT = beginCell().storeStringTail('wton.e2e').endCell()

// Amount of wTON the user transfers (also the CCIP tokenAmount). Deliberately different from
// FORWARD_TON_AMOUNT so the test can prove metadata.value is the attached native TON, not the
// transferred token amount (fees are paid in native TON, not in the transferred token).
const TOKEN_AMOUNT = toNano('5')

// Native TON attached to the transfer notification, used to pay fees + execution costs.
const FORWARD_TON_AMOUNT = toNano('1')

describe('CCIPSend with token transfer (e2e)', () => {
  let blockchain: Blockchain

  let minterCode: Cell
  let walletCode: Cell

  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>

  let minter: SandboxContract<JettonMinter>
  let mockTokenPool: SandboxContract<MockTokenPool>
  let tokenRegistry: SandboxContract<TokenRegistry>

  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let onRamp: SandboxContract<or.OnRamp>

  beforeAll(async () => {
    minterCode = await compile('wton.JettonMinter')
    walletCode = await compile('wton.JettonWallet')
  })

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }

    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')

    // 1. Deploy the wTON jetton minter.
    minter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: null,
          transferAdmin: null,
          walletCode,
          jettonContent: JETTON_CONTENT,
          totalSupply: 0n,
        },
        minterCode,
      ),
    )
    await minter.sendTopUpTons(deployer.getSender(), toNano('0.01'))

    // 2. Mint wTON to the user (deploys the user's wallet with a balance).
    await minter.sendMint(deployer.getSender(), {
      value: TOKEN_AMOUNT + toNano('1') + toNano('0.3'),
      mintOpcode: WTON_MINT_OPCODE,
      message: {
        queryId: 0n,
        destination: sender.address,
        tonAmount: toNano('1'),
        jettonAmount: TOKEN_AMOUNT,
        from: null,
        responseDestination: sender.address,
        forwardTonAmount: 0n,
        customPayload: null,
      },
    })

    // 3. Deploy the MockTokenPool that performs the (mock) lock/burn.
    mockTokenPool = blockchain.openContract(DeployableMockTokenPool.create())
    await mockTokenPool.sendDeploy(deployer.getSender(), toNano('0.05'))

    // 4. Deploy the TokenRegistry, hard-coded to return the MockTokenPool address.
    tokenRegistry = blockchain.openContract(
      TokenRegistry.fromStorage({
        info: TokenRegistry_TokenInfo.create({
          tokenPool: mockTokenPool.address,
          minterAddress: minter.address,
          enabled: true,
        }),
      }),
    )
    await tokenRegistry.sendDeploy(deployer.getSender(), toNano('0.05'))

    // 5. Deploy router/feeQuoter/onRamp/offRamp, storing the TokenRegistry in the OnRamp.
    ;({ router, feeQuoter, onRamp } = await setup(blockchain, {
      deployer,
      sender,
      tokenRegistry: tokenRegistry.address,
    }))
  })

  it('propagates a token-transfer-initiated CCIP send end to end', async () => {
    const ccipSend: rt.CCIPSend = {
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [{ amount: TOKEN_AMOUNT, token: minter.address }],
      feeToken: WRAPPED_NATIVE,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: 100n,
          allowOutOfOrderExecution: true,
        })
        .asCell(),
    }

    // The CCIPSend payload travels as the forward payload of the jetton transfer.
    const forwardPayload = rt.builder.message.in.ccipSend.encode(ccipSend).endCell()

    const routerWalletAddress = await minter.getWalletAddress(router.address)
    const senderWallet = blockchain.openContract(
      jw.JettonWallet.createFromAddress(await minter.getWalletAddress(sender.address)),
    )

    // User transfers wTON to the router-owned wallet, carrying the CCIPSend payload.
    const result = await senderWallet.sendTransfer(sender.getSender(), {
      value: FORWARD_TON_AMOUNT + toNano('2'),
      message: {
        queryId: 1,
        jettonAmount: TOKEN_AMOUNT,
        destination: router.address,
        responseDestination: sender.address,
        customPayload: null,
        forwardTonAmount: FORWARD_TON_AMOUNT,
        forwardPayload,
      },
    })

    // Discover the deployed CCIPSendExecutor (first message emitted by the OnRamp).
    const executorAddress = ((): Address => {
      for (const tx of result.transactions) {
        const inMsg = tx.inMessage
        if (
          inMsg?.info.type === 'internal' &&
          inMsg.info.src instanceof Address &&
          inMsg.info.src.equals(onRamp.address) &&
          inMsg.info.dest instanceof Address
        ) {
          return inMsg.info.dest
        }
      }
      throw new Error('Executor address not found')
    })()

    // --- jetton transfer leg ---
    // user -> user wallet
    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: senderWallet.address,
      op: jw.opcodes.in.TRANSFER,
      success: true,
    })
    // user wallet -> router wallet (deploys it)
    expect(result.transactions).toHaveTransaction({
      from: senderWallet.address,
      to: routerWalletAddress,
      op: jw.opcodes.in.INTERNAL_TRANSFER,
      deploy: true,
      success: true,
    })
    // router wallet -> router (transfer notification)
    expect(result.transactions).toHaveTransaction({
      from: routerWalletAddress,
      to: router.address,
      op: jw.opcodes.in.TRANSFER_NOTIFICATION,
      success: true,
    })

    // --- ccip send leg ---
    // router -> onRamp
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      op: or.opcodes.in.onrampSend,
      success: true,
    })
    // onRamp deploys the executor
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: executorAddress,
      op: deployable.opcodes.in.initializeAndSend,
      deploy: true,
      success: true,
    })
    // executor runs itself (Deployable self-message pattern)
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: executorAddress,
      op: exe.opcodes.in.executeV2,
      success: true,
    })
    // executor -> feeQuoter and back
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: feeQuoter.address,
      op: fq.opcodes.in.getValidatedFee,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: feeQuoter.address,
      to: executorAddress,
      op: fq.opcodes.out.messageValidated,
      success: true,
    })
    // executor -> tokenRegistry and back
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: tokenRegistry.address,
      op: TokenRegistry_GetTokenInfo.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: tokenRegistry.address,
      to: executorAddress,
      op: TokenRegistry_ReturnTokenInfo.PREFIX,
      success: true,
    })
    // executor -> onRamp (requests lock/burn)
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: onRamp.address,
      op: or.opcodes.in.executorRequestsLockOrBurn,
      success: true,
    })
    // onRamp -> router (forwards lock/burn)
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      op: rt.opcodes.in.lockOrBurn,
      success: true,
    })
    // router -> mockTokenPool (lock/burn) and back to the executor (confirmation)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: mockTokenPool.address,
      op: MockTokenPool_LockOrBurn.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: mockTokenPool.address,
      to: executorAddress,
      op: TokenPool_NotifySuccessfulLockOrBurn.PREFIX,
      success: true,
    })
    // executor -> onRamp (finished successfully) and self-destructs
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: onRamp.address,
      op: or.opcodes.in.executorFinishedSuccessfully,
      success: true,
    })

    // OnRamp emits the CCIPMessageSent log. Verify the token-transfer amount equals TOKEN_AMOUNT (wTON).
    assertLog(result.transactions, onRamp.address, LogTypes.CCIPMessageSent, {
      message: {
        header: {
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
        },
        sender: sender.address,
        body: {
          tokenAmounts: [{ amount: TOKEN_AMOUNT, token: minter.address }],
        },
      },
    } as any)

    // OnRamp -> router (Router_MessageSent)
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      op: rt.opcodes.in.messageSent,
      success: true,
    })

    // router -> user (CCIPSendACK)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.opcodes.out.ccipSendACK,
      success: true,
    })
  })
})
