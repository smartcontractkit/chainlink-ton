import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Builder,
  Slice,
} from '@ton/core'

import { CellCodec } from '../utils'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { loadContractCode } from '../codeLoader'
import * as or from './OffRamp'

export const RECEIVE_EXECUTOR_FACILITY_NAME = 'com.chainlink.ton.ccip.ReceiveExecutor'
export const RECEIVE_EXECUTOR_FACILITY_ID = 338
export const RECEIVE_EXECUTOR_ERROR_CODE = 33800 //FACILITY_ID * 100

export enum ReceiveExecutorError {
  StateIsNotUntouched = RECEIVE_EXECUTOR_ERROR_CODE, // Facility ID * 100
  UpdatingStateOfNonExecutedMessage,
  NotificationFromInvalidReceiver,
  Unauthorized,
}

export const opcodes = {
  in: {
    confirm : 0x00e5dd97,
    bounced : 0x05dee1bb,
    freeze : 0x1571d8c6,
  },
}

export enum MessageState {
  Untouched = 0,
  Execute,
  ExecuteFailed,
  Success,
}

export type MerkleRootStorage = {
  owner: Address // MerkleRoot contract
  message: or.Any2TVMRampMessage
  root: Address
  execId: bigint
  state: MessageState
  lastExecutionTimestamp: bigint
}

export const builder = {
  data: (() => {})(),
}

export class ReceiveExecutor implements typeAndVersion.Interface, Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new ReceiveExecutor(address)
  }

  static createFromConfig(config: MerkleRootStorage, code: Cell, workchain = 0) {}

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
      body: beginCell().endCell(),
    })
  }

  async sendFreeze(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(opcodes.in.freeze, 32).endCell(),
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

  static type() {
    return RECEIVE_EXECUTOR_FACILITY_NAME
  }

  static code(): Promise<Cell> {
    return loadContractCode('ReceiveExecutor')
  }
}
