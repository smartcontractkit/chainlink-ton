import { Address, Message } from '@ton/core'
import {
  OCR3BaseConfigSet,
  OCR3BaseLogTypes,
  OCR3BaseTransmitted,
} from '../../../wrappers/libraries/ocr/Logs'
import { testLog, getExternals } from '../../Logs'
import { fromSnakeData } from '../../../utils/Utils'
import { BlockchainTransaction } from '@ton/sandbox'

export const testConfigSetLogMessage = (
  message: Message,
  from: Address,
  match: OCR3BaseConfigSet,
) => {
  return testLog(message, from, OCR3BaseLogTypes.OCR3BaseConfigSet, (x) => {
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
  match: Partial<OCR3BaseTransmitted>,
) => {
  return testLog(message, from, OCR3BaseLogTypes.OCR3BaseTransmitted, (x) => {
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

export const assertLog = (
  transactions: BlockchainTransaction[],
  from: Address,
  type: bigint,
  match: any, // loosen type constraint
) => {
  return getExternals(transactions).some((x) => {
    if (type === OCR3BaseLogTypes.OCR3BaseConfigSet) {
      console.log('topic OCR3BaseConfigSet', OCR3BaseLogTypes.OCR3BaseConfigSet.toString(16))
      return testConfigSetLogMessage(x, from, match as OCR3BaseConfigSet)
    } else if (type === OCR3BaseLogTypes.OCR3BaseTransmitted) {
      console.log('topic OCR3BaseTransmitted', OCR3BaseLogTypes.OCR3BaseTransmitted.toString(16))
      return testTransmittedLogMessage(x, from, match as Partial<OCR3BaseTransmitted>)
    } else {
      throw new Error(`Unknown log type: ${type.toString()}`)
    }
  })
}
