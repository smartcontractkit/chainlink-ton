import { Cell, ContractProvider, Slice } from '@ton/core'

export async function getTypeAndVersion(provider: ContractProvider): Promise<[Slice, Slice]> {
  const result = await provider.get('typeAndVersion', [])
  return [result.stack.readCell().beginParse(), result.stack.readCell().beginParse()]
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
  getTypeAndVersion(provider: ContractProvider): Promise<[Slice, Slice]>
}
