import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'

import * as coverage from '../../coverage/coverage'
import { assertLog } from '../../Logs'
import { LogTypes } from '../../../wrappers/ccip/Logs'
import { contractCode } from '../../../wrappers/codeLoader'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as deposit from '../../../wrappers/gen/ccip/DepositAccount'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import { setup, contractsCoverageConfig } from './Router.Setup'
import { ChainSelectors } from '../../utils/Selectors'
import { generateMockTonAddress } from '../../../src/utils'

// Value covering the Router's compute + the DepositAccount_Withdraw forward (the Router carries
// all remaining value forward on each leg).
const withdrawValue = toNano('1')

// The Router does not validate the token on GetOnRampAccount: it only keys the account by it.
const token = generateMockTonAddress()

describe('Router.withdrawToTokenPool', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>
  let depositAccountCode: Cell
  let deployableCode: Cell

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
  })

  beforeEach(async () => {
    ;({ deployer, sender, router } = await setup(blockchain, { feeQuoter, onRamp }))
  })

  const destChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001

  // The sender's per-user deposit account, derived exactly like Router.onRampAccountAddress
  // (Deployable namespace OnRampAccount, owner = Router, id = (user address, token)).
  const accountAddressFor = (user: Address): Address =>
    NameSpace.deriveAddress(
      router.address,
      NameSpace.CCIPNamespace.OnRampAccount,
      beginCell().storeAddress(user).storeAddress(token),
      deployableCode,
    )

  // Deploys the sender's deposit account through the Router's permissionless
  // Router_GetOnRampAccount entrypoint, so the account exists with the Router as owner.
  const deployDepositAccount = async (user: SandboxContract<TreasuryContract>) => {
    const res = await router.sendRouterGetOnRampAccount(user.getSender(), toNano('1'), { token })
    expect(res.transactions).toHaveTransaction({
      from: router.address,
      to: user.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      success: true,
    })
    return accountAddressFor(user.address)
  }

  const buildWithdrawRequest = (opts: {
    accountWalletAddress: Address
    depositAccount: Address
    amount: bigint
    tokenPool: Address
  }): rt.Router_WithdrawRequest =>
    rt.Router_WithdrawRequest.create({
      accountWalletAddress: opts.accountWalletAddress,
      depositAccount: opts.depositAccount,
      amount: opts.amount,
      tokenPool: opts.tokenPool,
      forwardPayload: buildLockOrBurnForwardPayload(),
    })

  // A minimal but well-formed LockOrBurn forward payload: the Router only forwards it verbatim
  // into the AskToTransfer's forward payload (it never inspects the contents).
  const buildLockOrBurnForwardPayload = (): rt.TokenPool_LockOrBurnForwardPayload =>
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
        replyTo: null,
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

  it('forwards the withdraw to the deposit account as DepositAccount_Withdraw', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const accountAddress = await deployDepositAccount(sender)
    const walletAddress = await blockchain.treasury('accountWallet')

    const withdrawRequest = buildWithdrawRequest({
      accountWalletAddress: walletAddress.address,
      depositAccount: accountAddress,
      amount: toNano('5'),
      tokenPool: tokenPool.address,
    })

    const result = await router.sendRouterWithdrawToTokenPool(onRamp.getSender(), withdrawValue, {
      destChainSelector,
      withdrawRequest,
    })

    // The Router accepted the message from the registered OnRamp...
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      op: rt.Router_WithdrawToTokenPool.PREFIX,
      success: true,
    })

    // ...and forwarded it to the deposit account as DepositAccount_Withdraw, building the AskToTransfer from the request's fields.
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: accountAddress,
      op: deposit.DepositAccount_Withdraw.PREFIX,
      success: true,
      body(body) {
        if (!body) return false
        const withdraw = deposit.DepositAccount_Withdraw.fromSlice(body.beginParse())
        if (!withdraw.walletAddress.equals(walletAddress.address)) return false
        const ask = withdraw.ask
        return (
          ask.jettonAmount === withdrawRequest.amount &&
          ask.transferRecipient.equals(tokenPool.address) &&
          ask.sendExcessesTo != null &&
          ask.sendExcessesTo.equals(router.address)
        )
      },
    })
  })

  it('rejects the withdraw when the dest chain has no OnRamp registered', async () => {
    const tokenPool = await blockchain.treasury('tokenPool')
    const accountAddress = await deployDepositAccount(sender)
    const walletAddress = await blockchain.treasury('accountWallet')

    const result = await router.sendRouterWithdrawToTokenPool(onRamp.getSender(), withdrawValue, {
      queryID: 7n,
      destChainSelector: destChainSelector + 1n, // never registered
      withdrawRequest: buildWithdrawRequest({
        accountWalletAddress: walletAddress.address,
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
    const ask = deposit.AskToTransfer.create({
      jettonAmount: toNano('5'),
      transferRecipient: tokenPool.address,
      sendExcessesTo: router.address,
      customPayload: null,
      forwardTonAmount: 0n,
      forwardPayload: Cell.EMPTY.beginParse(),
    })

    // The deposit account reports the bounced withdraw (as it does when its AskToTransfer
    // bounces back from the jetton wallet).
    const result = await router.sendDepositAccountWithdrawFailed(
      // The message must come from the sender's derived deposit account: the Router re-derives
      // the expected account address from the reported proxy.
      blockchain.sender(accountAddress),
      toNano('0.5'),
      {
        id: deposit.DepositAccountID.create({
          owner: router.address,
          proxy: sender.address,
          token,
        }),
        walletAddress: walletAddress.address,
        ask,
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

    // TODO: test the message sent to the sendExecutor
  })

  it('rejects a DepositAccount_WithdrawFailed from an address that is not the claimed deposit account', async () => {
    const attacker = await blockchain.treasury('attacker')
    const tokenPool = await blockchain.treasury('tokenPool')
    const walletAddress = await blockchain.treasury('accountWallet')
    const ask = deposit.AskToTransfer.create({
      jettonAmount: toNano('5'),
      transferRecipient: tokenPool.address,
      sendExcessesTo: router.address,
      customPayload: null,
      forwardTonAmount: 0n,
      forwardPayload: Cell.EMPTY.beginParse(),
    })

    // The attacker claims the withdraw failed for the sender's deposit account, but the message
    // does not come from the account address the Router derives from the reported proxy.
    const result = await router.sendDepositAccountWithdrawFailed(
      attacker.getSender(),
      toNano('0.5'),
      {
        id: deposit.DepositAccountID.create({
          owner: router.address,
          proxy: sender.address,
          token,
        }),
        walletAddress: walletAddress.address,
        ask,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: attacker.address,
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
