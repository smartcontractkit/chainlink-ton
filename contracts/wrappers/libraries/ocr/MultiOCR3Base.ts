import {
  Address,
  beginCell,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { SandboxContract, SendMessageResult } from '@ton/sandbox'

import { crc32 } from 'zlib'

export const Opcodes = {
  //TODO: OP_SET_OCR3_CONFIG: crc32('Ownable2Step_TransferOwnership'),
  OP_SET_OCR3_CONFIG: 0x000000001,
}

export type OCR3Config = {
  
}

export class MultiOCR3Base {

  async sendSetOCR3Config(
    provider: ContractProvider,
    via: Sender,
    opts {
      value: bigint,
      queryId?: number,
      ocr3Config: OCR3Config,
    }) {
      
    }
 
