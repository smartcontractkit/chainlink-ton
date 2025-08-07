import { Address, Cell } from '@ton/core'
import { crc32 } from 'zlib'
import { MerkleRoot, PriceUpdates } from './OffRamp'

export const CCIP_COMMIT_REPORT_ACCEPTED_TOPIC = crc32('CCIPCommitReportAccepted')
export const CCIP_MESSAGE_SENT_TOPIC = crc32('CCIPMessageSent')

export enum LogTypes {
  CCIPMessageSent = CCIP_COMMIT_REPORT_ACCEPTED_TOPIC,
  CCIPCommitReportAccepted = CCIP_MESSAGE_SENT_TOPIC,
}

export type CCIPMessageSent = {
  destChainSelector: bigint
  sequenceNumber: bigint
  message: {
    header: {
      messageId: bigint
      destChainSelector: bigint
      sourceChainSelector: bigint
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
