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
import { KeyPair, sign } from '@ton/crypto'
import { bigIntToUint8Array, hashSync, uint8ArrayToBigInt } from '../../../utils/Utils'

import { crc32 } from 'zlib'
import { asSnakeData, fromSnakeData } from '../../../utils/Utils'

export const OCR3_PLUGIN_TYPE_COMMIT = 0x0000
export const OCR3_PLUGIN_TYPE_EXECUTE = 0x0001

export const Opcodes = {
  //TODO: OP_SET_OCR3_CONFIG: crc32('Ownable2Step_TransferOwnership'),
  OP_SET_OCR3_CONFIG: 0x000000001,
}

export type ReportContext = {
  configDigest: bigint
  padding: bigint // 0x00
  sequenceBytes: number
}

export type OCR3Config = {
  configInfo: ConfigInfo
  signers: bigint[] // public keys
  transmitters: Address[]
}

export type ConfigInfo = {
  configDigest: bigint
  bigF: number
  n: number
  isSignatureVerificationEnabled: boolean
}

export type SignatureEd25519 = {
  r: bigint
  s: bigint
  signer: bigint
}

export function createSignature(signer: KeyPair, data: Buffer<ArrayBufferLike>): SignatureEd25519 {
  const signature = sign(data, signer.secretKey)

  const r = uint8ArrayToBigInt(signature.subarray(0, 32))
  const s = uint8ArrayToBigInt(signature.subarray(32, 64))
  const signerPublicKey = uint8ArrayToBigInt(signer.publicKey)

  return {
    r,
    s,
    signer: signerPublicKey,
  }
}

export function newOCR3BaseCell(chainId: number, contractId: number): Cell {
  return beginCell()
    .storeUint(contractId, 64)
    .storeUint(chainId, 8)
    .storeBit(false)
    .storeBit(false)
    .endCell()
}

export function ocr3ConfigFromCell(cell: Cell): OCR3Config {
  var cs = cell.beginParse()
  const configDigest = BigInt(cs.loadUintBig(256))
  const bigF = cs.loadUint(8)
  const n = cs.loadUint(8)
  const isSignatureVerificationEnabled = cs.loadBoolean()
  const signersCell = cs.loadRef()
  const transmittersCell = cs.loadRef()

  const signers = fromSnakeData(signersCell, (cs) => {
    return cs.loadUintBig(256)
  })
  const transmitters = fromSnakeData(transmittersCell, (cs) => {
    return cs.loadAddress()
  })

  return {
    configInfo: {
      configDigest,
      bigF,
      n,
      isSignatureVerificationEnabled,
    },
    signers,
    transmitters,
  }
}

export class OCR3Base {
  async sendSetOCR3Config(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
      configDigest: bigint
      ocrPluginType: number
      bigF: number
      isSignatureVerificationEnabled: boolean
      signers: bigint[] // public keys
      transmitters: Address[]
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.OP_SET_OCR3_CONFIG, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .storeUint(opts.configDigest, 256)
        .storeUint(opts.ocrPluginType, 16)
        .storeUint(opts.bigF, 8)
        .storeBit(opts.isSignatureVerificationEnabled)
        .storeRef(asSnakeData<bigint>(opts.signers, (item) => new Builder().storeUint(item, 256)))
        .storeRef(
          asSnakeData<Address>(opts.transmitters, (item) => new Builder().storeAddress(item)),
        )
        .endCell(),
    })
  }
}
