import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
  TupleBuilder,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import { CellCodec } from '../utils'
import { asSnakeData, asSnakeDataUint, fromSnakeData } from '../../src/utils'
import { CCIPSend, TokenAmount } from './Router'
import {
  Any2TVMMessage,
  builder as OffRampBuilder,
  CCIPReceiveConfirm,
  CrossChainAddress,
  OffRamp,
} from './OffRamp'

export const RECEIVER_FACILITY_ID = 346
export const RECEIVER_ERROR_CODE = 34600 //FACILITY_ID * 100

export enum ReceiverError {
  Unauthorized = RECEIVER_ERROR_CODE,
}

export type ReceiverStorage = {
  id: number
  offramp: Address
}

export abstract class Params {}

export abstract class Opcodes {
  static ccipReceive = 0xb3126df1
  static ccipReceiveConfirm = 0x28f4166f
}

export type CCIPReceive = {
  rootId: bigint
  message: Any2TVMMessage
}

export class Receiver implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new Receiver(address)
  }

  static createFromConfig(config: ReceiverStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new Receiver(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async sendCCIPReceive(provider: ContractProvider, via: Sender, value: bigint, body: CCIPReceive) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.ccipReceive.encode(body).asCell(),
    })
  }

  async getId(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('getId', [])
    return stack.readNumber()
  }

  async getOffRampAddress(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get('getOfframpAddress', [])
    return stack.readAddress()
  }

  async getFacilityId(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('facilityId', [])
    return stack.readNumber()
  }

  async getErrorCode(provider: ContractProvider, local: number): Promise<number> {
    const args = new TupleBuilder()
    args.writeNumber(local) // Push your number argument onto the stack

    const { stack } = await provider.get('errorCode', args.build())
    return stack.readNumber()
  }
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<ReceiverStorage> = {
      encode: (config: ReceiverStorage): Builder => {
        return beginCell().storeUint(config.id, 32).storeAddress(config.offramp)
      },

      load: (src: Slice): ReceiverStorage => {
        return {
          id: src.loadUint(32),
          offramp: src.loadAddress(),
        }
      },
    }

    return {
      contractData,
    }
  })(),
  message: {
    in: (() => {
      const ccipReceive: CellCodec<CCIPReceive> = {
        encode: (opts: CCIPReceive): Builder => {
          return beginCell()
            .storeUint(Opcodes.ccipReceive, 32)
            .storeUint(opts.rootId, 224)
            .storeBuilder(OffRampBuilder.data.any2TVMMessage.encode(opts.message))
        },
        load: function (src: Slice): CCIPReceive {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            rootId: src.loadUintBig(224),
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
