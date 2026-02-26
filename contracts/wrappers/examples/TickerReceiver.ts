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

import * as receiver from '../libraries/Receiver'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'

export const FACILITY_NAME = 'com.chainlink.ton.ccip.test.TickerReceiver'
export const FACILITY_ID = 999
export const ERROR_CODE = FACILITY_ID * 100

enum TickerReceiverError {
  Rejected = ERROR_CODE,
}

export const error = {
  ...receiver.error,
  ...TickerReceiverError,
}

export type Storage = {
  id: bigint
  router: Address
}

export const opcodes = {
  in: {
    ...receiver.opcodes.in,
    Tick: 0xd4834e00,
    TickRec: 0x46033c09,
  },
}

export type Tick = {
  queryID: bigint
  times: number
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<Storage> = {
      encode: (storage: Storage): Builder => {
        return beginCell().storeUint(storage.id, 32).storeAddress(storage.router)
      },

      load: (src: Slice): Storage => {
        const id = src.loadUint(32)
        const authorizedCaller = src.loadAddress()

        return {
          id: BigInt(id),
          router: authorizedCaller,
        }
      },
    }

    return {
      contractData,
    }
  })(),
  message: {
    in: (() => {
      const tick: CellCodec<Tick> = {
        encode: (opts: Tick): Builder => {
          return beginCell()
            .storeUint(opcodes.in.Tick, 32)
            .storeUint(opts.queryID, 64)
            .storeUint(opts.times, 32)
        },
        load: function (src: Slice): Tick {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            queryID: src.loadUintBig(64),
            times: src.loadUint(32),
          }
        },
      }

      return {
        ccipReceive: receiver.builder.message.in.ccipReceive,
        tick,
      }
    })(),
  },
}

export class TickerReceiver implements Contract, receiver.Receiver {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new TickerReceiver(address)
  }

  static createFromConfig(config: Storage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = {
      code,
      data,
    }
    return new TickerReceiver(contractAddress(workchain, init), init)
  }

  static code(): Promise<Cell> {
    return loadContractCode('examples.TickerReceiver')
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async sendCCIPReceive(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: receiver.CCIPReceive,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.ccipReceive.encode(body).asCell(),
    })
  }

  async getId(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('id', [])
    return stack.readNumber()
  }

  async getRouter(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get('router', [])
    return stack.readAddress()
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
