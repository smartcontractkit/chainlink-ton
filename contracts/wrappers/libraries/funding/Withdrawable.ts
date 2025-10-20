import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { SandboxContract, SendMessageResult } from '@ton/sandbox'
import { crc32 } from 'zlib'
import { CellCodec } from '../../utils'

export const opcodes = {
  Withdraw: crc32('Withdrawable_Withdraw'),
}

export enum Error {
  VersionMismatch = 28700,
}

export type Withdraw = {
  queryId: bigint
  code: Cell
  fromVersion: string
}

export type WithdrawdEvent = {
  code: Cell
  codeHash: bigint
  version: string
}

export const builder = {
  message: {
    in: {
      upgrade: ((): CellCodec<Withdraw> => {
        return {
          encode: (msg: Withdraw): Builder => {
            return beginCell()
              .storeUint(opcodes.Withdraw, 32)
              .storeUint(msg.queryId, 64)
              .storeRef(msg.code)
              .storeStringTail(msg.fromVersion)
          },
          load: (src: Slice): Withdraw => {
            src.skip(32) // opcode
            return {
              queryId: src.loadUintBig(64),
              code: src.loadRef(),
              fromVersion: src.loadStringTail(),
            }
          },
        }
      })(),
    },
  },
  event: {
    upgraded: ((): CellCodec<WithdrawdEvent> => {
      return {
        encode: (event: WithdrawdEvent): Builder => {
          return beginCell()
            .storeRef(event.code)
            .storeUint(event.codeHash, 256)
            .storeStringTail(event.version)
        },
        load: (src: Slice): WithdrawdEvent => {
          return {
            code: src.loadRef(),
            codeHash: src.loadUintBig(256),
            version: src.loadStringTail(),
          }
        },
      }
    })(),
  },
}

export async function sendWithdraw(
  provider: ContractProvider,
  via: Sender,
  value: bigint,
  body: Withdraw,
) {
  await provider.internal(via, {
    value: value,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    body: builder.message.in.upgrade.encode(body).endCell(),
  })
}

export interface Withdrawable extends Contract {
  sendWithdraw(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: Withdraw,
  ): Promise<void>
}
