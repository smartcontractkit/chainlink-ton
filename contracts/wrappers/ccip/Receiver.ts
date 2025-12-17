import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
  TupleBuilder,
} from '@ton/core'

import * as ownable2step from '../libraries/access/Ownable2Step'
import { CellCodec } from '../utils'
import { Any2TVMMessage, builder as OffRampBuilder } from './OffRamp'

export const RECEIVER_FACILITY_ID = 346
export const RECEIVER_ERROR_CODE = 34600 //FACILITY_ID * 100

export enum ReceiverError {
  Unauthorized = RECEIVER_ERROR_CODE,
  ReceiverIsConfigureToFailGracefully,
}

export enum ReceiverBehavior {
  Accept = 0,
  RejectAll,
  ConsumeAllGas,
}

export type ReceiverStorage = {
  id: bigint
  ownable: ownable2step.Data
  authorizedCaller: Address
  behavior: ReceiverBehavior
}

export abstract class Params {}

export abstract class Opcodes {
  static ccipReceive = 0xb3126df1
  static updateAuthorizedCaller = 0xaf9950c5
  static updateBehavior = 0x14d52e7b
}

export type CCIPReceive = {
  rootId: bigint
  message: Any2TVMMessage
}

export type UpdateAuthorizedCaller = {
  authorizedCaller: Address
}

export type UpdateBehavior = {
  behavior: ReceiverBehavior
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

  async sendUpdateAuthorizedCaller(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: UpdateAuthorizedCaller,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateAuthorizedCaller.encode(body).asCell(),
    })
  }

  async sendUpdateBehavior(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: UpdateBehavior,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateBehavior.encode(body).asCell(),
    })
  }

  async getId(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('getId', [])
    return stack.readNumber()
  }

  async getAuthorizedCaller(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get('getAuthorizedCaller', [])
    return stack.readAddress()
  }

  async getBehavior(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('getBehavior', [])
    return stack.readNumber()
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
      encode: (storage: ReceiverStorage): Builder => {
        return beginCell()
          .storeUint(storage.id, 32)
          .storeBuilder(ownable2step.builder.data.traitData.encode(storage.ownable))
          .storeAddress(storage.authorizedCaller)
          .storeUint(storage.behavior, 8)
      },

      load: (src: Slice): ReceiverStorage => {
        const id = src.loadUint(32)
        const ownable = ownable2step.builder.data.traitData.load(src)
        const authorizedCaller = src.loadAddress()
        const behavior = src.loadUint(8)

        return {
          id: BigInt(id),
          ownable,
          authorizedCaller,
          behavior,
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

      const updateAuthorizedCaller: CellCodec<UpdateAuthorizedCaller> = {
        encode: (opts: UpdateAuthorizedCaller): Builder => {
          return beginCell()
            .storeUint(Opcodes.updateAuthorizedCaller, 32)
            .storeAddress(opts.authorizedCaller)
        },
        load: function (src: Slice): UpdateAuthorizedCaller {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            authorizedCaller: src.loadAddress(),
          }
        },
      }

      const updateBehavior: CellCodec<UpdateBehavior> = {
        encode: (opts: UpdateBehavior): Builder => {
          return beginCell().storeUint(Opcodes.updateBehavior, 32).storeUint(opts.behavior, 8)
        },
        load: function (src: Slice): UpdateBehavior {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            behavior: src.loadUint(8),
          }
        },
      }

      return {
        ccipReceive,
        updateAuthorizedCaller,
        updateBehavior,
      }
    })(),
  },
}
