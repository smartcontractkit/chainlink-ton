import { Address } from '@ton/core'
import { crc32 } from 'zlib'
import { Any2TVMMessage, MerkleRoot, PriceUpdates, SourceChainConfig } from './OffRamp'
import { DestChainConfig } from './OnRamp'

export const LogTypes = {
  CCIPMessageSent: 'CCIPMessageSent',
  CommitReportAccepted: 'CommitReportAccepted',
  ExecutionStateChanged: 'ExecutionStateChanged',
  SourceChainSelectorAdded: 'SourceChainSelectorAdded',
  SourceChainConfigUpdated: 'SourceChainConfigUpdated',
  DynamicConfigSet: 'DynamicConfigSet',
  DestChainSelectorAdded: 'DestChainSelectorAdded',
  DestChainConfigUpdated: 'DestChainConfigUpdated',
  ReceiverCCIPMessageReceived: 'Receiver_CCIPMessageReceived',
  OnRampSet: `OnRampSet`,
  OffRampAdded: `OffRampAdded`,
  OffRampRemoved: `OffRampRemoved`,
  Cursed: 'Cursed',
  Uncursed: 'Uncursed',
  UsdPerTokenUpdated: 'UsdPerTokenUpdated',
  UsdPerUnitGasUpdated: 'UsdPerUnitGasUpdated',
  ReceiveExecutorInitExecuteBounced: 'ReceiveExecutorInitExecuteBounced',
  DeployableInitializeBounced: 'DeployableInitializeBounced',
  RouteMessageBounced: 'RouteMessageBounced',
  MessageToOffRampBounced: 'MessageToOffRampBounced',
} as const

export type CombinedLogType = (typeof LogTypes)[keyof typeof LogTypes]

export const LOG_TOPIC: Record<CombinedLogType, number> = {
  CCIPMessageSent: crc32('CCIPMessageSent'),
  CommitReportAccepted: crc32('CommitReportAccepted'),
  ExecutionStateChanged: crc32('ExecutionStateChanged'),
  SourceChainSelectorAdded: crc32('SourceChainSelectorAdded'),
  SourceChainConfigUpdated: crc32('SourceChainConfigUpdated'),
  DynamicConfigSet: crc32('DynamicConfigSet'),
  DestChainSelectorAdded: crc32('DestChainSelectorAdded'),
  DestChainConfigUpdated: crc32('DestChainConfigUpdated'),
  Receiver_CCIPMessageReceived: crc32('Receiver_CCIPMessageReceived'),
  OnRampSet: crc32('OnRampSet'),
  OffRampAdded: crc32('OffRampAdded'),
  OffRampRemoved: crc32('OffRampRemoved'),
  Cursed: crc32('Cursed'),
  Uncursed: crc32('Uncursed'),
  UsdPerTokenUpdated: crc32('UsdPerTokenUpdated'),
  UsdPerUnitGasUpdated: crc32('UsdPerUnitGasUpdated'),
  ReceiveExecutorInitExecuteBounced: crc32('ReceiveExecutorInitExecuteBounced'),
  DeployableInitializeBounced: crc32('DeployableInitializeBounced'),
  RouteMessageBounced: crc32('RouteMessageBounced'),
  MessageToOffRampBounced: crc32('MessageToOffRampBounced'),
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

export type OnRampSet = {
  destChainSelectors: bigint[]
  onRamp?: Address
}

export type OffRampAdded = {
  sourceChainSelectors: bigint[]
  offRampAdded: Address
}

export type OffRampRemoved = {
  sourceChainSelectors: bigint[]
  offRampRemoved: Address
}

export type Cursed = {
  subject: bigint
}

export type Uncursed = {
  subject: bigint
}

export type UsdPerTokenUpdated = {
  sourceToken: Address
  usdPerToken: bigint // uint224
  timestamp: bigint // uint64
}

export type UsdPerUnitGasUpdated = {
  destChainSelector: bigint // uint64
  executionGasPrice: bigint // uint112
  dataAvailabilityGasPrice: bigint // uint112
  timestamp: bigint // uint64
}

export type ReceiveExecutorInitExecuteBounced = {
  receiveExecutor: Address
  root: Address
  sequenceNumber: bigint
}

export type DeployableInitializeBounced = {
  deployableAddress: Address
}

export type RouteMessageBounced = {
  router: Address
  execId: bigint
}

export type MessageToOffRampBounced = {
  offRamp: Address
  execId: bigint
}
