import { Address, Cell, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core'

export class ContractClient {
  constructor(
    readonly address: Address,
    readonly init?: {
      code: Cell
    },
  ) {}

  static createFromAddress(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static createFromConfig(code: Cell, workchain = 0): ContractClient {
    const init = {
      code,
      data: Cell.EMPTY,
    }
    return new ContractClient(contractAddress(workchain, init), init)
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
      bounce: false,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }
}
