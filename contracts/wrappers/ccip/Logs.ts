import { crc32 } from 'zlib'
import * as of from '../gen/ccip/OffRamp'

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

export type ReceiverCCIPMessageReceived = {
  message: of.Any2TVMMessage
}
