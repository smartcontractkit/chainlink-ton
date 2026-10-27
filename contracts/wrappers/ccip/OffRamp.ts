import { Cell, toNano } from '@ton/core'
import { contractCode } from '../codeLoader'
import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'
import { Costs as RouterCosts } from './Router'
import { Costs as RegistryCosts } from './TokenAdminRegistry'

export const ARTIFACT_NAME = 'OffRamp'
export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<Cell>> = {
  '1.6.2': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME),
}
export const OFFRAMP_CONTRACT_VERSION = '1.7.0'

export const FACILITY_NAME = 'link.chain.ton.ccip.OffRamp'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const DEFAULT_MIN_GASLIMIT = toNano('0.025')
// LockRelease_LockBox needs LockReleaseTokenPool_OFF_RAMP_ACCOUNT_DEPLOY_VALUE
export const DEFAULT_MIN_TT_GASLIMIT = toNano('0.2')

/** Mirrors the receive-path cost functions in Tolk (OffRamp_Costs, MerkleRoot_Costs,
 * ReceiveExecutor_Costs, the Router receive costs): 5x the cost measured by the gas report for a
 * 2000-byte message. */
export const Costs = (() => {
  const executorDeployment = toNano('0.01')
  const merkleRootDeployment = toNano('0.01')
  const markState = toNano('0.0035')
  const notify = toNano('0.0035') + markState
  const confirmedOrBounced = toNano('0.003') + notify
  const receiveConfirmOrDeny = toNano('0.0035') + confirmedOrBounced
  const receiveConfirm = toNano('0.0025') + receiveConfirmOrDeny
  const routeMessage = toNano('0.0085') + receiveConfirm
  const dispatchValidated = toNano('0.01') + routeMessage
  const depositAccount = RouterCosts.depositAccountReserve + RouterCosts.depositAccountWalletQuery
  const releaseOrMint = toNano('0.004') + toNano('0.012') + toNano('0.01') + depositAccount
  const tokenTransferDelivered = toNano('0.012')
  const tokenTransfer =
    RegistryCosts.getTokenInfo +
    toNano('0.005') +
    releaseOrMint +
    toNano('0.0135') +
    tokenTransferDelivered
  const initExec = (hasTokens: boolean) =>
    toNano('0.0095') + (hasTokens ? tokenTransfer : 0n) + dispatchValidated
  const executeValidated = (hasTokens: boolean) =>
    toNano('0.0305') + executorDeployment + initExec(hasTokens)
  const validate = (hasTokens: boolean) => toNano('0.011') + executeValidated(hasTokens)
  /** CCIP-owned part of an execution; add the message's gasLimit and destGasAmount. */
  const execute = (hasTokens: boolean) => toNano('0.026') + validate(hasTokens)
  const updatePrices = toNano('0.03')
  return {
    executorDeployment,
    merkleRootDeployment,
    markState,
    notify,
    confirmedOrBounced,
    receiveConfirmOrDeny,
    receiveConfirm,
    routeMessage,
    dispatchValidated,
    releaseOrMint,
    tokenTransferDelivered,
    tokenTransfer,
    initExec,
    executeValidated,
    validate,
    execute,
    /** What the CCIP contracts spend of `execute`: without the reserves kept by the executor and
     * the deposit account and the registry query, which are budgeted elsewhere. */
    executeBudget: (hasTokens: boolean) =>
      execute(hasTokens) -
      executorDeployment -
      (hasTokens ? RegistryCosts.getTokenInfo + depositAccount : 0n),
    updatePrices,
    commit: (hasRoots: boolean, hasPriceUpdates: boolean) =>
      toNano('0.02') +
      (hasRoots ? toNano('0.0005') + merkleRootDeployment : 0n) +
      (hasPriceUpdates ? updatePrices : 0n),
  }
})()

/** Value to attach to an execution of `message`. */
export function executeValue(message: {
  gasLimit: bigint
  tokenAmounts: { destGasAmount: bigint }[] | null
}): bigint {
  const tokens = message.tokenAmounts ?? []
  return (
    Costs.execute(tokens.length > 0) +
    message.gasLimit +
    tokens.reduce((sum, t) => sum + t.destGasAmount, 0n)
  )
}

export const OFFRAMP_RELEASE_OR_MINT_COST = Costs.releaseOrMint
export const OFFRAMP_NOTIFY_COST = Costs.notify
