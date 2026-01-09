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
} from '@ton/core'

import { CellCodec } from '../utils'
import { loadContractCode } from '../codeLoader'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as of from './OffRamp'

export const FACILITY_NAME = 'com.chainlink.ton.ccip.test.Receiver'
export const FACILITY_ID = 346
export const ERROR_CODE = FACILITY_ID * 100

export enum ReceiverError {
  Unauthorized = ERROR_CODE,
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

export const opcodes = {
  in: {
    ccipReceive: 0xb3126df1,
    updateAuthorizedCaller: 0xaf9950c5,
    updateBehavior: 0x14d3fadb,
  },
}

export type CCIPReceive = {
  rootId: bigint
  message: of.Any2TVMMessage
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

  static code(): Promise<Cell> {
    return loadContractCode('ccip.test.receiver')
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

  async getFacilityId(provider: ContractProvider): Promise<bigint> {
    return provider.get('facilityId', []).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async getErrorCode(provider: ContractProvider, code: bigint): Promise<bigint> {
    return provider.get('errorCode', [{ type: 'int', value: code }]).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    return typeAndVersion.getTypeAndVersion(provider)
  }

  getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }
  getCodeHash(provider: ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
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
            .storeUint(opcodes.in.ccipReceive, 32)
            .storeUint(opts.rootId, 192)
            .storeBuilder(of.builder.data.any2TVMMessage.encode(opts.message))
        },
        load: function (src: Slice): CCIPReceive {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            rootId: src.loadUintBig(192),
            message: of.builder.data.any2TVMMessage.load(src),
          }
        },
      }

      const updateAuthorizedCaller: CellCodec<UpdateAuthorizedCaller> = {
        encode: (opts: UpdateAuthorizedCaller): Builder => {
          return beginCell()
            .storeUint(opcodes.in.updateAuthorizedCaller, 32)
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
          return beginCell().storeUint(opcodes.in.updateBehavior, 32).storeUint(opts.behavior, 8)
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
