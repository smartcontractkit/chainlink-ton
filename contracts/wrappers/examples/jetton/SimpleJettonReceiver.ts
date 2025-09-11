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
import { JettonClientConfig, builder } from './types'

export type SimpleJettonReceiverConfig = {
  jettonClient: JettonClientConfig
  amountChecker: bigint
  payloadChecker: Cell | null
}

export function simpleJettonReceiverConfigToCell(config: SimpleJettonReceiverConfig): Cell {
  const s = beginCell()

  // Store JettonClient
  s.storeRef(builder.data.traitData.encode(config.jettonClient).asCell())

  // Store amountChecker
  s.storeCoins(config.amountChecker)

  // Store payloadChecker (optional cell)
  if (config.payloadChecker) {
    s.storeBit(1).storeRef(config.payloadChecker)
  } else {
    s.storeBit(0)
  }

  return s.endCell()
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
      body: Cell.EMPTY,
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
