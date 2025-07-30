import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core'
import { JettonClientConfig, jettonClientConfigToCell, ErrorCodes } from './types'

export type OnrampMockConfig = {
  jettonClient: JettonClientConfig
}

export function onrampMockConfigToCell(config: OnrampMockConfig): Cell {
  return jettonClientConfigToCell(config.jettonClient)
}

export const OnrampConstants = {
  FEE: 5n,
  INCORRECT_SENDER_ERROR: ErrorCodes.INCORRECT_SENDER,
  FORWARD_PAYLOAD_REQUIRED_ERROR: ErrorCodes.FORWARD_PAYLOAD_REQUIRED,
}

export const EventOpcodes = {
  INSUFFICIENT_FEE: 'InsufficientFee',
  ACCEPTED_REQUEST: 'AcceptedRequest',
}

export type InsufficientFeeEvent = {
  queryId: bigint
  sender: Address
}

export type AcceptedRequestEvent = {
  queryId: bigint
  sender: Address
  payload: Cell
}

export class OnrampMock implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new OnrampMock(address)
  }

  static createFromConfig(config: OnrampMockConfig, code: Cell, workchain = 0) {
    const data = onrampMockConfigToCell(config)
    const init = { code, data }
    return new OnrampMock(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  // Helper method to parse events from transaction logs
  static parseInsufficientFeeEvent(cell: Cell): InsufficientFeeEvent {
    const slice = cell.beginParse()
    return {
      queryId: BigInt(slice.loadUint(64)),
      sender: slice.loadAddress(),
    }
  }

  static parseAcceptedRequestEvent(cell: Cell): AcceptedRequestEvent {
    const slice = cell.beginParse()
    return {
      queryId: BigInt(slice.loadUint(64)),
      sender: slice.loadAddress(),
      payload: slice.loadRef(),
    }
  }
}
