import { Address, Cell, Contract, ContractProvider } from '@ton/core'

export class TypeAndVersion {
  async getTypeAndVersion(provider: ContractProvider): Promise<string> {
    const result = await provider.get('typeAndVersion', [])
    return result.stack.readString()
  }

  async getCode(provider: ContractProvider): Promise<Cell> {
    const result = await provider.get('code', [])
    return result.stack.readCell()
  }

  async getCodeHash(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('codeHash', [])
    return result.stack.readBigNumber()
  }
}
