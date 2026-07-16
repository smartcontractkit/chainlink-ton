import { Address, beginCell, Cell, Message } from '@ton/core'
import { BlockchainTransaction } from '@ton/sandbox'
import * as CCIPLogs from '../wrappers/ccip/Logs'
import * as OCR3Logs from '../wrappers/libraries/ocr/Logs'
import { fromSnakeData } from '../src/utils/types'
import * as offRamp from '../wrappers/ccip/OffRamp'
import { prettifyAddressesMap } from './utils/prettyPrint'
import { crc32 } from 'zlib'
import * as onramp from '../wrappers/ccip/OnRamp'
import * as router from '../wrappers/ccip/Router'
import * as of from '../wrappers/gen/ccip/OffRamp'
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
  [CCIPLogs.LogTypes.CCIPMessageSent]: DeepPartial<onramp.CCIPMessageSent>
  [CCIPLogs.LogTypes.CommitReportAccepted]: DeepPartial<of.CommitReportAccepted>
  [CCIPLogs.LogTypes.ExecutionStateChanged]: DeepPartial<CCIPLogs.ExecutionStateChanged>
  [CCIPLogs.LogTypes.SourceChainSelectorAdded]: CCIPLogs.SourceChainSelectorAdded
  [CCIPLogs.LogTypes.SourceChainConfigUpdated]: DeepPartial<of.SourceChainConfigUpdated>
  [CCIPLogs.LogTypes.DestChainSelectorAdded]: CCIPLogs.DestChainSelectorAdded
  [CCIPLogs.LogTypes.DestChainConfigUpdated]: DeepPartial<CCIPLogs.DestChainConfigUpdated>
  [OCR3Logs.LogTypes.OCR3BaseConfigSet]: OCR3Logs.OCR3BaseConfigSet
  [OCR3Logs.LogTypes.OCR3BaseTransmitted]: DeepPartial<OCR3Logs.OCR3BaseTransmitted>
  [CCIPLogs.LogTypes.ReceiverCCIPMessageReceived]: CCIPLogs.ReceiverCCIPMessageReceived
  [CCIPLogs.LogTypes.OnRampSet]: CCIPLogs.OnRampSet
  [CCIPLogs.LogTypes.OffRampAdded]: CCIPLogs.OffRampAdded
  [CCIPLogs.LogTypes.OffRampRemoved]: CCIPLogs.OffRampRemoved
  [CCIPLogs.LogTypes.Cursed]: CCIPLogs.Cursed
  [CCIPLogs.LogTypes.Uncursed]: CCIPLogs.Uncursed
  [CCIPLogs.LogTypes.UsdPerTokenUpdated]: DeepPartial<CCIPLogs.UsdPerTokenUpdated>
  [CCIPLogs.LogTypes.UsdPerUnitGasUpdated]: DeepPartial<CCIPLogs.UsdPerUnitGasUpdated>
  [CCIPLogs.LogTypes
    .ReceiveExecutorInitExecuteBounced]: DeepPartial<CCIPLogs.ReceiveExecutorInitExecuteBounced>
  [CCIPLogs.LogTypes.DeployableInitializeBounced]: DeepPartial<CCIPLogs.DeployableInitializeBounced>
  [CCIPLogs.LogTypes.RouteMessageBounced]: DeepPartial<CCIPLogs.RouteMessageBounced>
  [CCIPLogs.LogTypes.MessageToOffRampBounced]: DeepPartial<CCIPLogs.MessageToOffRampBounced>
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
    testLogCCIPMessageSent(
      actual,
      from,
      expected as DeepPartial<onramp.CCIPMessageSent>,
      addressesMap,
    ),

  [CCIPLogs.LogTypes.CommitReportAccepted]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.CommitReportAccepted,
      expected as DeepPartial<of.CommitReportAccepted>,
      of.CommitReportAccepted,
    ),

  [CCIPLogs.LogTypes.ExecutionStateChanged]: (actual, from, expected) =>
    testLogCCIPExecutionStateChanged(
      actual,
      from,
      expected as DeepPartial<CCIPLogs.ExecutionStateChanged>,
    ),

  [CCIPLogs.LogTypes.SourceChainSelectorAdded]: (actual, from, expected) =>
    testLogSourceChainSelectorAdded(actual, from, expected as CCIPLogs.SourceChainSelectorAdded),

  [CCIPLogs.LogTypes.SourceChainConfigUpdated]: (actual, from, expected) =>
    testLogGen(
      actual,
      from,
      CCIPLogs.LogTypes.SourceChainConfigUpdated,
      expected as DeepPartial<of.SourceChainConfigUpdated>,
      of.SourceChainConfigUpdated,
    ),

  [CCIPLogs.LogTypes.DestChainSelectorAdded]: (actual, from, expected) =>
    testLogDestChainSelectorAdded(actual, from, expected as CCIPLogs.DestChainSelectorAdded),

  [CCIPLogs.LogTypes.DestChainConfigUpdated]: (actual, from, expected) =>
    testLogDestChainConfigUpdated(
      actual,
      from,
      expected as DeepPartial<CCIPLogs.DestChainConfigUpdated>,
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
    testLogRampSet(actual, from, expected as CCIPLogs.OnRampSet),

  [CCIPLogs.LogTypes.OffRampAdded]: (actual, from, expected) =>
    testLogOffRampAdded(actual, from, expected as CCIPLogs.OffRampAdded),

  [CCIPLogs.LogTypes.OffRampRemoved]: (actual, from, expected) =>
    testLogOffRampRemoved(actual, from, expected as CCIPLogs.OffRampRemoved),

  [CCIPLogs.LogTypes.Cursed]: (actual, from, expected) =>
    testLogRMNRemoteCursed(actual, from, expected as CCIPLogs.Cursed),

  [CCIPLogs.LogTypes.Uncursed]: (actual, from, expected) =>
    testLogRMNRemoteUncursed(actual, from, expected as CCIPLogs.Uncursed),

  [CCIPLogs.LogTypes.UsdPerTokenUpdated]: (actual, from, expected) =>
    testLogUsdPerTokenUpdated(actual, from, expected as DeepPartial<CCIPLogs.UsdPerTokenUpdated>),

  [CCIPLogs.LogTypes.UsdPerUnitGasUpdated]: (actual, from, expected) =>
    testLogUsdPerUnitGasUpdated(
      actual,
      from,
      expected as DeepPartial<CCIPLogs.UsdPerUnitGasUpdated>,
    ),
  [CCIPLogs.LogTypes.ReceiveExecutorInitExecuteBounced]: (actual, from, expected) =>
    testLogReceiveExecutorInitExecuteBounced(
      actual,
      from,
      expected as DeepPartial<CCIPLogs.ReceiveExecutorInitExecuteBounced>,
    ),

  [CCIPLogs.LogTypes.DeployableInitializeBounced]: (actual, from, expected) =>
    testLogDeployableInitializeBounced(
      actual,
      from,
      expected as DeepPartial<CCIPLogs.DeployableInitializeBounced>,
    ),

  [CCIPLogs.LogTypes.RouteMessageBounced]: (actual, from, expected) =>
    testLogRouteMessageBounced(actual, from, expected as DeepPartial<CCIPLogs.RouteMessageBounced>),

  [CCIPLogs.LogTypes.MessageToOffRampBounced]: (actual, from, expected) =>
    testLogMessageToOffRampBounced(
      actual,
      from,
      expected as DeepPartial<CCIPLogs.MessageToOffRampBounced>,
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
  expected: DeepPartial<onramp.CCIPMessageSent>,
  prettyAddressesMap: Map<string, string>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.CCIPMessageSent, (actual) => {
    const msg: onramp.CCIPMessageSent = onramp.builder.events.ccipMessageSent.load(
      actual.beginParse(),
    )
    const sender = msg.message.sender

    // Decode tokenAmounts from its raw Cell into an array so matches can use plain objects.
    const decodedMessage = {
      ...msg.message,
      body: {
        ...msg.message.body,
        tokenAmounts: fromSnakeData(
          msg.message.body.tokenAmounts,
          router.builder.data.tokenAmount.load,
        ),
      },
    }

    // Check other fields using toMatchObject (excluding sender to avoid object comparison)
    const { sender: _, ...messageWithoutSender } = decodedMessage
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

export const testLogCCIPExecutionStateChanged = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.ExecutionStateChanged>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.ExecutionStateChanged, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      sourceChainSelector: cs.loadUintBig(64),
      sequenceNumber: cs.loadUintBig(64),
      messageId: cs.loadUintBig(256),
      state: cs.loadUintBig(8),
    }

    matchesObject(msg, expected)
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

export const testLogRampSet = (actual: Message, from: Address, expected: CCIPLogs.OnRampSet) => {
  return testLog(actual, from, CCIPLogs.LogTypes.OnRampSet, (actual) => {
    const cs = actual.beginParse()
    const selectors = fromSnakeData(cs.loadRef(), (actual) => actual.loadUintBig(64))
    const addr = cs.loadMaybeAddress()
    const msg = {
      destChainSelectors: selectors,
      onRamp: addr ?? undefined,
    }
    equalsObject(msg, expected)
    return true
  })
}

export const testLogOffRampAdded = (
  actual: Message,
  from: Address,
  expected: CCIPLogs.OffRampAdded,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.OffRampAdded, (actual) => {
    const cs = actual.beginParse()
    const selectors = fromSnakeData(cs.loadRef(), (actual) => actual.loadUintBig(64))
    const addr = cs.loadAddress()
    const msg = {
      sourceChainSelectors: selectors,
      offRampAdded: addr,
    }
    equalsObject(msg, expected)
    return true
  })
}

export const testLogOffRampRemoved = (
  actual: Message,
  from: Address,
  expected: CCIPLogs.OffRampRemoved,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.OffRampRemoved, (actual) => {
    const cs = actual.beginParse()
    const selectors = fromSnakeData(cs.loadRef(), (actual) => actual.loadUintBig(64))
    const addr = cs.loadAddress()
    const msg = {
      sourceChainSelectors: selectors,
      offRampRemoved: addr,
    }
    equalsObject(msg, expected)
    return true
  })
}

export const testLogRMNRemoteCursed = (
  actual: Message,
  from: Address,
  expected: CCIPLogs.Cursed,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.Cursed, (actual) => {
    const cs = actual.beginParse()
    const subject = cs.loadUintBig(128)
    const msg = {
      subject: subject,
    }
    equalsObject(msg, expected)
    return true
  })
}

export const testLogRMNRemoteUncursed = (
  actual: Message,
  from: Address,
  expected: CCIPLogs.Uncursed,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.Uncursed, (actual) => {
    const cs = actual.beginParse()
    const subject = cs.loadUintBig(128)
    const msg = {
      subject: subject,
    }
    equalsObject(msg, expected)
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

export const testLogSourceChainSelectorAdded = (
  actual: Message,
  from: Address,
  expected: CCIPLogs.SourceChainSelectorAdded,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.SourceChainSelectorAdded, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      sourceChainSelector: cs.loadUintBig(64),
    }
    equalsObject(msg, expected)
    return true
  })
}

export const testLogDestChainSelectorAdded = (
  actual: Message,
  from: Address,
  expected: CCIPLogs.DestChainSelectorAdded,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.DestChainSelectorAdded, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      destChainSelector: cs.loadUintBig(64),
    }
    equalsObject(msg, expected)
    return true
  })
}

export const testLogDestChainConfigUpdated = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.DestChainConfigUpdated>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.DestChainConfigUpdated, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      destChainSelector: cs.loadUintBig(64),
      config: onramp.builder.data.destChainConfig.load(cs),
    }
    matchesObject(msg, expected)
    return true
  })
}

export const testLogUsdPerTokenUpdated = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.UsdPerTokenUpdated>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.UsdPerTokenUpdated, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      sourceToken: cs.loadAddress().toString(),
      usdPerToken: cs.loadUintBig(224),
      timestamp: cs.loadUintBig(64),
    }

    const modifiedMatch = { ...expected }
    if (expected.sourceToken && expected.sourceToken instanceof Address) {
      modifiedMatch.sourceToken = expected.sourceToken.toString()
    }

    matchesObject(msg, modifiedMatch)
    return true
  })
}

export const testLogUsdPerUnitGasUpdated = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.UsdPerUnitGasUpdated>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.UsdPerUnitGasUpdated, (actual) => {
    const cs = actual.beginParse()
    const msg: CCIPLogs.UsdPerUnitGasUpdated = {
      destChainSelector: cs.loadUintBig(64),
      executionGasPrice: cs.loadUintBig(112),
      dataAvailabilityGasPrice: cs.loadUintBig(112),
      timestamp: cs.loadUintBig(64),
    }
    matchesObject(msg, expected)
    return true
  })
}

export const testLogReceiveExecutorInitExecuteBounced = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.ReceiveExecutorInitExecuteBounced>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.ReceiveExecutorInitExecuteBounced, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      receiveExecutor: cs.loadAddress(),
      root: cs.loadAddress(),
      sequenceNumber: cs.loadUintBig(64),
    }
    matchesObject(msg, expected)
    return true
  })
}

export const testLogDeployableInitializeBounced = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.DeployableInitializeBounced>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.DeployableInitializeBounced, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      deployableAddress: cs.loadAddress(),
    }
    matchesObject(msg, expected)
    return true
  })
}

export const testLogRouteMessageBounced = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.RouteMessageBounced>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.RouteMessageBounced, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      router: cs.loadAddress(),
      execId: cs.loadUintBig(192),
    }
    matchesObject(msg, expected)
    return true
  })
}

export const testLogMessageToOffRampBounced = (
  actual: Message,
  from: Address,
  expected: DeepPartial<CCIPLogs.MessageToOffRampBounced>,
) => {
  return testLog(actual, from, CCIPLogs.LogTypes.MessageToOffRampBounced, (actual) => {
    const cs = actual.beginParse()
    const msg = {
      offRamp: cs.loadAddress(),
      execId: cs.loadUintBig(192),
    }
    matchesObject(msg, expected)
    return true
  })
}

function matchesObject(actual: any, expected: any) {
  expect(actual).toMatchObject(expected)
}

function equalsObject(actual: any, expected: any) {
  expect(actual).toEqual(expected)
}
