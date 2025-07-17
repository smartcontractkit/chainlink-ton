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
import { JettonClientConfig, jettonClientConfigToCell } from './types'

export type SimpleJettonReceiverConfig = {
  jettonClient: JettonClientConfig
  amountChecker: bigint
  payloadChecker: Cell | null
}

export function simpleJettonReceiverConfigToCell(config: SimpleJettonReceiverConfig): Cell {
  const builder = beginCell()

  // Store JettonClient
  builder.storeRef(jettonClientConfigToCell(config.jettonClient))

  // Store amountChecker
  builder.storeCoins(config.amountChecker)

  // Store payloadChecker (optional cell)
  if (config.payloadChecker) {
    builder.storeBit(1).storeRef(config.payloadChecker)
  } else {
    builder.storeBit(0)
  }

  return builder.endCell()
}

export class SimpleJettonReceiver implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new SimpleJettonReceiver(address)
  }

  static createFromConfig(config: SimpleJettonReceiverConfig, code: Cell, workchain = 0) {
    const data = simpleJettonReceiverConfigToCell(config)
    const init = { code, data }
    return new SimpleJettonReceiver(contractAddress(workchain, init), init)
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

  async getPayloadChecker(provider: ContractProvider): Promise<Cell | null> {
    const result = await provider.get('payloadChecker', [])
    const hasPayload = result.stack.readBoolean()
    if (hasPayload) {
      return result.stack.readCell()
    }
    return null
  }
}
