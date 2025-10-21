import { Address, Cell } from '@ton/core'
import { crc32 } from 'zlib'
import { Any2TVMMessage, MerkleRoot, PriceUpdates, SourceChainConfig } from './OffRamp'
import { DestChainConfig } from './OnRamp'

export const LogTypes = {
  CCIPMessageSent: 'CCIPMessageSent',
  CommitReportAccepted: 'CommitReportAccepted',
  ExecutionStateChanged: 'ExecutionStateChanged',
  SourceChainSelectorAdded: 'SourceChainSelectorAdded',
  SourceChainConfigUpdated: 'SourceChainConfigUpdated',
  DestChainSelectorAdded: 'DestChainSelectorAdded',
  DestChainConfigUpdated: 'DestChainConfigUpdated',
  ReceiverCCIPMessageReceived: 'Receiver_CCIPMessageReceived',
} as const

export type CombinedLogType = (typeof LogTypes)[keyof typeof LogTypes]

export const LOG_TOPIC: Record<CombinedLogType, number> = {
  CCIPMessageSent: crc32('CCIPMessageSent'),
  CommitReportAccepted: crc32('CommitReportAccepted'),
  ExecutionStateChanged: crc32('ExecutionStateChanged'),
  SourceChainSelectorAdded: crc32('SourceChainSelectorAdded'),
  SourceChainConfigUpdated: crc32('SourceChainConfigUpdated'),
  DestChainSelectorAdded: crc32('DestChainSelectorAdded'),
  DestChainConfigUpdated: crc32('DestChainConfigUpdated'),
  Receiver_CCIPMessageReceived: crc32('Receiver_CCIPMessageReceived'),
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

export type CommitReportAccepted = {
  merkleRoot?: MerkleRoot
  priceUpdates?: PriceUpdates
}

export type ExecutionStateChanged = {
  sourceChainSelector: bigint //64
  sequenceNumber: bigint //64
  messageId: bigint //256
  state: bigint //8
}

export type SourceChainSelectorAdded = {
  sourceChainSelector: bigint //64
}

export type SourceChainConfigUpdated = {
  sourceChainSelector: bigint //64
  config: SourceChainConfig
}

export type DestChainSelectorAdded = {
  destChainSelector: bigint //64
}

export type DestChainConfigUpdated = {
  destChainSelector: bigint //64
  config: DestChainConfig
}

export type ReceiverCCIPMessageReceived = {
  message: Any2TVMMessage
}
