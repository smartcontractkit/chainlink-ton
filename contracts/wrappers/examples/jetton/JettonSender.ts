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
import { JettonClientConfig, jettonClientConfigToCell, JettonOpcodes } from './types'

export type JettonSenderConfig = {
  jettonClient: JettonClientConfig
}

export function jettonSenderConfigToCell(config: JettonSenderConfig): Cell {
  return jettonClientConfigToCell(config.jettonClient)
}

export const SenderOpcodes = {
  SEND_JETTONS_FAST: 0x6984f9bb,
  SEND_JETTONS_EXTENDED: 0xe815f1d0,
}

export type SendJettonsFastMessage = {
  queryId: bigint
  amount: bigint
  destination: Address
}

export type SendJettonsExtendedMessage = {
  queryId: bigint
  amount: bigint
  destination: Address
  customPayload: Cell
  forwardTonAmount: bigint
  forwardPayload: Cell
}

export class JettonSender implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new JettonSender(address)
  }

  static createFromConfig(config: JettonSenderConfig, code: Cell, workchain = 0) {
    const data = jettonSenderConfigToCell(config)
    const init = { code, data }
    return new JettonSender(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendJettonsFast(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: SendJettonsFastMessage
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(SenderOpcodes.SEND_JETTONS_FAST, 32)
        .storeUint(opts.message.queryId, 64)
        .storeCoins(opts.message.amount)
        .storeAddress(opts.message.destination)
        .endCell(),
    })
  }

  async sendJettonsExtended(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: SendJettonsExtendedMessage
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(SenderOpcodes.SEND_JETTONS_EXTENDED, 32)
        .storeUint(opts.message.queryId, 64)
        .storeCoins(opts.message.amount)
        .storeAddress(opts.message.destination)
        .storeRef(opts.message.customPayload)
        .storeCoins(opts.message.forwardTonAmount)
        .storeRef(opts.message.forwardPayload)
        .endCell(),
    })
  }
}
