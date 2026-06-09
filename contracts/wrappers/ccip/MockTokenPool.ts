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
import { compile } from '@ton/blueprint'

export const ARTIFACT_NAME = 'ccip.test.mockTokenPool'

// The MockTokenPool contract declares no storage, so its data cell is empty.
export class MockTokenPool implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new MockTokenPool(address)
  }

  static createFromConfig(code: Cell, workchain = 0) {
    const data = beginCell().endCell()
    const init = { code, data }
    return new MockTokenPool(contractAddress(workchain, init), init)
  }

  static code(): Promise<Cell> {
    return compile(ARTIFACT_NAME)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }
}
