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

import * as ownable2step from '../libraries/access/Ownable2Step'

export type RouterStorage = {
  ownable: ownable2step.Data

  onRamp: Address
}

export const Builder = {
  /// Creates a new `AccessControl_GrantRole` message.
  asStorage: (config: RouterStorage): Cell => {
    return beginCell()
      .storeAddress(config.ownable.owner)
      .storeMaybeBuilder(
        config.ownable.pendingOwner ? beginCell().storeAddress(config.ownable.pendingOwner) : null,
      )
      .storeAddress(config.onRamp)
      .endCell()
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static setRamp = 0x10000001
  static ccipSend = 0x00000001
}

export abstract class Errors {}

export class Router implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new Router(address)
  }

  static createFromConfig(config: RouterStorage, code: Cell, workchain = 0) {
    const data = Builder.asStorage(config)
    const init = { code, data }
    return new Router(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendSetRamp(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      destChainSelector: bigint
      onRamp: Address
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.setRamp, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeUint(opts.destChainSelector, 64)
        .storeAddress(opts.onRamp)
        .endCell(),
    })
  }

  async sendCcipSend(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      destChainSelector: bigint
      receiver: Buffer
      data: Cell
      tokenAmounts: Cell
      feeToken: Address
      extraArgs: Cell
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.ccipSend, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeUint(opts.destChainSelector, 64)
        // CrossChainAddress TODO: assert =< 64
        .storeUint(opts.receiver.byteLength, 8)
        .storeBuffer(opts.receiver, opts.receiver.byteLength)
        .storeRef(opts.data)
        .storeRef(opts.tokenAmounts) // TODO: pack inputs
        .storeAddress(opts.feeToken)
        .storeRef(opts.extraArgs)
        .endCell(),
    })
  }
}
