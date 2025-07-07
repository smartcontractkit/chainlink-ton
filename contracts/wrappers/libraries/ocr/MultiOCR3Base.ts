import {
  Address,
  beginCell,
  Builder,
  Cell,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core'

import { crc32 } from 'zlib'
import { asSnakeData, fromSnakeData } from '../../../tests/utils'

export const Opcodes = {
  //TODO: OP_SET_OCR3_CONFIG: crc32('Ownable2Step_TransferOwnership'),
  OP_SET_OCR3_CONFIG: 0x000000001,
}

export type ReportContext = {
  configDigest: bigint,
  sequenceBytes: number
}

export type OCR3Config = {
  configInfo: ConfigInfo,
  signers: bigint[], // public keys
  transmitters: Address[]
}

export type ConfigInfo = {
  configDigest: bigint,
  bigF: number,
  n: number,
  isSignatureVerificationEnabled: boolean,
}

export type SignatureEd25519 = {
  r: bigint,
  s: bigint
}

export function newOCR3BaseCell(chainId: number): Cell {
    return beginCell()
    .storeUint(chainId, 8)
    .storeDict(Dictionary.empty())
    .storeUint(16, 16)
    .storeDict(Dictionary.empty())
    .storeUint(16, 16)
    .storeDict(Dictionary.empty())
    .endCell()
}

export function ocr3ConfigFromCell(cell: Cell): OCR3Config {
  var cs = cell.beginParse()
  const configDigest = BigInt(cs.loadUint(256))
  const bigF = cs.loadUint(8)
  const n = cs.loadUint(8)
  const isSignatureVerificationEnabled = cs.loadBoolean()
  const signersCell = cs.loadRef()
  const transmittersCell = cs.loadRef()

  const signers = fromSnakeData(
    signersCell,
    (cs) => {
      const signer = BigInt(cs.loadUint(256))
      return signer
    })
  const transmitters = fromSnakeData(
    transmittersCell,
    (cs) => {
      const address = cs.loadAddress()
      return address
    })
  return {
    configInfo: {
      configDigest,
      bigF,
      n,
      isSignatureVerificationEnabled
    },
    signers,
    transmitters
  }

}

export class OCR3Base {
  async sendSetOCR3Config(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint,
      queryId?: number,
      ocrPluginType: number,
      ocr3Config: OCR3Config,
    }) {
      await provider.internal(via, {
        value: opts.value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell()
          .storeUint(Opcodes.OP_SET_OCR3_CONFIG, 32)
          .storeUint(opts.queryId ?? 0, 64)
          .storeUint(opts.ocr3Config.configInfo.configDigest, 256)
          .storeUint(opts.ocrPluginType, 16)
          .storeUint(opts.ocr3Config.configInfo.bigF, 8)
          .storeUint(opts.ocr3Config.configInfo.isSignatureVerificationEnabled ? -1 : 0, 1)
          .storeRef(asSnakeData<bigint>(
            opts.ocr3Config.signers,
            (item) => new Builder().storeUint(item, 256)
          ))
          .storeRef(asSnakeData<Address>(
            opts.ocr3Config.transmitters,
            (item) => new Builder().storeAddress(item)
          ))
          .endCell(),
      })
  }
}

 
