import { Address, Cell, Message } from '@ton/core'
import { BlockchainTransaction } from '@ton/sandbox'
import * as CCIPLogs from '../wrappers/ccip/Logs'
import * as OCR3Logs from '../wrappers/libraries/ocr/Logs'
import { fromSnakeData } from '../utils/types'
import { merkleRootsFromCell, priceUpdatesFromCell } from '../wrappers/ccip/OffRamp'

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

const LogTypes = {
  ...CCIPLogs.LogTypes,
  ...OCR3Logs.LogTypes,
}

type LogTypes = (typeof LogTypes)[keyof typeof LogTypes]

type LogMatch<T extends LogTypes> = T extends CCIPLogs.LogTypes.CCIPMessageSent
  ? DeepPartial<CCIPLogs.CCIPMessageSent>
  : T extends CCIPLogs.LogTypes.CCIPCommitReportAccepted
    ? DeepPartial<CCIPLogs.CCIPCommitReportAccepted>
    : T extends OCR3Logs.LogTypes.OCR3BaseConfigSet
      ? OCR3Logs.OCR3BaseConfigSet
      : T extends OCR3Logs.LogTypes.OCR3BaseTransmitted
        ? DeepPartial<OCR3Logs.OCR3BaseTransmitted>
        : number

export const assertLog = <T extends LogTypes>(
  transactions: BlockchainTransaction[],
  from: Address,
  type: T,
  match: LogMatch<T>,
) => {
  getExternals(transactions).some((x) => {
    switch (type) {
      case CCIPLogs.LogTypes.CCIPMessageSent:
        testLogCCIPMessageSent(x, from, match as DeepPartial<CCIPLogs.CCIPMessageSent>)
        break

      case CCIPLogs.LogTypes.CCIPCommitReportAccepted:
        testLogCCIPCommitReportAccepted(
          x,
          from,
          match as DeepPartial<CCIPLogs.CCIPCommitReportAccepted>,
        )
        break

      case OCR3Logs.LogTypes.OCR3BaseConfigSet:
        testConfigSetLogMessage(x, from, match as OCR3Logs.OCR3BaseConfigSet)
        break

      case OCR3Logs.LogTypes.OCR3BaseTransmitted:
        testTransmittedLogMessage(x, from, match as DeepPartial<OCR3Logs.OCR3BaseTransmitted>)
        break

      default:
        fail('Unhandled log type')
    }
  })
}

//TODO: Move the definition for the matcher passed to testLog to wrappers ccip/Logs and ocr/Logs

function testLogCCIPCommitReportAccepted(
  message: Message,
  from: Address,
  match: DeepPartial<CCIPLogs.CCIPCommitReportAccepted>,
) {
  return testLog(message, from, LogTypes.CCIPCommitReportAccepted, (x) => {
    let bs = x.beginParse()

    const priceUpdatesCell = bs.loadMaybeRef()
    const merkleRootsCell = bs.loadRef()

    const priceUpdates =
      priceUpdatesCell != undefined ? priceUpdatesFromCell(priceUpdatesCell) : undefined
    const merkleRoots = merkleRootsFromCell(merkleRootsCell)

    const reportAccepted: CCIPLogs.CCIPCommitReportAccepted = {
      priceUpdates,
      merkleRoots,
    }
    expect(reportAccepted).toMatchObject(match)
    return true
  })
}

export const testLogCCIPMessageSent = (
  message: Message,
  from: Address,
  match: DeepPartial<CCIPLogs.CCIPMessageSent>,
) => {
  return testLog(message, from, LogTypes.CCIPMessageSent, (x) => {
    let bs = x.beginParse()

    const destChainSelector = bs.loadUintBig(64)
    const sequenceNumber = bs.loadUintBig(64)

    bs = bs.loadRef().beginParse()

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
      destChainSelector,
      sequenceNumber,
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

    expect(msg).toMatchObject(match)
    return true
  })
}

export const testConfigSetLogMessage = (
  message: Message,
  from: Address,
  match: OCR3Logs.OCR3BaseConfigSet,
) => {
  return testLog(message, from, LogTypes.OCR3BaseConfigSet, (x) => {
    const cs = x.beginParse()
    const ocrPluginType = cs.loadUint(16)
    const configDigest = cs.loadUintBig(256)
    const signers = fromSnakeData(cs.loadRef(), (x) => x.loadUintBig(256))
    const transmitters = fromSnakeData(cs.loadRef(), (x) => x.loadAddress())
    const bigF = cs.loadUint(8)

    expect(ocrPluginType).toEqual(match.ocrPluginType)
    expect(configDigest).toEqual(match.configDigest)
    expect(signers.sort()).toEqual(match.signers.sort())
    for (let i = 0; i < transmitters.length; i++) {
      expect(transmitters[i].toString()).toEqual(match.transmitters![i].toString())
    }
    expect(bigF).toEqual(match.bigF)
    return true
  })
}

export const testTransmittedLogMessage = (
  message: Message,
  from: Address,
  match: Partial<OCR3Logs.OCR3BaseTransmitted>,
) => {
  return testLog(message, from, LogTypes.OCR3BaseTransmitted, (x) => {
    const cs = x.beginParse()
    const msg = {
      ocrPluginType: cs.loadUint(16),
      configDigest: cs.loadUintBig(256),
      sequenceNumber: cs.loadUint(64),
    }
    expect(msg).toMatchObject(match)
    return true
  })
}
