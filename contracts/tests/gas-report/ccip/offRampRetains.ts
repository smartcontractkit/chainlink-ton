import { toNano } from '@ton/core'
import { Costs } from '../../../wrappers/ccip/OffRamp'
import { Costs as RegistryCosts } from '../../../wrappers/ccip/TokenAdminRegistry'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import { onRampRetains } from './onRampRetains'
import type { PoolKind } from './tokens/pools'
import { BalanceRule } from '../utils'

export const offRampRetains = (() => {
  const receiveExecutorInit: BalanceRule = {
    contract: 'ReceiveExecutor',
    op: 'Deployable.initialize',
    kind: 'keep',
  }
  const messageDispatch: BalanceRule[] = [
    {
      contract: 'ReceiveExecutor',
      op: 'empty',
      kind: 'keep',
    },
  ]
  const CCIPReceive: BalanceRule[] = [
    {
      contract: 'ReceiveExecutor',
      op: 'ReceiveExecutor_InitExecute',
      kind: 'sendExact',
      payForwardFromBalance: true,
      value(ctx): bigint {
        const msg = rx.ReceiveExecutor_InitExecute.fromSlice(ctx.current.tx.body!.beginParse())
        return Costs.dispatchValidated + msg.effectiveGasLimit
      },
    },
    ...messageDispatch,
  ]

  const CCIPReceiveConfirm: BalanceRule[] = [
    {
      contract: 'ReceiveExecutor',
      op: 'ReceiveExecutor_CCIPReceiveConfirm',
      kind: 'drain',
    },
  ]
  const successfulExecute: BalanceRule[] = [
    {
      contract: 'MerkleRoot',
      op: 'MerkleRoot_MarkState',
      kind: 'drain',
    },
    {
      // The frozen root returns its own remaining balance to the OffRamp (after the excess refund).
      contract: 'OffRamp',
      op: 'empty',
      from: 'MerkleRoot',
      kind: 'keep',
    },
  ]
  const successful: BalanceRule[] = [
    receiveExecutorInit,
    ...CCIPReceive,
    ...CCIPReceiveConfirm,
    ...successfulExecute,
  ]

  const commit: BalanceRule[] = [
    {
      // Deployed with DEPLOYABLE_INIT_VALUE; sends nothing, keeps the attach minus its init
      // compute.
      contract: 'MerkleRoot',
      op: 'Deployable.initialize',
      kind: 'keep',
    },
  ]

  // A mark that does not complete the root (more messages pending, or the state is Failure) needs
  // no rule: the root returns the carried excesses to the OffRamp (OffRamp_ReturnExecuteExcess),
  // which refunds the caller, so neither balance changes.
  // Execute of a root deployed by an earlier commit: the mark does not complete the root (64
  // messages, one executed), so the root returns the excesses for refunding. No trailing empty hop.
  const reusedRoot: BalanceRule[] = [receiveExecutorInit, ...CCIPReceive, ...CCIPReceiveConfirm]
  // The bounce path: the receiver rejects, the Router's relay bounces back to the Router
  // (simple bounce: the Router→Receiver message uses the default `bounce: true`), which passes
  // the bounced remainder on to the OffRamp (mode 64), which forwards it to the executor. The
  // executor drains via CCIPReceiveFailed while the OffRamp notifies failure. The confirm phase
  // never runs, but the root is still marked (returning the excesses for refunding).
  const rejected: BalanceRule[] = [
    receiveExecutorInit,
    ...CCIPReceive,
    // OffRamp_NotifyFailure needs no rule: it reserves its balance and carries the rest to the root.
    {
      contract: 'ReceiveExecutor',
      op: 'ReceiveExecutor_CCIPReceiveFailed',
      kind: 'balanceExact',
      value: Costs.executorDeployment,
    },
  ]

  // Token-transfer flows. The executor holds gas/value mid-flow and drains itself on confirm;
  // the OffRamp and Router are mode-64 pass-throughs (the Router returns its unused handling
  // budget to the executor via the OffRamp); the receiver account keeps its storage reserve.
  // BurnMint keeps the mint's leftover admission budget (TODO[VALUE] NONEVM-5766); LockRelease
  // nets 0. All are bounded, not exact, since swings scale with the payload. The gasLimit-0
  // path may leave the OffRamp slightly negative: the executor's CARRY_ALL_BALANCE drain
  // under-covers its costs (no receiver execution funds it).
  const tokenExecute = (() => {
    // -- Validate phase: execute request, proof validation, executor deployment.
    const validate: BalanceRule[] = [
      receiveExecutorInit,
      {
        contract: 'ReceiveExecutor',
        op: 'ReceiveExecutor_InitExecute',
        kind: 'sendExact',
        payForwardFromBalance: true,
        value: RegistryCosts.getTokenInfo,
      },
      {
        contract: 'ReceiveExecutor',
        op: 'TokenAdminRegistry_TokenInfo',
        kind: 'sendExact',
        payForwardFromBalance: true,
        value(ctx): bigint {
          const msg = rx.ReceiveExecutor_InitExecute.fromSlice(
            ctx.hop('ReceiveExecutor_InitExecute').tx.body!.beginParse(),
          )
          return msg.tokenTransfer!.transfer.destGasAmount + Costs.releaseOrMint
        },
      },
    ]

    // -- Release phase: the pool releases the tokens towards the receiver account. The Router
    // initializes the receiver's deposit account on the way; the init outcome differs between
    // the first transfer (deploys the account) and later ones (init fails and bounces back).
    // LockRelease pools route the custody through the lockbox as a pure pass-through (the hop
    // never changes balance, so it needs no rule); BurnMint pools mint directly and keep the
    // mint attach until the finalized reply.
    const release = (kind: PoolKind): BalanceRule[] =>
      kind === 'BurnMint'
        ? [
            {
              contract: 'BurnMintPool',
              op: 'TokenPool_ReleaseOrMint',
              kind: 'deltaRange',
              min: toNano('0.1'),
              max: toNano('0.2'),
            },
          ]
        : []
    // The account already exists: the init fails and bounces back to the Router. The Router
    // has no bounce handler for it, so it keeps the bounced value.
    const releaseExistingAccount: BalanceRule = {
      contract: 'Router',
      bounce: 'rich',
      op: 'Deployable.initialize',
      kind: 'keep',
    }
    // The first transfer deploys the receiver account: the init succeeds, the Router gets the
    // Initialized notice, and the account returns the wallet-address query's unused value.
    const releaseNewAccount: BalanceRule[] = onRampRetains.getAccount.map((rule) => ({
      ...rule,
      contract: 'ReceiverAccount',
    }))

    // -- Release tail: the tokens reached the receiver account; the excess TON returns to the
    // OffRamp (the jetton wallets' passive excess and the pool's finalization reply, forwarded
    // mode-64 by the executor).
    const releaseOrMintExcessBack: BalanceRule[] = [
      {
        contract: 'OffRamp',
        op: 'ReturnExcessesBack',
        kind: 'keep',
      },
      {
        contract: 'OffRamp',
        op: 'empty',
        from: 'ReceiveExecutor',
        kind: 'keep',
      },
    ]
    // The executor's per-flow rule (forward + hold custody, or finalize with the whole balance
    // when there is no gas limit) is appended by the composition.
    const releaseTailNoMessage: BalanceRule[] = [
      // Optional: the receiver account's jetton wallet only keeps its storage reserve on the
      // first transfer (the one that deploys it).
      onRampRetains.jettonWalletStorageReserve('ReceiverAccountWallet'),
      ...releaseOrMintExcessBack,
    ]

    // -- Delivery phase: the OffRamp routes the message to the receiver. The executor's
    // notification hop is covered by receiveExecutorForwardsNotification below.
    const delivery: BalanceRule[] = [...messageDispatch]
    // The executor reports the delivery (fixed value) and dispatches the message (fixed value
    // plus the gas limit), both paid from its balance; it drains later, on confirm.
    const receiveExecutorForwardsNotification: BalanceRule = {
      contract: 'ReceiveExecutor',
      op: 'DepositAccount_ForwardNotification',
      kind: 'sendExact',
      payForwardFromBalance: true,
      value(ctx): bigint {
        const initMsg = rx.ReceiveExecutor_InitExecute.fromSlice(
          ctx.hop('ReceiveExecutor_InitExecute').tx.body!.beginParse(),
        )
        const dispatchValidatedValue = Costs.dispatchValidated + initMsg.effectiveGasLimit
        return Costs.tokenTransferDelivered + dispatchValidatedValue
      },
    }
    // With no gas limit and no data the executor never routes to the receiver: the delivery
    // notification finalizes execution (endExecutionSuccessfully), sending its whole balance
    // to the OffRamp.
    const receiveExecutorExitsNoMessage: BalanceRule = {
      contract: 'ReceiveExecutor',
      op: 'DepositAccount_ForwardNotification',
      kind: 'drain',
    }

    // The happy path runs every phase; the account already exists.
    const successful = (kind: PoolKind): BalanceRule[] => [
      ...validate,
      ...release(kind),
      releaseExistingAccount,
      ...releaseTailNoMessage,
      receiveExecutorForwardsNotification,
      ...delivery,
      ...CCIPReceiveConfirm,
      ...successfulExecute,
    ]
    // The first-transfer flow deploys the receiver account (and its jetton wallet, which keeps
    // its storage reserve), so its init succeeds instead of bouncing back to the Router.
    const newAccount = (kind: PoolKind): BalanceRule[] => [
      ...validate,
      ...release(kind),
      ...releaseNewAccount,
      ...releaseTailNoMessage,
      receiveExecutorForwardsNotification,
      ...delivery,
      ...CCIPReceiveConfirm,
      ...successfulExecute,
    ]
    // The gasLimit-0 flow: no receiver execution, so the delivery/confirm phases are gone. The
    // delivery notification finalizes execution instead (the executor drains via
    // endExecutionSuccessfully), and the OffRamp still notifies success and marks the root
    // (which completes and freezes, draining via the trailing empty hop). The pool's
    // finalization reply still passes through the executor to the OffRamp.
    const gasLimitZero = (kind: PoolKind): BalanceRule[] => [
      ...validate,
      ...release(kind),
      releaseExistingAccount,
      ...releaseTailNoMessage,
      receiveExecutorExitsNoMessage,
      ...successfulExecute,
    ]
    // The pool-rejected flow: the pool's relay bounces (the ReleaseOrMint hop aborts, so it is
    // exempt), the executor drains via ReleaseOrMintFailed and the OffRamp notifies failure;
    // the tokens never moved, so the release tail, delivery and confirm phases never run. The
    // root is still marked (returning the excesses for refunding).
    const poolRejected: BalanceRule[] = [
      ...validate,
      releaseExistingAccount,
      {
        contract: 'ReceiveExecutor',
        op: 'ReceiveExecutor_ReleaseOrMintFailed',
        kind: 'balanceExact',
        value: Costs.executorDeployment,
      },
    ]

    return {
      validate,
      release,
      releaseExistingAccount,
      releaseNewAccount,
      releaseOrMintExcessBack,
      releaseTailNoMessage,
      delivery,
      receiveExecutorForwardsNotification,
      receiveExecutorExitsNoMessage,
      successful,
      newAccount,
      gasLimitZero,
      poolRejected,
    }
  })()

  return {
    commit,
    execute: {
      receiveExecutorInit,
      CCIPReceive,
      CCIPReceiveConfirm,
      successfulExecute,
      reusedRoot,
      messageDispatch,
      rejected,
      successful,
    },
    tokenExecute,
  }
})()
