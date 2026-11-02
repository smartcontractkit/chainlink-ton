import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import { NATIVE_GRAM } from '../../../../src/utils'
import { getValidatedFee } from '../../../../src/ccipSend/fee'
import { contractCode } from '../../../../wrappers/codeLoader'
import { CCIPNamespace, deriveAddress } from '../../../../wrappers/ccip/NameSpace'
import { FromBuffer } from '../../../../wrappers/ccip/common/CrossChainAddressCodec'
import * as deployable from '../../../../wrappers/libraries/Deployable'
import * as fq from '../../../../wrappers/gen/ccip/FeeQuoter'
import * as or from '../../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import { Costs } from '../../../../wrappers/ccip/Router'
import { Costs as RegistryCosts } from '../../../../wrappers/ccip/TokenAdminRegistry'
import * as tar from '../../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tp from '../../../../wrappers/gen/ccip/pools/TokenPool'
import { JettonWallet } from '../../../../wrappers/gen/ccip/cct/JettonWallet'
import { setup } from '../../../ccip/router/Router.Setup'
import { ChainFamilySelectors, ChainSelectors } from '../../../utils/Selectors'
import EVM_ADDRESS from '../../../utils/evmAddress'
import { AddressBook, GasReport, gasReportConfig } from '../../utils'
import {
  createExtraArgs,
  createPayload,
  HARD_MAX_DATA_BYTES,
  SEND_DATA_SIZE_SWEEP,
} from '../messaging/config'
import { deployTokenWithPool, POOL_KINDS, TokenWithPool } from './pools'

const DEST_CHAIN_SELECTOR = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001
const TOKEN_AMOUNT = toNano('5')

const jestConsole = console

describe('CCIP OnRamp Token Transfer Gas Estimation', () => {
  let blockchain: Blockchain
  let report: GasReport
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let onRamp: SandboxContract<or.OnRamp>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let tokenAdminRegistry: SandboxContract<tar.TokenAdminRegistry>
  let deployableCode: Cell

  beforeEach(() => {
    global.console = require('console')
  })
  afterEach(() => {
    global.console = jestConsole
  })
  afterAll(() => report.finish())

  beforeAll(async () => {
    blockchain = await Blockchain.create({ config: await gasReportConfig() })
    report = new GasReport('tokens-onramp', blockchain)
    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')
    deployableCode = await contractCode.ccip.local('Deployable')

    tokenAdminRegistry = blockchain.openContract(
      tar.TokenAdminRegistry.fromStorage(
        { id: 0n, ownable: tar.Ownable2Step.create({ owner: deployer.address }) },
        { overrideContractCode: await contractCode.ccip.local('TokenAdminRegistry') },
      ),
    )
    await tokenAdminRegistry.sendDeploy(deployer.getSender(), toNano('0.1'))
    ;({ router, feeQuoter, onRamp } = await setup(blockchain, {
      deployer,
      sender,
      tokenAdminRegistry: tokenAdminRegistry.address,
    }))
    blockchain.verbosity = { ...blockchain.verbosity, print: false, debugLogs: false }

    // Lift the lane limits so the data size sweep fits alongside a token transfer.
    const configResult = await feeQuoter.sendFeeQuoterUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('1'),
      {
        updates: [
          fq.FeeQuoter_UpdateDestChainConfig.create({
            destChainSelector: DEST_CHAIN_SELECTOR,
            destChainConfig: fq.FeeQuoterDestChainConfig.create({
              isEnabled: true,
              maxNumberOfTokensPerMsg: 1n,
              maxDataBytes: 40000n,
              maxPerMsgGasLimit: 100000n,
              destGasOverhead: 0n,
              destGasPerPayloadByteBase: 0n,
              destGasPerPayloadByteHigh: 0n,
              destGasPerPayloadByteThreshold: 0n,
              destDataAvailabilityOverheadGas: 0n,
              destGasPerDataAvailabilityByte: 0n,
              destDataAvailabilityMultiplierBps: 0n,
              chainFamilySelector: ChainFamilySelectors.evm,
              defaultTokenFeeUsdCents: 0n,
              defaultTokenDestGasOverhead: 90000n,
              defaultTxGasLimit: 1n,
              gasMultiplierWeiPerEth: 0n,
              gasPriceStalenessThreshold: 0n,
              networkFeeUsdCents: 0n,
            }),
          }),
        ],
      },
    )
    expect(configResult.transactions).toHaveTransaction({ to: feeQuoter.address, success: true })
  })

  async function deployRegisteredToken(kind: (typeof POOL_KINDS)[number]) {
    const token = await deployTokenWithPool({
      blockchain,
      deployer,
      kind,
      router: router.address,
      remoteChainSelector: DEST_CHAIN_SELECTOR,
      remotePoolAddress: EVM_ADDRESS,
      remoteTokenAddress: FromBuffer(Buffer.concat([Buffer.alloc(12), Buffer.alloc(20, 0xab)])),
      allowedDepositNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
      mints: [{ to: sender.address, amount: TOKEN_AMOUNT * 20n }],
    })

    const registration = await tokenAdminRegistry.sendTokenAdminRegistryRegisterToken(
      deployer.getSender(),
      toNano('0.2'),
      {
        tokenAddress: token.minter.address,
        tokenInfo: tar.TokenRegistry_TokenInfo.create({
          tokenPool: token.pool,
          transferInitiator: token.transferInitiator,
          minterAddress: token.minter.address,
          version: 1n,
        }),
        administrator: deployer.address,
      },
    )
    expect(registration.transactions).toHaveTransaction({ deploy: true, success: true })

    const feeConfig = await feeQuoter.sendFeeQuoterUpdateTokenTransferFeeConfigs(
      deployer.getSender(),
      toNano('1'),
      {
        updates: new Map([
          [
            DEST_CHAIN_SELECTOR,
            fq.UpdateTokenTransferFeeConfig.create({
              add: new Map([
                [
                  token.minter.address,
                  fq.TokenTransferFeeConfig.create({
                    isEnabled: true,
                    minFeeUsdCents: 25n,
                    maxFeeUsdCents: 500n,
                    deciBps: 0n,
                    destGasOverhead: 90000n,
                    destBytesOverhead: 32n,
                  }),
                ],
              ]),
              remove: [],
            }),
          ],
        ]),
      },
    )
    expect(feeConfig.transactions).toHaveTransaction({ to: feeQuoter.address, success: true })

    return token
  }

  async function addressBook(token: TokenWithPool) {
    const onRampAccount = await router.getOnRampAccountAddress(sender.address, token.minter.address)
    const wallet = (owner: Address) => token.minter.getWalletAddress(owner)
    const book = new AddressBook({
      Sender: [sender, 'external'],
      Router: [router, 'ccip'],
      OnRamp: [onRamp, 'ccip'],
      FeeQuoter: [feeQuoter, 'ccip'],
      OnRampAccount: [onRampAccount, 'ccip'],
      TokenAdminRegistry: [tokenAdminRegistry, 'registry'],
      TokenAdminRegistryEntry: [
        deriveAddress(
          tokenAdminRegistry.address,
          CCIPNamespace.TokenRegistry,
          beginCell().storeAddress(token.minter.address),
          deployableCode,
        ),
        'registry',
      ],
      [`${token.kind}Pool`]: [token.pool, 'token'],
      Minter: [token.minter, 'token'],
      SenderWallet: [await wallet(sender.address), 'token'],
      OnRampAccountWallet: [await wallet(onRampAccount), 'token'],
      PoolWallet: [await wallet(token.pool), 'token'],
    })
    if (token.lockbox) {
      book
        .set('LockBox', token.lockbox, 'token')
        .set('LockBoxWallet', await wallet(token.lockbox.address), 'token')
    }
    return { book, onRampAccount }
  }

  async function deposit(token: TokenWithPool, onRampAccount: Address) {
    const senderWallet = blockchain.openContract(
      JettonWallet.fromAddress(await token.minter.getWalletAddress(sender.address)),
    )
    const result = await senderWallet.sendAskToTransfer(sender.getSender(), toNano('0.2'), {
      jettonAmount: TOKEN_AMOUNT,
      transferRecipient: onRampAccount,
      sendExcessesTo: sender.address,
      customPayload: null,
      forwardTonAmount: 0n,
      forwardPayload: beginCell().storeBit(false).endCell().beginParse(),
    })
    expect(result.transactions).not.toHaveTransaction({ success: false })
    return result
  }

  async function ccipSend(token: TokenWithPool, data: Cell, amount = TOKEN_AMOUNT) {
    const msg = rt.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: DEST_CHAIN_SELECTOR,
      receiver: EVM_ADDRESS,
      data,
      tokenAmounts: [rt.TokenAmount.create({ amount, token: token.minter.address })],
      feeToken: NATIVE_GRAM,
      extraArgs: rt.GenericExtraArgsV2.fromSlice(createExtraArgs().beginParse()),
    })
    const fee = await getValidatedFee(blockchain, router.address, msg)
    return router.sendRouterCCIPSend(sender.getSender(), fee + Costs.ccipSendWithTokens, msg)
  }

  function expectACK(result: SendMessageResult) {
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_CCIPSendACK.PREFIX,
    })
  }

  function expectNACK(result: SendMessageResult) {
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_CCIPSendNACK.PREFIX,
    })
    expect(result.transactions).not.toHaveTransaction({ op: rt.Router_CCIPSendACK.PREFIX })
  }

  function setOutboundCapacity(token: TokenWithPool, capacity: bigint) {
    const limit = (cap: bigint) =>
      tp.RateLimiter_Config.create({ isEnabled: true, capacity: cap, rate: cap })
    return blockchain
      .openContract(tp.TokenPool.fromAddress(token.pool))
      .sendTokenPoolSetRateLimitConfig(deployer.getSender(), toNano('0.2'), {
        updates: [
          tp.TokenPool_RateLimitConfigArgs.create({
            remoteChainSelector: DEST_CHAIN_SELECTOR,
            fastFinality: false,
            outboundRateLimiterConfig: limit(capacity),
            inboundRateLimiterConfig: limit(toNano('1000000')),
          }),
        ],
      })
  }

  function nameExecutor(result: SendMessageResult, book: AddressBook) {
    for (const tx of result.transactions) {
      const inMsg = tx.inMessage
      if (
        inMsg?.info.type === 'internal' &&
        inMsg.info.src instanceof Address &&
        inMsg.info.src.equals(onRamp.address) &&
        inMsg.body.beginParse().preloadUint(32) === deployable.opcodes.in.initializeAndSend
      ) {
        book.set('SendExecutor', inMsg.info.dest, 'ccip')
        return
      }
    }
    throw new Error('CCIPSendExecutor not found')
  }

  describe.each(POOL_KINDS)('%s pool', (kind) => {
    let token: TokenWithPool
    let book: AddressBook
    let onRampAccount: Address

    beforeAll(async () => {
      token = await deployRegisteredToken(kind)
      ;({ book, onRampAccount } = await addressBook(token))
    })

    // The pool's jetton wallet returns the jetton excesses to the Router, which has no handler for
    // them (exit 65535, non-bounceable), so the Router keeps that TON on every token send.
    // The registry query and the pool value are budgeted by their own contracts.
    const ccipSendBudget =
      Costs.ccipSendWithTokens -
      RegistryCosts.getTokenInfo -
      Costs.poolLockOrBurnAdmission -
      Costs.tokenPoolFinalization
    const sendFlow = (data: Cell) => ({
      run: () => ccipSend(token, data),
      book,
      discover: nameExecutor,
      budget: ccipSendBudget,
    })

    it('should measure OnRamp account deployment', async () => {
      const { result } = await report.measure(`${kind}: Get OnRamp Account`, {
        run: () =>
          router.sendRouterGetOnRampAccount(sender.getSender(), Costs.getOnRampAccount, {
            token: token.minter.address,
          }),
        book,
        budget: Costs.getOnRampAccount - Costs.depositAccountReserve,
      })
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: onRampAccount,
        deploy: true,
        success: true,
      })
    })

    it('should measure token deposit into the OnRamp account', async () => {
      await report.measure(`${kind}: Token Deposit`, {
        run: () => deposit(token, onRampAccount),
        book,
      })
    })

    it('should measure token transfer without data', async () => {
      const { result } = await report.measure(
        `${kind}: CCIPSend Token Transfer`,
        sendFlow(Cell.EMPTY),
      )
      expectACK(result)
    })

    it(`should measure token transfer with ${HARD_MAX_DATA_BYTES} bytes of data`, async () => {
      await deposit(token, onRampAccount)
      const { result } = await report.measure(
        `${kind}: CCIPSend Token Transfer + Max Payload`,
        sendFlow(createPayload(HARD_MAX_DATA_BYTES)),
      )
      expectACK(result)
    })

    it('should measure how the token transfer cost scales with data size', async () => {
      for (const size of SEND_DATA_SIZE_SWEEP) {
        await deposit(token, onRampAccount)
        const { result } = await report.measure(
          `sweep: ${kind}: CCIPSend Token Transfer + ${size} bytes`,
          sendFlow(createPayload(size)),
        )
        expectACK(result)
      }
    })

    // The rate limit makes the pool throw, so the relay bounces back to the Router.
    it(`should measure a token transfer with ${HARD_MAX_DATA_BYTES} bytes of data rejected by the pool`, async () => {
      await deposit(token, onRampAccount)
      await setOutboundCapacity(token, 1n)
      const { result } = await report.measure(
        `${kind}: CCIPSend Token Transfer + Max Payload rejected by pool`,
        {
          ...sendFlow(createPayload(HARD_MAX_DATA_BYTES)),
          aborts: [`Router->${kind}Pool`],
        },
      )
      await setOutboundCapacity(token, toNano('1000000'))
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        op: rt.Router_TokenPoolLockOrBurnFailed.PREFIX,
        success: true,
      })
      expectNACK(result)
    })

    // The account holds fewer jettons than the transfer, so the withdraw bounces after admission.
    it(`should measure a token transfer with ${HARD_MAX_DATA_BYTES} bytes of data whose withdraw fails`, async () => {
      const { result } = await report.measure(
        `${kind}: CCIPSend Token Transfer + Max Payload withdraw failed`,
        {
          ...sendFlow(createPayload(HARD_MAX_DATA_BYTES)),
          run: () => ccipSend(token, createPayload(HARD_MAX_DATA_BYTES), TOKEN_AMOUNT * 1000n),
          aborts: ['OnRampAccount->OnRampAccountWallet'],
        },
      )
      expect(result.transactions).toHaveTransaction({
        to: router.address,
        op: rt.DepositAccount_WithdrawFailed.PREFIX,
        success: true,
      })
      expectNACK(result)
    })
  })
})
