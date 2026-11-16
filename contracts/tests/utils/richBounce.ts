import * as c from '@ton/core'

// Rich bounce body (`RichBounceBody` in the Tolk stdlib, TL-B `new_bounce_body`), see global version
// 12 in https://github.com/ton-blockchain/ton/blob/master/doc/GlobalVersions.md. Neither @ton/core
// nor @ton/sandbox model it yet.

export const RICH_BOUNCE_PREFIX = 0xfffffffe

/** RichBounceBody.bouncedByPhase. Mirrors `RichBounce_Phase` (contracts/lib/tvm/bounce.tolk). */
export enum RichBouncePhase {
  /** The compute phase was skipped: `exitCode` is a `RichBounceComputeSkipReason`. */
  ComputeSkipped = 0,
  /** The compute phase failed: `exitCode` is the compute phase exit code. */
  ComputeFailed = 1,
  /** The action phase failed: `exitCode` is the action phase result code. */
  ActionFailed = 2,
}

/** RichBounceBody.exitCode when the compute phase was skipped. Mirrors `RichBounce_ComputeSkipReason`. */
export enum RichBounceComputeSkipReason {
  /** The account is uninit or frozen, and the message carries no state init. */
  NoState = -1,
  /** The account is uninit or frozen, and the message's state init does not match its hash. */
  BadState = -2,
  /** The message value cannot buy any gas. */
  NoGas = -3,
  /** The account is suspended. */
  Suspended = -4,
}

export type RichBounce = {
  /** Body of the message that bounced. */
  originalBody: c.Cell
  bouncedByPhase: RichBouncePhase
  exitCode: number
  /** Value of the message that bounced (`originalInfo.valueCoins`). */
  originalValue?: bigint
  /** Present unless the compute phase was skipped. */
  computePhase?: { gasUsed: number; vmSteps: number }
}

/** Builds the body of a rich bounce, as the network delivers it to the sender of the bounced message. */
export function buildRichBounceBody(bounce: RichBounce): c.Cell {
  const originalInfo = c
    .beginCell()
    .storeCoins(bounce.originalValue ?? 0n)
    .storeBit(0) // valueExtra: no extra currencies
    .storeUint(0, 64) // createdLt
    .storeUint(0, 32) // createdAt
  const b = c
    .beginCell()
    .storeUint(RICH_BOUNCE_PREFIX, 32)
    .storeRef(bounce.originalBody)
    .storeRef(originalInfo)
    .storeUint(bounce.bouncedByPhase, 8)
    .storeInt(bounce.exitCode, 32)
  if (bounce.bouncedByPhase === RichBouncePhase.ComputeSkipped) {
    return b.storeBit(0).endCell()
  }
  const computePhase = bounce.computePhase ?? { gasUsed: 0, vmSteps: 0 }
  return b
    .storeBit(1)
    .storeUint(computePhase.gasUsed, 32)
    .storeUint(computePhase.vmSteps, 32)
    .endCell()
}
