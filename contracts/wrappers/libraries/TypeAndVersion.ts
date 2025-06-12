import { Address, Cell, Contract, ContractProvider } from '@ton/core'

export class TypeAndVersion implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  async getTypeAndVersion(provider: ContractProvider): Promise<string> {
    const result = await provider.get('typeAndVersion', [])
    return result.stack.readString()
  }

  async getCode(provider: ContractProvider): Promise<Cell> {
    const result = await provider.get('code', [])
    return result.stack.readCell()
  }

  async getCodeHash(provider: ContractProvider): Promise<number> {
    const result = await provider.get('codeHash', [])
    return result.stack.readNumber()
  }
}
