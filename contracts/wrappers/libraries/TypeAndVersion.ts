import { Address, Cell, Contract, ContractProvider } from '@ton/core'

export async function getTypeAndVersion(
  provider: ContractProvider,
): Promise<{ type: string; version: string }> {
  const result = await provider.get('typeAndVersion', [])
  return { type: result.stack.readString(), version: result.stack.readString() }
}

export async function getCode(provider: ContractProvider): Promise<Cell> {
  const result = await provider.get('code', [])
  return result.stack.readCell()
}

export async function getCodeHash(provider: ContractProvider): Promise<bigint> {
  const result = await provider.get('codeHash', [])
  return result.stack.readBigNumber()
}

export interface TypeAndVersion {
  getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }>
  getCode(provider: ContractProvider): Promise<Cell>
  getCodeHash(provider: ContractProvider): Promise<bigint>
}
