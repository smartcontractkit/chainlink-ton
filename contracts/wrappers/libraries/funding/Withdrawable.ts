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
import { CellCodec } from '../../utils'

export const opcodes = {
  Withdraw: 0xf343fc1b, // crc32('Withdrawable_Withdraw')
}

export enum Error {
  InsufficientBalance = 44800, // Facility ID * 100
  HitReserve,
  LowReserve,
  InvalidRequest,
}

export type Withdraw = {
  queryId: bigint
  destination: Address
  amount: bigint
  reserve?: bigint
  drainAllAvailable: boolean
}

export const builder = {
  message: {
    in: {
      withdraw: ((): CellCodec<Withdraw> => {
        return {
          encode: (msg: Withdraw): Builder => {
            return beginCell()
              .storeUint(opcodes.Withdraw, 32)
              .storeUint(msg.queryId, 64)
              .storeAddress(msg.destination)
              .storeCoins(msg.amount)
              .storeMaybeCoins(msg.reserve)
              .storeBit(msg.drainAllAvailable)
          },
          load: (src: Slice): Withdraw => {
            src.skip(32) // opcode
            return {
              queryId: src.loadUintBig(64),
              destination: src.loadAddress(),
              amount: src.loadCoins(),
              reserve: src.loadMaybeCoins() ?? undefined,
              drainAllAvailable: src.loadBit(),
            }
          },
        }
      })(),
    },
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
    body: builder.message.in.withdraw.encode(body).endCell(),
  })
}

export async function getReserve(provider: ContractProvider): Promise<bigint> {
  const { stack } = await provider.get('reserve', [])
  return stack.readBigNumber()
}

export interface Interface extends Contract {
  sendWithdraw(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: Withdraw,
  ): Promise<void>

  getReserve(provider: ContractProvider): Promise<bigint>
}
