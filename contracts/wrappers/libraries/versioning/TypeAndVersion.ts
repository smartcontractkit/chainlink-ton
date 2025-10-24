import { Cell, ContractProvider } from '@ton/core'

export async function getTypeAndVersion(
  provider: ContractProvider,
): Promise<{ type: string; version: string }> {
  const result = await provider.get('typeAndVersion', [])
  return { type: result.stack.readString(), version: result.stack.readString() }
}

export async function getCode(provider: ContractProvider): Promise<Cell> {
  const state = await provider.getState()
  if (state.state.type !== 'active') {
    throw new Error('Contract is not active: ' + state.state.type.toString())
  }
  if (state.state.code == null) {
    throw new Error('Contract has no code')
  }
  return Cell.fromBoc(state.state.code)[0]
}

export async function getCodeHash(provider: ContractProvider): Promise<bigint> {
  const code = await getCode(provider)
  const hash = code.hash()
  return BigInt('0x' + hash.toString('hex'))
}

export interface Interface {
  getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }>
  getCode(provider: ContractProvider): Promise<Cell>
  getCodeHash(provider: ContractProvider): Promise<bigint>
}
