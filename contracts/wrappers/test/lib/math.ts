import {
  Address,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core'

export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static newAt(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: Cell, code: Cell, workchain = 0) {
    const init = { code, data }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body })
  }

  async getSafeProd(p: ContractProvider, a: bigint, b: bigint) {
    return p.get('get_safeProd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
    ])
  }
  async getSafeAdd(p: ContractProvider, a: bigint, b: bigint) {
    return p.get('get_safeAdd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
    ])
  }
  async getMustAdd(p: ContractProvider, a: bigint, b: bigint, errCode: bigint) {
    return p.get('get_mustAdd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
      { type: 'int', value: errCode },
    ])
  }
  async getMustProd(p: ContractProvider, a: bigint, b: bigint, errCode: bigint) {
    return p.get('get_mustProd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
      { type: 'int', value: errCode },
    ])
  }
}
