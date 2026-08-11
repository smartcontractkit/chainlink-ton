import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { toNano, Cell, Address, beginCell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { LogTypes } from '../../../wrappers/ccip/Logs'
import { assertLog } from '../../Logs'
import { WRAPPED_NATIVE } from '../../../src/utils'

import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as exe from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as deployable from '../../../wrappers/libraries/Deployable'
import * as tr from '../../../wrappers/gen/ccip/TokenRegistry'
import * as mtp from '../../../wrappers/gen/ccip/MockTokenPool'
import * as tp from '../../../wrappers/gen/ccip/pools/TokenPool'
import { JettonMinter } from '../../../wrappers/jetton/JettonMinter'
import * as jw from '../../../wrappers/jetton/JettonWallet'
import { WGRAM_MINT_OPCODE } from '../../../wrappers/wgram'

import { setup } from '../router/Router.Setup'
import EVM_ADDRESS from '../../utils/evmAddress'
import { ChainSelectors } from '../../utils/Selectors'
import { contractCode } from '../../../wrappers/codeLoader'

const JETTON_CONTENT = beginCell().storeStringTail('wgram.e2e').endCell()

// Amount of wGRAM the user transfers (also the CCIP tokenAmount). Deliberately different from
// FORWARD_TON_AMOUNT so the test can prove metadata.value is the attached native TON, not the
// transferred token amount (fees are paid in native TON, not in the transferred token).
const TOKEN_AMOUNT = toNano('5')

// Native TON attached to the transfer notification, used to pay fees + execution costs.
const FORWARD_TON_AMOUNT = toNano('3')

const DestChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001

describe('CCIPSend with token transfer (e2e)', () => {
  let blockchain: Blockchain

  let minterCode: Cell
  let walletCode: Cell
  let mockTokenPoolCode: Cell

  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>

  let minter: SandboxContract<JettonMinter>
  let mockTokenPool: SandboxContract<mtp.MockTokenPool>
  let tokenRegistry: SandboxContract<tr.TokenRegistry>

  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let onRamp: SandboxContract<or.OnRamp>
  let sendExecutor: SandboxContract<exe.CCIPSendExecutor>

  beforeAll(async () => {
    minterCode = await contractCode.ccip.local('wgram.JettonMinter')
    walletCode = await contractCode.ccip.local('wgram.JettonWallet')
    mockTokenPoolCode = await contractCode.ccip.local('ccip.test.mockTokenPool')
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

    // 1. Deploy the wGRAM jetton minter.
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

    // 2. Mint wGRAM to the user (deploys the user's wallet with a balance).
    await minter.sendMint(deployer.getSender(), {
      value: TOKEN_AMOUNT + toNano('1') + toNano('0.3'),
      mintOpcode: WGRAM_MINT_OPCODE,
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

    // 3. Deploy Router/feeQuoter/onRamp/offRamp
    ;({ router, feeQuoter, onRamp } = await setup(blockchain, {
      deployer,
      sender,
    }))

    // 4. Deploy the MockTokenPool that performs the (mock) lock/burn.
    // TODO should be a helper
    mockTokenPool = blockchain.openContract(
      mtp.MockTokenPool.fromStorage(
        {
          poolData: tp.TokenPool_Data.create({
            adminConfig: tp.TokenPool_AdminConfig.create({
              ownable: tp.Ownable2Step.create({
                owner: deployer.address,
                pendingOwner: null,
              }),
              rmnProxy: deployer.address,
              dynamicConfig: tp.TokenPool_DynamicConfig.create({
                router: router.address,
                rateLimitAdmin: deployer.address,
                feeAdmin: deployer.address,
                allowedDepositNamespaces: new Map(),
              }),
              jettonClient: tp.JettonClient.create({
                masterAddress: minter.address,
                jettonWalletCode: walletCode,
              }),
              advancedPoolHooks: null,
            }),
            mirroredPolicy: tp.TokenPool_MirroredPolicy.create({
              onRamps: new Map(),
              offRamps: new Map(),
              cursedSubjects: tp.CursedSubjects.create({
                data: new Set(),
              }),
            }),
            tokenDecimals: 0n,
            remoteChainConfigs: new Map(),
            tokenTransferFeeConfigs: new Map(),
          }),
        },
        { overrideContractCode: mockTokenPoolCode },
      ),
    )
    const deploymentResult = await mockTokenPool.sendDeploy(deployer.getSender(), toNano('0.05'))
    expect(deploymentResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: mockTokenPool.address,
      success: true,
      deploy: true,
    })

    // Register chain config
    const chainUpdateResult = await mockTokenPool.sendTokenPoolApplyChainUpdates(
      deployer.getSender(),
      toNano('0.05'),
      {
        remoteChainSelectorsToRemove: [],
        chainsToAdd: [
          tp.TokenPool_ChainUpdate.create({
            remoteChainSelector: DestChainSelector,
            remotePoolAddresses: [EVM_ADDRESS],
            remoteTokenAddress: EVM_ADDRESS,
            rateLimitConfigs: tp.TokenPool_RateLimitConfigPair.create({
              outbound: tp.RateLimiter_Config.create({
                isEnabled: true,
                capacity: TOKEN_AMOUNT * 10n,
                rate: TOKEN_AMOUNT * 10n,
              }),
              inbound: tp.RateLimiter_Config.create({
                isEnabled: true,
                capacity: TOKEN_AMOUNT * 10n,
                rate: TOKEN_AMOUNT * 10n,
              }),
            }),
          }),
        ],
      },
    )

    expect(chainUpdateResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: mockTokenPool.address,
      success: true,
    })

    // Register the Router as the authorized caller for lock/burn on this chain.
    // The Router forwards Router_LockOrBurn on behalf of the OnRamp, so it's the
    // sender the pool sees for TokenPool_LockOrBurn.
    const rampAccessResult = await mockTokenPool.sendTokenPoolUpdateRampAccess(
      deployer.getSender(),
      toNano('0.05'),
      {
        updates: [
          tp.TokenPool_RampUpdate.create({
            remoteChainSelector: DestChainSelector,
            onRamp: router.address,
            offRamp: null,
          }),
        ],
      },
    )

    expect(rampAccessResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: mockTokenPool.address,
      success: true,
    })

    const setTokenInfoResult = await router.sendRouterTokenRegistrySetTokenInfo(
      deployer.getSender(),
      toNano('0.2'),
      {
        tokenAddress: minter.address,
        tokenInfo: tr.TokenRegistry_TokenInfo.create({
          tokenPool: mockTokenPool.address,
          minterAddress: minter.address,
          enabled: true,
        }),
        isNewEntry: true,
      },
    )

    const tokenRegistryAddress = ((): Address => {
      for (const tx of setTokenInfoResult.transactions) {
        const inMsg = tx.inMessage
        if (
          inMsg?.info.type === 'internal' &&
          inMsg.info.src instanceof Address &&
          inMsg.info.src.equals(router.address) &&
          inMsg.body.beginParse().preloadUint(32) === tr.TokenRegistry_SetTokenInfo.PREFIX
        ) {
          return inMsg.info.dest
        }
      }
      throw new Error('TokenRegistry address not found')
    })()

    tokenRegistry = blockchain.openContract(tr.TokenRegistry.fromAddress(tokenRegistryAddress))
    expect(setTokenInfoResult.transactions).toHaveTransaction({
      from: router.address,
      to: tokenRegistry.address,
      success: true,
      deploy: true,
    })
  })

  it('propagates a token-transfer-initiated CCIP send end to end', async () => {
    const ccipSend = rt.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: DestChainSelector,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [rt.TokenAmount.create({ amount: TOKEN_AMOUNT, token: minter.address })],
      feeToken: WRAPPED_NATIVE, // TODO should be just native?
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      }),
    })

    // The CCIPSend payload travels as the forward payload of the jetton transfer.
    const forwardPayload = rt.Router_CCIPSend.toCell(ccipSend)

    const routerWalletAddress = await minter.getWalletAddress(router.address)
    const senderWallet = blockchain.openContract(
      jw.JettonWallet.createFromAddress(await minter.getWalletAddress(sender.address)),
    )

    // User transfers wGRAM to the router-owned wallet, carrying the CCIPSend payload.
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

    sendExecutor = blockchain.openContract(exe.CCIPSendExecutor.fromAddress(executorAddress))

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
      op: or.OnRamp_Send.PREFIX,
      success: true,
      body(x) {
        if (!x) return false
        const msg = or.OnRamp_Send.fromSlice(x.beginParse())
        return msg.tokenRegistry?.equals(tokenRegistry.address) ?? false
      },
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
      op: exe.CCIPSendExecutor_Execute.PREFIX,
      success: true,
    })
    // executor -> feeQuoter and back
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: feeQuoter.address,
      op: fq.FeeQuoter_GetValidatedFee.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: feeQuoter.address,
      to: executorAddress,
      op: fq.FeeQuoter_MessageValidated.PREFIX,
      success: true,
    })
    // executor -> tokenRegistry and back
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: tokenRegistry.address,
      op: tr.TokenRegistry_GetTokenInfo.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: tokenRegistry.address,
      to: executorAddress,
      op: tr.TokenRegistry_ReturnTokenInfo.PREFIX,
      success: true,
    })
    // executor -> onRamp (requests lock/burn)
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: onRamp.address,
      op: or.OnRamp_ExecutorRequestsLockOrBurn.PREFIX,
      success: true,
    })
    // onRamp -> router (forwards lock/burn)
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      op: rt.Router_LockOrBurn.PREFIX,
      success: true,
    })
    // router -> mockTokenPool (lock/burn) and back to the executor (confirmation)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: mockTokenPool.address,
      op: mtp.TokenPool_LockOrBurn.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: mockTokenPool.address,
      to: executorAddress,
      op: tp.TokenPool_LockOrBurnFinished.PREFIX,
      success: true,
    })
    // executor -> onRamp (finished successfully) and self-destructs
    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: onRamp.address,
      op: or.OnRamp_ExecutorFinishedSuccessfully.PREFIX,
      success: true,
    })

    // OnRamp emits the CCIPMessageSent log. Verify the token-transfer amount equals TOKEN_AMOUNT (wGRAM).
    assertLog(result.transactions, onRamp.address, LogTypes.CCIPMessageSent, {
      message: {
        header: {
          destChainSelector: DestChainSelector,
        },
        sender: sender.address,
        body: {
          tokenAmounts: [{ amount: TOKEN_AMOUNT, token: minter.address }],
        },
      },
    })

    // OnRamp -> router (Router_MessageSent)
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      op: rt.Router_MessageSent.PREFIX,
      success: true,
    })

    // router -> user (CCIPSendACK)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_CCIPSendACK.PREFIX,
      success: true,
    })
  })
})
