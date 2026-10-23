import { findTransaction } from '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'

import * as coverage from '../../coverage/coverage'
import { assertLog } from '../../Logs'
import { LogTypes } from '../../../wrappers/ccip/Logs'
import { contractCode } from '../../../wrappers/codeLoader'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as deposit from '../../../wrappers/gen/ccip/DepositAccount'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import { CCIPNamespace } from '../../../wrappers/ccip/NameSpace'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import { setup, contractsCoverageConfig } from './Router.Setup'
import { ChainSelectors } from '../../utils/Selectors'

// Value covering the Router's compute + the DepositAccount_Withdraw forward (the Router carries
// all remaining value forward on each leg).
const withdrawValue = toNano('1')

describe('Router.withdrawToTokenPool', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>
  let depositAccountCode: Cell
  let deployableCode: Cell
  let token: Address
  let executor: SandboxContract<TreasuryContract>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
    depositAccountCode = await contractCode.ccip.local('ccip.account.DepositAccount')
    deployableCode = await contractCode.ccip.local('Deployable')
    token = (await blockchain.treasury('jettonMaster')).address
  })

  beforeEach(async () => {
    ;({ deployer, sender, router } = await setup(blockchain, { feeQuoter, onRamp }))
    executor = await blockchain.treasury('executor')
  })

  const destChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001

  // The sender's deposit account for `jetton`, derived exactly like Router.onRampAccountAddress
  // (Deployable namespace OnRampAccount, owner = Router, id = (user, token)).
  const accountAddressFor = (user: Address, jetton: Address = token): Address =>
    NameSpace.deriveAddress(
      router.address,
      NameSpace.CCIPNamespace.OnRampAccount,
      beginCell().storeAddress(user).storeAddress(jetton),
      deployableCode,
    )

  // Requests the on-ramp account and, on its first init, answers the account's TEP-89 wallet
  // query on behalf of the token.
  const requestOnRampAccount = async (
    via: SandboxContract<TreasuryContract>,
    jetton: Address = token,
    value: bigint = toNano('1'),
  ) => {
    const request = await router.sendRouterGetOnRampAccount(via.getSender(), value, {
      token: jetton,
    })
    const account = accountAddressFor(via.address, jetton)
    if (
      !findTransaction(request.transactions, {
        from: account,
        to: jetton,
        op: deposit.RequestWalletAddress.PREFIX,
      })
    ) {
      return request
    }
    const answer = await blockchain
      .openContract(deposit.DepositAccount.fromAddress(account))
      .sendResponseWalletAddress(blockchain.sender(jetton), toNano('0.05'), {
        queryId: 0n,
        jettonWalletAddress: new Address(0, beginCell().storeAddress(account).endCell().hash()),
        ownerAddress: null,
      })
    return { ...answer, transactions: [...request.transactions, ...answer.transactions] }
  }

  // Deploys the sender's deposit account through the Router's permissionless
  // Router_GetOnRampAccount entrypoint, so the account exists with the Router as owner.
  const deployDepositAccount = async (user: SandboxContract<TreasuryContract>) => {
    const res = await requestOnRampAccount(user)
    expect(res.transactions).toHaveTransaction({
      from: router.address,
      to: user.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      success: true,
    })
    return accountAddressFor(user.address)
  }

  const buildWithdrawRequest = (opts: {
    depositAccount: Address
    amount: bigint
    tokenPool: Address
    replyTo?: Address
  }): rt.Router_WithdrawRequest =>
    rt.Router_WithdrawRequest.create({
      depositAccount: opts.depositAccount,
      amount: opts.amount,
      tokenPool: opts.tokenPool,
      forwardTonAmount: toNano('0.05'),
      forwardPayload: buildLockOrBurnForwardPayload(
        opts.replyTo === undefined ? executor.address : opts.replyTo,
      ),
    })

  // A minimal but well-formed LockOrBurn forward payload. The Router forwards it verbatim into the
  // AskToTransfer's forward payload and only reads `requestMsg.replyTo`, the executor to fail.
  const buildLockOrBurnForwardPayload = (
    replyTo: Address = executor.address,
  ): rt.TokenPool_LockOrBurnForwardPayload =>
    rt.TokenPool_LockOrBurnForwardPayload.create({
      originalSender: sender.address,
      requestMsg: rt.TokenPool_LockOrBurn.create({
        queryId: 0n,
        request: rt.TokenPool_LockOrBurnInV1.create({
          transfer: {
            $: 'TokenPool_Transfer',
            id: 0n,
            details: rt.TokenPool_TransferDetails.create({
              receiver: CrossChainAddressCodec.FromBuffer(Buffer.from('receiver')),
              remoteChainSelector: destChainSelector,
              originalSender: sender.address,
              amount: 0n,
              localToken: sender.address,
            }),
          },
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo,
        failureValue: toNano('0.01'),
        onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
      }),
      prepared: rt.TokenPool_LockOrBurnPrepared.create({
        feeAmount: 0n,
        destTokenAmount: 0n,
        out: rt.TokenPool_LockOrBurnOutV1.create({
          destTokenAddress: CrossChainAddressCodec.FromBuffer(Buffer.from('dest-token')),
          destPoolData: Cell.EMPTY,
        }),
      }),
    })

  // The DepositAccount_Withdraw the Router builds in `onWithdrawToTokenPool`, as reported back
  // in a DepositAccount_WithdrawFailed.
  const buildWithdraw = (tokenPool: Address): deposit.DepositAccount_Withdraw =>
    deposit.DepositAccount_Withdraw.create({
      queryId: 0n,
      ask: deposit.DepositAccount_WithdrawAskToTransfer.create({
        jettonAmount: toNano('5'),
        transferRecipient: tokenPool,
        sendExcessesTo: onRamp.address,
        customPayload: null,
        forwardTonAmount: 0n,
        forwardPayload: rt.TokenPool_LockOrBurnForwardPayload.toCell(
          buildLockOrBurnForwardPayload(),
        ),
      }),
    })

  const expectCCIPSendFailed = (
    result: Awaited<ReturnType<typeof router.sendRouterWithdrawToTokenPool>>,
    tokenPool: Address,
    error: string,
  ) =>
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: executor.address,
      op: rt.Router_TokenPoolLockOrBurnFailed.PREFIX,
      body(body) {
        if (!body) return false
        const failed = rt.Router_TokenPoolLockOrBurnFailed.fromSlice(body.beginParse())
        return (
          failed.tokenPool.equals(tokenPool) && failed.exitCode === BigInt(rt.Router.Errors[error])
        )
      },
    })

  it('forwards the withdraw to the deposit account as DepositAccount_Withdraw', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const accountAddress = await deployDepositAccount(sender)

    const withdrawRequest = buildWithdrawRequest({
      depositAccount: accountAddress,
      amount: toNano('5'),
      tokenPool: tokenPool.address,
    })

    const result = await router.sendRouterWithdrawToTokenPool(onRamp.getSender(), withdrawValue, {
      destChainSelector,
      executor: executor.address,
      withdrawRequest,
    })

    // The Router accepted the message from the registered OnRamp...
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      op: rt.Router_WithdrawToTokenPool.PREFIX,
      success: true,
    })

    // ...and forwarded it to the deposit account as DepositAccount_Withdraw, building the ask
    // from the request's fields. Excess TON goes to the OnRamp (the withdraw requester).
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: accountAddress,
      op: deposit.DepositAccount_Withdraw.PREFIX,
      success: true,
      body(body) {
        if (!body) return false
        const ask = deposit.DepositAccount_Withdraw.fromSlice(body.beginParse()).ask
        return (
          ask.jettonAmount === withdrawRequest.amount &&
          ask.transferRecipient.equals(tokenPool.address) &&
          ask.sendExcessesTo != null &&
          ask.sendExcessesTo.equals(onRamp.address)
        )
      },
    })
  })

  it('rejects the withdraw when the dest chain has no OnRamp registered', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const accountAddress = await deployDepositAccount(sender)

    const result = await router.sendRouterWithdrawToTokenPool(onRamp.getSender(), withdrawValue, {
      queryID: 7n,
      destChainSelector: destChainSelector + 1n, // never registered
      executor: executor.address,
      withdrawRequest: buildWithdrawRequest({
        depositAccount: accountAddress,
        amount: toNano('5'),
        tokenPool: tokenPool.address,
      }),
    })

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.DestChainNotEnabled'],
    })
    expect(result.transactions).not.toHaveTransaction({
      to: accountAddress,
      op: deposit.DepositAccount_Withdraw.PREFIX,
    })
  })

  it('emits TokenPoolWithdrawBounced when the deposit account reports a failed withdraw', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const accountAddress = await deployDepositAccount(sender)
    const walletAddress = await blockchain.treasury('accountWallet')
    const withdraw = buildWithdraw(tokenPool.address)

    // The deposit account reports the bounced withdraw (as it does when its AskToTransfer
    // bounces back from the jetton wallet).
    const result = await router.sendDepositAccountWithdrawFailed(
      // The message must come from the sender's derived deposit account: the Router re-derives
      // the expected account address from the reported (user, token) pair.
      blockchain.sender(accountAddress),
      toNano('0.5'),
      {
        user: sender.address,
        token,
        walletAddress: walletAddress.address,
        request: withdraw,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: accountAddress,
      to: router.address,
      op: deposit.DepositAccount_WithdrawFailed.PREFIX,
      success: true,
    })

    assertLog(result.transactions, router.address, LogTypes.TokenPoolWithdrawBounced, {
      wallet: walletAddress.address,
      tokenPool: tokenPool.address,
      exitCode: 0n,
    })
    expectCCIPSendFailed(result, tokenPool.address, 'Router_Error.OnRampAccountWithdrawFailed')
  })

  it('fails the CCIPSend when the account transfer to the pool bounces', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const accountAddress = await deployDepositAccount(sender)

    // The account's learned wallet (answered by the test on the token's behalf) has no contract, so
    // the account's AskToTransfer bounces and the account reports it back to the Router.
    const result = await router.sendRouterWithdrawToTokenPool(onRamp.getSender(), withdrawValue, {
      destChainSelector,
      executor: executor.address,
      withdrawRequest: buildWithdrawRequest({
        depositAccount: accountAddress,
        amount: toNano('5'),
        tokenPool: tokenPool.address,
      }),
    })
    expect(result.transactions).toHaveTransaction({
      from: accountAddress,
      to: router.address,
      op: deposit.DepositAccount_WithdrawFailed.PREFIX,
      success: true,
    })
    expectCCIPSendFailed(result, tokenPool.address, 'Router_Error.OnRampAccountWithdrawFailed')
  })

  it('fails the CCIPSend when the account rejects the withdraw', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    // The sender never requested an on-ramp account, so the withdraw bounces off its address.
    const accountAddress = accountAddressFor(sender.address)

    const result = await router.sendRouterWithdrawToTokenPool(onRamp.getSender(), withdrawValue, {
      destChainSelector,
      executor: executor.address,
      withdrawRequest: buildWithdrawRequest({
        depositAccount: accountAddress,
        amount: toNano('5'),
        tokenPool: tokenPool.address,
      }),
    })
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: executor.address,
      op: rt.Router_TokenPoolLockOrBurnFailed.PREFIX,
      body(body) {
        if (!body) return false
        return rt.Router_TokenPoolLockOrBurnFailed.fromSlice(body.beginParse()).tokenPool.equals(
          tokenPool.address,
        )
      },
    })
  })

  it('fails the CCIPSend without withdrawing when the payload names another executor', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const accountAddress = await deployDepositAccount(sender)
    const otherExecutor = await blockchain.treasury('otherExecutor')

    const result = await router.sendRouterWithdrawToTokenPool(onRamp.getSender(), withdrawValue, {
      destChainSelector,
      executor: executor.address,
      withdrawRequest: buildWithdrawRequest({
        depositAccount: accountAddress,
        amount: toNano('5'),
        tokenPool: tokenPool.address,
        replyTo: otherExecutor.address,
      }),
    })
    expect(result.transactions).not.toHaveTransaction({
      to: accountAddress,
      op: deposit.DepositAccount_Withdraw.PREFIX,
    })
    expectCCIPSendFailed(result, tokenPool.address, 'Router_Error.WithdrawExecutorMismatch')
  })

  it('rejects a DepositAccount_WithdrawFailed from an address that is not the claimed deposit account', async () => {
    const attacker = await blockchain.treasury('attacker')
    const tokenPool = await blockchain.treasury('tokenPool')
    const walletAddress = await blockchain.treasury('accountWallet')
    const withdraw = buildWithdraw(tokenPool.address)

    // The attacker claims the withdraw failed for the sender's deposit account, but the message
    // does not come from the account address the Router derives from the reported identity.
    const result = await router.sendDepositAccountWithdrawFailed(
      attacker.getSender(),
      toNano('0.5'),
      {
        user: sender.address,
        token,
        walletAddress: walletAddress.address,
        request: withdraw,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: attacker.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOnRampAccount'],
    })
  })

  it('rejects a DepositAccount_WithdrawFailed whose reported token does not match the sending account', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const walletAddress = await blockchain.treasury('accountWallet')
    const otherToken = (await blockchain.treasury('otherJettonMaster')).address
    const accountAddress = await deployDepositAccount(sender)

    // The genuine (sender, token) account reports an identity for a different token.
    const result = await router.sendDepositAccountWithdrawFailed(
      blockchain.sender(accountAddress),
      toNano('0.5'),
      {
        user: sender.address,
        token: otherToken,
        walletAddress: walletAddress.address,
        request: buildWithdraw(tokenPool.address),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: accountAddress,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOnRampAccount'],
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_withdrawToTokenPool',
        await contractsCoverageConfig(),
      )
    }
  })
})
