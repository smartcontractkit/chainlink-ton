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

export type JettonReceiverConfig = {
  jettonClient: JettonClientConfig
  amountChecker: bigint
  payloadChecker: Cell
}

export function jettonReceiverConfigToCell(config: JettonReceiverConfig): Cell {
  return beginCell()
    .storeRef(jettonClientConfigToCell(config.jettonClient))
    .storeCoins(config.amountChecker)
    .storeSlice(config.payloadChecker.beginParse())
    .endCell()
}

export const ReceiverConstants = {
  INCORRECT_SENDER_ERROR: ErrorCodes.INCORRECT_SENDER,
}

export class JettonReceiver implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new JettonReceiver(address)
  }

  static createFromConfig(config: JettonReceiverConfig, code: Cell, workchain = 0) {
    const data = jettonReceiverConfigToCell(config)
    const init = { code, data }
    return new JettonReceiver(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async getAmountChecker(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('amountChecker', [])
    return result.stack.readBigNumber()
  }

  async getPayloadChecker(provider: ContractProvider): Promise<Cell> {
    const result = await provider.get('payloadChecker', [])
    return result.stack.readCell()
  }
}
