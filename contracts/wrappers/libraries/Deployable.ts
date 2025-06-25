import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core'

export type DeployableStorage = {
  owner: Address,
  ty: number,
  id: Cell,
}

export type DestChainConfig = {
  router: Address,
  sequenceNumber: number,
  allowlistEnabled: boolean,
  allowedSenders: Dictionary<Address, boolean>,
}

export const Builder = {
  asStorage: (config: DeployableStorage): Cell => {
    return  beginCell()
      .storeAddress(config.owner)
      .storeUint(config.ty, 16)
      .storeRef(config.id)
      .endCell()
  },
}
export abstract class Params {
}

export abstract class Opcodes {
}

export abstract class Errors {
}

export class Deployable implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}


  static createFromAddress(address: Address) {
    return new Deployable(address)
  }

  static createFromConfig(config: DeployableStorage, code: Cell, workchain = 0) {
    const data = Builder.asStorage(config)
    const init = { code, data }
    return new Deployable(contractAddress(workchain, init), init)
  }

  async sendInitialize(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    // data, code
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

}
