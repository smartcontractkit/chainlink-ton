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

export const ARTIFACT_NAME = 'ccip.TokenRegistry'

export type TokenInfo = {
  tokenPool: Address
  minterAddress: Address
  enabled: boolean
}

export type TokenRegistryStorage = {
  info: TokenInfo
}

export function storageToCell(data: TokenRegistryStorage): Cell {
  return beginCell()
    .storeAddress(data.info.tokenPool)
    .storeAddress(data.info.minterAddress)
    .storeBit(data.info.enabled)
    .endCell()
}

export class TokenRegistry implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new TokenRegistry(address)
  }

  static createFromConfig(config: TokenRegistryStorage, code: Cell, workchain = 0) {
    const data = storageToCell(config)
    const init = { code, data }
    return new TokenRegistry(contractAddress(workchain, init), init)
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
