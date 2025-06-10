import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  TupleItem,
  TupleReader,
} from '@ton/core'

export class GenericContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new GenericContract(address)
  }

  static createFromData(data: Cell, code: Cell, workchain = 0) {
    const init = { code, data }
    return new GenericContract(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async send(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    })
  }

  async get(
    provider: ContractProvider,
    name: string | number,
    args: TupleItem[],
  ): Promise<TupleReader> {
    const result = await provider.get(name, args)
    return result.stack
  }
}
