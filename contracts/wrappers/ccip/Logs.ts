import { Address, Cell } from '@ton/core'
import { crc32 } from 'zlib'
import { Any2TVMMessage, MerkleRoot, PriceUpdates, SourceChainConfig } from './OffRamp'
import { DestChainConfig } from './OnRamp'

export const COMMIT_REPORT_ACCEPTED_TOPIC = crc32('CommitReportAccepted')
export const CCIP_MESSAGE_SENT_TOPIC = crc32('CCIPMessageSent')
export const EXECUTION_STATE_CHANGED_TOPIC = crc32('ExecutionStateChanged')
export const SOURCE_CHAIN_SELECTOR_ADDED_TOPIC = crc32('SourceChainSelectorAdded')
export const SOURCE_CHAIN_CONFIG_UPDATED_TOPIC = crc32("SourceChainConfigUpdated");
export const DEST_CHAIN_CONFIG_SET_TOPIC = crc32("DestChainConfigSet");



export enum LogTypes {
  CCIPMessageSent = CCIP_MESSAGE_SENT_TOPIC,
  CCIPCommitReportAccepted = COMMIT_REPORT_ACCEPTED_TOPIC,
  ExecutionStateChanged = EXECUTION_STATE_CHANGED_TOPIC,
  SourceChainSelectorAdded = SOURCE_CHAIN_SELECTOR_ADDED_TOPIC,
  SourceChainConfigUpdated = SOURCE_CHAIN_CONFIG_UPDATED_TOPIC,
  DestChainConfigSet = DEST_CHAIN_CONFIG_SET_TOPIC
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

export type DestChainConfigSet = {
  destChainSelector: bigint //64
  config: DestChainConfig
}
