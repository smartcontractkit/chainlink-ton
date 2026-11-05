import { toNano } from '@ton/core'
import { Costs } from '../../../wrappers/ccip/Router'
import { Costs as RegistryCosts } from '../../../wrappers/ccip/TokenAdminRegistry'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import type { PoolKind } from './tokens/pools'
import { BalanceRule } from '../utils'

// The SendExecutor is an ephemeral value courier: it holds the incoming value between hops
// and returns everything to the OnRamp with CARRY_ALL_BALANCE, so its flow-net balance change
// is exactly 0. Per-hop swings scale with the payload, so the rules bound them loosely and the
// flow-level delta-vs-retained check pins the net to zero.
export const onRampRetains = (() => {
  const executor = (() => {
    // The executor exits returning all held balance to the OnRamp.
    const drain: BalanceRule = {
      contract: 'SendExecutor',
      op: 'OnRamp_ExecutorFeeReserved',
      kind: 'drain',
    }
    const init: BalanceRule = {
      contract: 'SendExecutor',
      op: 'Deployable.initializeAndSend',
      kind: 'sendExact',
      value: Costs.executorExecute,
      payForwardFromBalance: true,
    }
    const messageValidated: BalanceRule = {
      contract: 'SendExecutor',
      op: 'FeeQuoter_MessageValidated',
      kind: 'deltaExact',
      delta(ctx): bigint {
        const msg = fq.FeeQuoter_MessageValidated.fromSlice(ctx.current.tx.body!.beginParse())
        return (
          ctx.current.tx.value! - // value the executor received (the fee overpayment it holds)
          (msg.fee.feeTokenAmount + toNano('0.0015')) - // the reserve message it forwards
          ctx.current.computeFee -
          ctx.current.forwardFee
        )
      },
    }
    // The happy send flow: init, fee validation, fee reservation and drain.
    const successful: BalanceRule[] = [init, messageValidated, drain]
    // The rejected flow drains the executor via MessageValidationFailed instead of the fee
    // reservation, so the negative swing carries a different op.
    const rejected: BalanceRule[] = [
      init,
      {
        contract: 'SendExecutor',
        op: 'FeeQuoter_MessageValidationFailed',
        kind: 'drain', // The executor exits returning all held balance to the OnRamp
      },
    ]

    return { init, messageValidated, drain, successful, rejected }
  })()

  // Jetton wallets keep a 5-year storage reserve on every transfer step
  // (calculateJettonWalletMinStorageFee). Optional: the reserve is only kept on the transfer
  // that deploys the wallet — later transfers are pass-throughs, so the constraint goes
  // unexercised on every flow but the first.
  const jettonWalletStorageReserve = (wallet: string): BalanceRule => ({
    contract: wallet,
    op: 'InternalTransferStep',
    kind: 'deltaRange',
    min: 0n,
    max: toNano('0.01'),
    optional: true,
  })

  // Token-send flows: the executor additionally queries the registry and drives the pool's
  // lock-or-burn. The OnRamp account and the Router net 0 in send flows (the account's
  // withdraw drains it, the Router's excesses go to the sender). LockRelease pools route the
  // custody through a lockbox (an extra jetton wallet hop); BurnMint pools burn directly.
  const tokenSend = (() => {
    // The executor path up to the registry reply: init, fee validation, fee reservation
    // (paying the registry query from the balance) and the lock-or-burn request (carrying
    // the relays, the registry-reported admission and the finalization).
    const upToTokenInfo: BalanceRule[] = [
      executor.init,
      executor.messageValidated,
      {
        contract: 'SendExecutor',
        op: 'OnRamp_ExecutorFeeReserved',
        kind: 'sendExact',
        value: RegistryCosts.getTokenInfo,
        payForwardFromBalance: true,
      },
      {
        contract: 'SendExecutor',
        op: 'TokenAdminRegistry_TokenInfo',
        kind: 'sendExact',
        payForwardFromBalance: true,
        value(ctx): bigint {
          const msg = tar.TokenAdminRegistry_TokenInfo.fromSlice(ctx.current.tx.body!.beginParse())
          return (
            Costs.executorRequestsLockOrBurnWithoutDefaultPoolAdmission +
            msg.poolInfo!.admission.lockOrBurn
          )
        },
      },
    ]
    // The happy token send: the pool's finished reply drains the executor back to the OnRamp.
    // The custody withdraw is a pass-through (the executor forwards the whole attach). The
    // jetton wallets' storage reserve rule is optional: it is only exercised on the first send
    // (the transfer that deploys them). LockRelease pools route the custody through a lockbox
    // (an extra jetton wallet hop); BurnMint pools burn directly.
    const successful = (kind: PoolKind): BalanceRule[] => [
      ...upToTokenInfo,
      jettonWalletStorageReserve('PoolWallet'),
      ...(kind === 'LockRelease' ? [jettonWalletStorageReserve('LockBoxWallet')] : []),
      {
        contract: 'SendExecutor',
        op: 'TokenPool_LockOrBurnFinished',
        kind: 'drain', // The executor exits returning all held balance to the OnRamp
      },
    ]
    // The pool-rejected flow: the pool's relay bounces, the executor drains via
    // TokenPoolLockOrBurnFailed and the OnRamp finishes with error; the withdraw hops are
    // gone.
    const poolRejected: BalanceRule[] = [
      ...upToTokenInfo,
      {
        contract: 'SendExecutor',
        op: 'Router_TokenPoolLockOrBurnFailed',
        kind: 'drain', // The executor exits returning all held balance to the OnRamp
      },
    ]
    // The withdraw-failed flow: the withdraw bounces after admission, so the executor holds the
    // custody value until the Router reports WithdrawFailed and it drains; the pool and
    // message-sent hops are gone. The withdraw hop itself is a pass-through (the bounce returns
    // its value), so it needs no rule.
    const withdrawFailed: BalanceRule[] = [
      ...upToTokenInfo,
      {
        contract: 'SendExecutor',
        op: 'Router_TokenPoolLockOrBurnFailed',
        kind: 'drain', // The executor exits returning all held balance to the OnRamp
      },
    ]

    return { upToTokenInfo, successful, poolRejected, withdrawFailed }
  })()

  // The Get OnRamp Account flow: the account is deployed with its storage reserve, the init
  // keeps the reserve top-up and the wallet-address reply returns the query's unused value.
  const getAccount: BalanceRule[] = [
    {
      contract: 'OnRampAccount',
      op: 'Deployable.initialize',
      kind: 'keep',
    },
    {
      contract: 'OnRampAccount',
      op: 'DepositAccount_Init',
      kind: 'sendExact',
      value: Costs.depositAccountWalletQuery, // the TEP-89 wallet query
      payForwardFromBalance: true,
    },
    {
      contract: 'OnRampAccount',
      op: 'ResponseWalletAddress',
      kind: 'balanceExact',
      value: Costs.depositAccountReserve,
    },
  ]

  // The Token Deposit flow: the sender's wallet transfers jettons to the OnRamp account's
  // wallet, which keeps its 5-year storage reserve.
  const deposit: BalanceRule[] = [jettonWalletStorageReserve('OnRampAccountWallet')]

  return { executor, tokenSend, getAccount, deposit, jettonWalletStorageReserve }
})()
