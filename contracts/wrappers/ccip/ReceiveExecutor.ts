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
import { OCR3Base } from '../libraries/ocr/MultiOCR3Base'

import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as of from './OffRamp'

export const FACILITY_NAME = 'com.chainlink.ton.ccip.ReceiveExecutor'
export const FACILITY_ID = 338
export const ERROR_CODE = FACILITY_ID * 100

export enum Errors {
  StateIsNotUntouched = ERROR_CODE, // Facility ID * 100
  UpdatingStateOfNonExecutedMessage,
  NotificationFromInvalidReceiver,
  Unauthorized,
}

export enum MessageState {
  Untouched = 0,
  Execute,
  ExecuteFailed,
  Success,
}
export type ReceiveExecutorStorage = {
  owner: Address
  message: of.Any2TVMRampMessage
  root: Address
  execId: bigint
  state: MessageState
  lastExecutionTimestamp: bigint
}

export const builder = {
  data: {
    contractData: ((): CellCodec<ReceiveExecutorStorage> => {
      return {
        encode: function (data: ReceiveExecutorStorage): Builder {
          return beginCell()
            .storeAddress(data.owner)
            .storeRef(of.builder.data.any2TVMRampMessage.encode(data.message))
            .storeAddress(data.root)
            .storeUint(data.execId, 192)
            .storeUint(data.state, 2)
            .storeUint(data.lastExecutionTimestamp, 64)
        },
        load: function (src: Slice): ReceiveExecutorStorage {
          throw new Error('Function not implemented.')
        },
      }
    })(),
  },
}

export class ReceiveExecutor extends OCR3Base implements typeAndVersion.Interface, Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
  }

  static createFromAddress(address: Address) {
    return new ReceiveExecutor(address)
  }

  static createFromConfig(config: ReceiveExecutorStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).endCell()
    const init = { code, data }
    return new ReceiveExecutor(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
      bounce: false,
    })
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
