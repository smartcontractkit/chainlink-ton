import { Address, beginCell, Cell, Message } from '@ton/core'
import { BlockchainTransaction } from '@ton/sandbox'
import * as CCIPLogs from '../wrappers/ccip/Logs'
import * as OCR3Logs from '../wrappers/libraries/ocr/Logs'
import * as ReceiverLogs from '../wrappers/examples/ccip/Logs'
import { fromSnakeData } from '../src/utils/types'
import { MerkleRoot, merkleRootFromSlice, priceUpdatesFromCell } from '../wrappers/ccip/OffRamp'
import { prettifyAddressesMap } from './utils/prettyPrint'

// https://github.com/ton-blockchain/liquid-staking-contract/blob/1f4e9badbed52a4cf80cc58e4bb36ed375c6c8e7/utils.ts#L269-L294
export const getExternals = (transactions: BlockchainTransaction[]) => {
  const externals: Message[] = []
  return transactions.reduce((all, curExt) => [...all, ...curExt.externals], externals)
}

export const testLog = (
  message: Message,
  from: Address,
  topic: number | bigint,
  matcher?: (body: Cell) => boolean,
) => {
  if (message.info.type !== 'external-out') {
    console.log('Wrong from')
    return false
  }
  if (!message.info.src.equals(from)) return false
  if (!message.info.dest) return false
  if (message.info.dest!.value !== BigInt(topic)) return false
  if (matcher !== undefined) {
    if (!message.body) console.log('No body')
    return matcher(message.body)
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

// map from log type → match payload type
type LogTypeMap = {
  [CCIPLogs.LogTypes.CCIPMessageSent]: DeepPartial<CCIPLogs.CCIPMessageSent>
  [CCIPLogs.LogTypes.CCIPCommitReportAccepted]: DeepPartial<CCIPLogs.CCIPCommitReportAccepted>
  [CCIPLogs.LogTypes.ExecutionStateChanged]: DeepPartial<CCIPLogs.ExecutionStateChanged>
  [OCR3Logs.LogTypes.OCR3BaseConfigSet]: OCR3Logs.OCR3BaseConfigSet
  [OCR3Logs.LogTypes.OCR3BaseTransmitted]: DeepPartial<OCR3Logs.OCR3BaseTransmitted>
  [ReceiverLogs.LogTypes.ReceiverCCIPMessageReceived]: ReceiverLogs.ReceiverCCIPMessageReceived
}

// union of the keys of that map
type CombinedLogType = keyof LogTypeMap

type LogMatch<T extends CombinedLogType> = LogTypeMap[T]

// Strongly-typed handler map
type Handler<T extends CombinedLogType> = (
  message: Message,
  from: Address,
  match: LogTypeMap[T],
  addressesMap: Map<string, string>,
) => boolean

const handlers: { [K in CombinedLogType]: Handler<K> } = {
  [CCIPLogs.LogTypes.CCIPMessageSent]: (x, from, match, addressesMap) =>
    testLogCCIPMessageSent(x, from, match as DeepPartial<CCIPLogs.CCIPMessageSent>, addressesMap),

  [CCIPLogs.LogTypes.CCIPCommitReportAccepted]: (x, from, match) =>
    testLogCCIPCommitReportAccepted(
      x,
      from,
      match as DeepPartial<CCIPLogs.CCIPCommitReportAccepted>,
    ),

  [CCIPLogs.LogTypes.ExecutionStateChanged]: (x, from, match) =>
    testLogCCIPExecutionStateChanged(x, from, match as DeepPartial<CCIPLogs.ExecutionStateChanged>),

  [ReceiverLogs.LogTypes.ReceiverCCIPMessageReceived]: (x, from, match) =>
    testLogReceiverCCIPMessageReceived(x, from, match as ReceiverLogs.ReceiverCCIPMessageReceived),

  [OCR3Logs.LogTypes.OCR3BaseConfigSet]: (x, from, match) =>
    testConfigSetLogMessage(x, from, match as OCR3Logs.OCR3BaseConfigSet),

  [OCR3Logs.LogTypes.OCR3BaseTransmitted]: (x, from, match) =>
    testTransmittedLogMessage(x, from, match as Partial<OCR3Logs.OCR3BaseTransmitted>),
}

// assertLog delegates via the handler table
export const assertLog = <T extends CombinedLogType>(
  transactions: BlockchainTransaction[],
  from: Address,
  type: T,
  match: LogMatch<T>,
) => {
  const prettyAddressesMap = prettifyAddressesMap(transactions)
  let failedMatches: any[] = []
  const matched = getExternals(transactions).some((x) => {
    try {
      return handlers[type](x, from, match, prettyAddressesMap)
    } catch (error) {
      failedMatches.push(error)
      return false
    }
  })
  if (!matched && failedMatches.length > 0) {
    // rethrow the last match failure since it's likely the most relevant
    throw failedMatches[failedMatches.length - 1]
  }
  expect(matched).toBe(true)
}

function testLogCCIPCommitReportAccepted(
  message: Message,
  from: Address,
  match: DeepPartial<CCIPLogs.CCIPCommitReportAccepted>,
) {
  return testLog(message, from, CCIPLogs.LogTypes.CCIPCommitReportAccepted, (x) => {
    let bs = x.beginParse()

    const commitHasMerkleRoots = bs.loadBit()
    let merkleRoot: MerkleRoot | undefined = undefined
    if (commitHasMerkleRoots) {
      merkleRoot = merkleRootFromSlice(bs)
    }

    const priceUpdatesCell = bs.loadMaybeRef()

    const priceUpdates =
      priceUpdatesCell != undefined ? priceUpdatesFromCell(priceUpdatesCell) : undefined

    const reportAccepted: CCIPLogs.CCIPCommitReportAccepted = {
      merkleRoot,
      priceUpdates,
    }
    matchesObject(reportAccepted, match)
    return true
  })
}

export const testLogCCIPMessageSent = (
  message: Message,
  from: Address,
  match: DeepPartial<CCIPLogs.CCIPMessageSent>,
  prettyAddressesMap: Map<string, string>,
) => {
  return testLog(message, from, CCIPLogs.LogTypes.CCIPMessageSent, (x) => {
    let bs = x.beginParse()

    const header = {
      messageId: bs.loadUintBig(256),
      sourceChainSelector: bs.loadUintBig(64),
      destChainSelector: bs.loadUintBig(64),
      sequenceNumber: bs.loadUintBig(64),
      nonce: bs.loadUintBig(64),
    }
    const sender = bs.loadAddress()

    const body = bs.loadRef().beginParse()

    const msg: CCIPLogs.CCIPMessageSent = {
      message: {
        header,
        sender,
        receiver: body.loadRef(),
        data: body.loadRef(),
        extraArgs: body.loadRef(),
        tokenAmounts: body.loadRef(),
        feeToken: body.loadAddress(),
        feeTokenAmount: body.loadUintBig(256),
        feeValueJuels: bs.loadUintBig(96),
      },
    }

    // Check other fields using toMatchObject (excluding sender to avoid object comparison)
    const { sender: _, ...messageWithoutSender } = msg.message
    const { sender: __, ...matchWithoutSender } = match.message || {}

    matchesObject(messageWithoutSender, matchWithoutSender)

    // Check sender address using .equals() if specified in match
    if (match.message?.sender && match.message.sender instanceof Address) {
      if (!sender.equals(match.message.sender)) {
        throw new Error(
          `Sender address mismatch:\n` +
            `  Expected: ${match.message.sender.toString()} (${prettyAddressesMap.get(match.message.sender.toRawString())})\n` +
            `  Received: ${sender.toString()} (${prettyAddressesMap.get(sender.toRawString())})`,
        )
      }
    }
    return true
  })
}

export const testLogCCIPExecutionStateChanged = (
  message: Message,
  from: Address,
  match: DeepPartial<CCIPLogs.ExecutionStateChanged>,
) => {
  return testLog(message, from, CCIPLogs.LogTypes.ExecutionStateChanged, (x) => {
    const cs = x.beginParse()
    const msg = {
      sourceChainSelector: cs.loadUintBig(64),
      sequenceNumber: cs.loadUintBig(64),
      messageId: cs.loadUintBig(256),
      state: cs.loadUintBig(8),
    }

    matchesObject(msg, match)
    return true
  })
}

export const testConfigSetLogMessage = (
  message: Message,
  from: Address,
  match: OCR3Logs.OCR3BaseConfigSet,
) => {
  return testLog(message, from, OCR3Logs.LogTypes.OCR3BaseConfigSet, (x) => {
    const cs = x.beginParse()
    const ocrPluginType = cs.loadUint(16)
    const configDigest = cs.loadUintBig(256)
    const signers = fromSnakeData(cs.loadRef(), (x) => x.loadUintBig(256)).sort()
    const transmitters = fromSnakeData(cs.loadRef(), (x) => x.loadAddress())
      .map((x) => x.toString())
      .sort()
    const bigF = cs.loadUint(8)

    const msg = {
      ocrPluginType,
      configDigest,
      signers,
      transmitters,
      bigF,
    }
    const modifiedMatch = {
      ocrPluginType: match.ocrPluginType,
      configDigest: match.configDigest,
      signers: match.signers.sort(),
      transmitters: match.transmitters.map((x) => x.toString()).sort(),
      bigF: match.bigF,
    }

    equalsObject(msg, modifiedMatch)
    return true
  })
}

export const testTransmittedLogMessage = (
  message: Message,
  from: Address,
  match: Partial<OCR3Logs.OCR3BaseTransmitted>,
) => {
  return testLog(message, from, OCR3Logs.LogTypes.OCR3BaseTransmitted, (x) => {
    const cs = x.beginParse()
    const msg = {
      ocrPluginType: cs.loadUint(16),
      configDigest: cs.loadUintBig(256),
      sequenceNumber: cs.loadUint(64),
    }

    matchesObject(msg, match)
    return true
  })
}

export const testLogReceiverCCIPMessageReceived = (
  message: Message,
  from: Address,
  expected: ReceiverLogs.ReceiverCCIPMessageReceived,
) => {
  return testLog(message, from, ReceiverLogs.LogTypes.ReceiverCCIPMessageReceived, (x) => {
    const msg = expected.message
    const expectedCell = beginCell()
      .storeUint(msg.messageId, 256)
      .storeUint(msg.sourceChainSelector, 64)
      .storeUint(msg.sender.byteLength, 8)
      .storeBuffer(msg.sender, msg.sender.byteLength)
      .storeRef(msg.data)
      .endCell()

    equalsObject(expectedCell, x)
    return true
  })
}

function matchesObject(obj, match) {
  expect(obj).toMatchObject(match)
}

function equalsObject(obj1: any, obj2: any) {
  expect(obj1).toEqual(obj2)
}
