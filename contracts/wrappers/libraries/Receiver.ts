import { beginCell, Builder, Contract, ContractProvider, Sender, Slice } from '@ton/core'
import { crc32 } from 'zlib'
import { errorCode, facilityId, CellCodec } from '../utils'

import { Any2TVMMessage, builder as OffRampBuilder } from '../ccip/OffRamp'

export const FACILITY_NAME = 'link.chain.ton.ccip.lib.Receiver'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum error {
  Unauthorized = 5400,
  LowValue,
}

export const opcodes = {
  in: {
    ccipReceive: 0xb3126df1,
  },
}

export type CCIPReceive = {
  rootId: bigint
  message: Any2TVMMessage
}

export interface Receiver extends Contract {
  sendCCIPReceive(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: CCIPReceive,
  ): Promise<void>
}

export const builder = {
  message: {
    in: (() => {
      const ccipReceive: CellCodec<CCIPReceive> = {
        encode: (opts: CCIPReceive): Builder => {
          return beginCell()
            .storeUint(opcodes.in.ccipReceive, 32)
            .storeUint(opts.rootId, 192)
            .storeBuilder(OffRampBuilder.data.any2TVMMessage.encode(opts.message))
        },
        load: function (src: Slice): CCIPReceive {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            rootId: src.loadUintBig(192),
            message: OffRampBuilder.data.any2TVMMessage.load(src),
          }
        },
      }

      return {
        ccipReceive,
      }
    })(),
  },
}
