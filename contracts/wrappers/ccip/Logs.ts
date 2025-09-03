import { Address, Cell } from '@ton/core'
import { crc32 } from 'zlib'
import { Any2TVMMessage, MerkleRoot, PriceUpdates } from './OffRamp'

export const CCIP_COMMIT_REPORT_ACCEPTED_TOPIC = crc32('CCIPCommitReportAccepted')
export const CCIP_MESSAGE_SENT_TOPIC = crc32('CCIPMessageSent')
export const CCIP_EXECUTION_STATE_CHANGED_TOPIC = crc32('CCIPExecutionStateChanged')

export enum LogTypes {
  CCIPMessageSent = CCIP_MESSAGE_SENT_TOPIC,
  CCIPCommitReportAccepted = CCIP_COMMIT_REPORT_ACCEPTED_TOPIC,
  CCIPExecutionStateChanged = CCIP_EXECUTION_STATE_CHANGED_TOPIC,
}

export type CCIPMessageSent = {
  message: {
    header: {
      messageId: bigint
      sourceChainSelector: bigint
      destChainSelector: bigint
      sequenceNumber: bigint
      nonce: bigint
    }
    sender: Address
    receiver: Cell
    data: Cell
    extraArgs: Cell
    tokenAmounts: Cell // TODO: further parse all the fields
    feeToken: Address
    feeTokenAmount: bigint
    feeValueJuels: bigint
  }
}

export type CCIPCommitReportAccepted = {
  priceUpdates?: PriceUpdates
  merkleRoots: MerkleRoot[]
}

export type CCIPExecutionStateChanged = {
  sourceChainSelector: bigint //64
  sequenceNumber: bigint //64
  messageId: bigint //256
  state: bigint //8
}
