import { Address, beginCell, Cell, Message } from '@ton/core'
import { BlockchainTransaction } from '@ton/sandbox'
import * as CCIPLogs from '../wrappers/ccip/Logs'
import * as OCR3Logs from '../wrappers/libraries/ocr/Logs'
import { fromSnakeData } from '../src/utils/types'
import { prettifyAddressesMap } from './utils/prettyPrint'
import { crc32 } from 'zlib'
import * as rt from '../wrappers/gen/ccip/Router'
import * as on from '../wrappers/gen/ccip/OnRamp'
import * as of from '../wrappers/gen/ccip/OffRamp'
import * as fq from '../wrappers/gen/ccip/FeeQuoter'
import { Decoder } from '../src/utils/codec'

// https://github.com/ton-blockchain/liquid-staking-contract/blob/1f4e9badbed52a4cf80cc58e4bb36ed375c6c8e7/utils.ts#L269-L294
export const getExternals = (transactions: BlockchainTransaction[]) => {
  const externals: Message[] = []
  return transactions.reduce((all, curExt) => [...all, ...curExt.externals], externals)
}

export const testLog = (
  actual: Message,
  from: Address,
  topic: string,
  matcher?: (body: Cell) => boolean,
) => {
  if (actual.info.type !== 'external-out') {
    console.log('Wrong from')
    return false
  }
  if (!actual.info.src.equals(from)) return false
  if (!actual.info.dest) return false
  if (actual.info.dest!.value !== BigInt(crc32(topic))) return false
  if (matcher !== undefined) {
    if (!actual.body) console.log('No body')
    return matcher(actual.body)
  }
  return true
}

export const expectSuccessfulTransaction = (result: any, from: Address, to: Address) => {
  expect(result.transactions).toHaveTransaction({ from, to, success: true })
}

export const expectFailedTransaction = (
  result: any,
  from: Address,
  to: Address,
  exitCode: number,
) => {
  expect(result.transactions).toHaveTransaction({ from, to, exitCode, success: false })
}

type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>
}

// map from log type → expected payload type
type LogTypeMap = {
  [CCIPLogs.LogTypes.CCIPMessageSent]: DeepPartial<on.CCIPMessageSent>
  [CCIPLogs.LogTypes.CommitReportAccepted]: DeepPartial<of.CommitReportAccepted>
  [CCIPLogs.LogTypes.ExecutionStateChanged]: DeepPartial<of.ExecutionStateChanged>
  [CCIPLogs.LogTypes.SourceChainSelectorAdded]: DeepPartial<of.SourceChainSelectorAdded>
  [CCIPLogs.LogTypes.SourceChainConfigUpdated]: DeepPartial<of.SourceChainConfigUpdated>
  [CCIPLogs.LogTypes.DestChainSelectorAdded]: DeepPartial<on.DestChainSelectorAdded>
  [CCIPLogs.LogTypes.DestChainConfigUpdated]: DeepPartial<on.DestChainConfigUpdated>
  [OCR3Logs.LogTypes.OCR3BaseConfigSet]: OCR3Logs.OCR3BaseConfigSet
  [OCR3Logs.LogTypes.OCR3BaseTransmitted]: DeepPartial<OCR3Logs.OCR3BaseTransmitted>
  [CCIPLogs.LogTypes.ReceiverCCIPMessageReceived]: CCIPLogs.ReceiverCCIPMessageReceived
  [CCIPLogs.LogTypes.OnRampSet]: DeepPartial<rt.OnRampSet>
  [CCIPLogs.LogTypes.OffRampAdded]: DeepPartial<rt.OffRampAdded>
  [CCIPLogs.LogTypes.OffRampRemoved]: DeepPartial<rt.OffRampRemoved>
  [CCIPLogs.LogTypes.Cursed]: DeepPartial<rt.Cursed>
  [CCIPLogs.LogTypes.Uncursed]: DeepPartial<rt.Uncursed>
  [CCIPLogs.LogTypes.UsdPerTokenUpdated]: DeepPartial<fq.UsdPerTokenUpdated>
  [CCIPLogs.LogTypes.UsdPerUnitGasUpdated]: DeepPartial<fq.UsdPerUnitGasUpdated>
  [CCIPLogs.LogTypes
    .ReceiveExecutorInitExecuteBounced]: DeepPartial<of.OffRamp_ReceiveExecutorInitExecuteBounced>
  [CCIPLogs.LogTypes
    .DeployableInitializeBounced]: DeepPartial<of.OffRamp_DeployableInitializeBounced>
  [CCIPLogs.LogTypes.RouteMessageBounced]: DeepPartial<of.OffRamp_RouteMessageBounced>
  [CCIPLogs.LogTypes.MessageToOffRampBounced]: DeepPartial<rt.MessageToOffRampBounced>
}

// union of the keys of that map
type CombinedLogType = keyof LogTypeMap

type LogMatch<T extends CombinedLogType> = LogTypeMap[T]

// Strongly-typed handler map
type Handler<T extends CombinedLogType> = (
  actual: Message,
  from: Address,
  expected: LogTypeMap[T],
  addressesMap: Map<string, string>,
) => boolean

const handlers: { [K in CombinedLogType]: Handler<K> } = {
  [CCIPLogs.LogTypes.CCIPMessageSent]: (actual, from, expected, addressesMap) =>
    testLogCCIPMessageSent(actual, from, expected as DeepPartial<on.CCIPMessageSent>, addressesMap),

  [CCIPLogs.LogTypes.CommitReportAccepted]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.CommitReportAccepted,
      expected as DeepPartial<of.CommitReportAccepted>,
      of.CommitReportAccepted,
    ),

  [CCIPLogs.LogTypes.ExecutionStateChanged]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.ExecutionStateChanged,
      expected,
      of.ExecutionStateChanged,
    ),

  [CCIPLogs.LogTypes.SourceChainSelectorAdded]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.SourceChainSelectorAdded,
      expected,
      of.SourceChainSelectorAdded,
    ),

  [CCIPLogs.LogTypes.SourceChainConfigUpdated]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.SourceChainConfigUpdated,
      expected as DeepPartial<of.SourceChainConfigUpdated>,
      of.SourceChainConfigUpdated,
    ),

  [CCIPLogs.LogTypes.DestChainSelectorAdded]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.DestChainSelectorAdded,
      expected,
      on.DestChainSelectorAdded,
    ),

  [CCIPLogs.LogTypes.DestChainConfigUpdated]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.DestChainConfigUpdated,
      expected,
      on.DestChainConfigUpdated,
    ),

  [CCIPLogs.LogTypes.ReceiverCCIPMessageReceived]: (actual, from, expected) =>
    testLogReceiverCCIPMessageReceived(
      actual,
      from,
      expected as CCIPLogs.ReceiverCCIPMessageReceived,
    ),

  [OCR3Logs.LogTypes.OCR3BaseConfigSet]: (actual, from, expected) =>
    testConfigSetLogMessage(actual, from, expected as OCR3Logs.OCR3BaseConfigSet),

  [OCR3Logs.LogTypes.OCR3BaseTransmitted]: (actual, from, expected) =>
    testTransmittedLogMessage(actual, from, expected as Partial<OCR3Logs.OCR3BaseTransmitted>),

  [CCIPLogs.LogTypes.OnRampSet]: (actual, from, expected) =>
    testLogGen(actual, from, CCIPLogs.LogTypes.OnRampSet, expected, rt.OnRampSet),

  [CCIPLogs.LogTypes.OffRampAdded]: (actual, from, expected) =>
    testLogRampUpdate(actual, from, CCIPLogs.LogTypes.OffRampAdded, expected, 'offRampAdded'),

  [CCIPLogs.LogTypes.OffRampRemoved]: (actual, from, expected) =>
    testLogRampUpdate(actual, from, CCIPLogs.LogTypes.OffRampRemoved, expected, 'offRampRemoved'),

  [CCIPLogs.LogTypes.Cursed]: (actual, from, expected) =>
    testLogGen(actual, from, CCIPLogs.LogTypes.Cursed, expected, rt.Cursed),

  [CCIPLogs.LogTypes.Uncursed]: (actual, from, expected) =>
    testLogGen(actual, from, CCIPLogs.LogTypes.Uncursed, expected, rt.Uncursed),

  [CCIPLogs.LogTypes.UsdPerTokenUpdated]: (actual, from, expected) =>
    testLogGen(actual, from, CCIPLogs.LogTypes.UsdPerTokenUpdated, expected, fq.UsdPerTokenUpdated),

  [CCIPLogs.LogTypes.UsdPerUnitGasUpdated]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.UsdPerUnitGasUpdated,
      expected,
      fq.UsdPerUnitGasUpdated,
    ),
  [CCIPLogs.LogTypes.ReceiveExecutorInitExecuteBounced]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.ReceiveExecutorInitExecuteBounced,
      expected,
      of.OffRamp_ReceiveExecutorInitExecuteBounced,
    ),

  [CCIPLogs.LogTypes.DeployableInitializeBounced]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.DeployableInitializeBounced,
      expected,
      of.OffRamp_DeployableInitializeBounced,
    ),

  [CCIPLogs.LogTypes.RouteMessageBounced]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.RouteMessageBounced,
      expected,
      of.OffRamp_RouteMessageBounced,
    ),

  [CCIPLogs.LogTypes.MessageToOffRampBounced]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.MessageToOffRampBounced,
      expected,
      rt.MessageToOffRampBounced,
    ),
}

// testLogGen is a helper function to test logs that can be decoded using a decoder from a wrapper
function testLogGen<T>(
  actual: Message,
  from: Address,
  type: CCIPLogs.CombinedLogType,
  expected: DeepPartial<T>,
  decoder: Decoder<T>,
) {
  return testLog(actual, from, type, (actual) => {
    const reportAccepted = decoder.fromSlice(actual.beginParse())
    matchesObject(reportAccepted, expected)
    return true
  })
}

// assertLog delegates via the handler table
export const assertLog = <T extends CombinedLogType>(
  transactions: BlockchainTransaction[],
  from: Address,
  type: T,
  expected: LogMatch<T>,
) => {
  const prettyAddressesMap = prettifyAddressesMap(transactions)
  let failedMatches: any[] = []
  const matched = getExternals(transactions).some((actual) => {
    try {
      return handlers[type](actual, from, expected, prettyAddressesMap)
    } catch (error) {
      failedMatches.push(error)
      return false
    }
  })
  if (!matched && failedMatches.length > 0) {
    // rethrow the last expected failure since it's likely the most relevant
    throw failedMatches[failedMatches.length - 1]
  }
  expect(matched).toBe(true)
}

export const testLogCCIPMessageSent = (
  actual: Message,
  from: Address,
  expected: DeepPartial<on.CCIPMessageSent>,
  prettyAddressesMap: Map<string, string>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.CCIPMessageSent, (actual) => {
    const msg = on.CCIPMessageSent.fromSlice(actual.beginParse())
    const sender = msg.message.sender

    // fromSlice already fully decodes tokenAmounts recursively, so no manual
    // unpacking is needed here.

    // Check other fields using toMatchObject (excluding sender to avoid object comparison)
    const { sender: _, ...messageWithoutSender } = msg.message
    const { sender: __, ...matchWithoutSender } = expected.message || {}

    matchesObject(messageWithoutSender, matchWithoutSender as object)

    // Check sender address using .equals() if specified in expected
    if (expected.message?.sender && expected.message.sender instanceof Address) {
      if (!sender.equals(expected.message.sender)) {
        throw new Error(
          `Sender address mismatch:\n` +
            `  Expected: ${expected.message.sender.toString()} (${prettyAddressesMap.get(expected.message.sender.toRawString())})\n` +
            `  Received: ${sender.toString()} (${prettyAddressesMap.get(sender.toRawString())})`,
        )
      }
    }
    return true
  })
}

export const testConfigSetLogMessage = (
  actual: Message,
  from: Address,
  expected: OCR3Logs.OCR3BaseConfigSet,
) => {
  return testLog(actual, from, OCR3Logs.LogTypes.OCR3BaseConfigSet, (actual) => {
    const cs = actual.beginParse()
    const ocrPluginType = cs.loadUintBig(16)
    const configDigest = cs.loadUintBig(256)
    const signers = fromSnakeData(cs.loadRef(), (actual) => actual.loadUintBig(256)).sort()
    const transmitters = fromSnakeData(cs.loadRef(), (actual) => actual.loadAddress()).sort()
    const bigF = cs.loadUint(8)

    const msg = {
      ocrPluginType,
      configDigest,
      signers,
      transmitters,
      bigF,
    }
    const modifiedMatch = {
      ocrPluginType: expected.ocrPluginType,
      configDigest: expected.configDigest,
      signers: expected.signers.sort(),
      transmitters: expected.transmitters.sort(),
      bigF: expected.bigF,
    }

    equalsObject(msg, modifiedMatch)
    return true
  })
}

export const testTransmittedLogMessage = (
  actual: Message,
  from: Address,
  expected: Partial<OCR3Logs.OCR3BaseTransmitted>,
) => {
  return testLog(actual, from, OCR3Logs.LogTypes.OCR3BaseTransmitted, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      ocrPluginType: cs.loadUintBig(16),
      configDigest: cs.loadUintBig(256),
      sequenceNumber: cs.loadUint(64),
    }

    matchesObject(msg, expected)
    return true
  })
}

export const testLogReceiverCCIPMessageReceived = (
  actual: Message,
  from: Address,
  expected: CCIPLogs.ReceiverCCIPMessageReceived,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.ReceiverCCIPMessageReceived, (actual) => {
    const decoded = of.Any2TVMMessage.fromSlice(actual.beginParse())
    equalsObject(decoded, expected.message)
    return true
  })
}

function testLogRampUpdate(
  actual: Message,
  from: Address,
  type: CCIPLogs.CombinedLogType,
  expected: DeepPartial<rt.OffRampAdded | rt.OffRampRemoved>,
  addressField: 'offRampAdded' | 'offRampRemoved',
) {
  return testLog(actual, from, type, (body) => {
    const cs = body.beginParse()
    const sourceChainSelectors = fromSnakeData(cs.loadRef(), (slice) => slice.loadUintBig(64))
    const decoded = {
      sourceChainSelectors,
      [addressField]: cs.loadAddress(),
    }
    matchesObject(decoded, expected)
    return true
  })
}

function matchesObject(actual: any, expected: any) {
  expect(actual).toMatchObject(expected)
}

function equalsObject(actual: any, expected: any) {
  expect(actual).toEqual(expected)
}
