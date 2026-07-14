import {
  Address,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core'
import { contractCode } from '../../codeLoader'

export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: Cell, code: Cell, workchain = 0) {
    const init = { code, data }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  static code(): Promise<Cell> {
    return contractCode.ccip.local('tests.lib.math')
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body })
  }

  async getSafeProd(
    p: ContractProvider,
    a: bigint,
    b: bigint,
  ): Promise<{ result: bigint; errorCode: bigint }> {
    const r = await p.get('get_safeProd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
    ])
    return {
      result: r.stack.readBigNumber(),
      errorCode: r.stack.readBigNumber(),
    }
  }
  async getSafeAdd(
    p: ContractProvider,
    a: bigint,
    b: bigint,
  ): Promise<{ result: bigint; errorCode: bigint }> {
    const r = await p.get('get_safeAdd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
    ])
    return {
      result: r.stack.readBigNumber(),
      errorCode: r.stack.readBigNumber(),
    }
  }
  async getSafePow10(
    p: ContractProvider,
    n: number,
  ): Promise<{ result: bigint; errorCode: bigint }> {
    const r = await p.get('get_safePow10', [{ type: 'int', value: BigInt(n) }])
    return {
      result: r.stack.readBigNumber(),
      errorCode: r.stack.readBigNumber(),
    }
  }
  async getMustAdd(p: ContractProvider, a: bigint, b: bigint, errCode: bigint): Promise<bigint> {
    const r = await p.get('get_mustAdd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
      { type: 'int', value: errCode },
    ])
    return r.stack.readBigNumber()
  }
  async getMustProd(p: ContractProvider, a: bigint, b: bigint, errCode: bigint): Promise<bigint> {
    const r = await p.get('get_mustProd', [
      { type: 'int', value: a },
      { type: 'int', value: b },
      { type: 'int', value: errCode },
    ])
    return r.stack.readBigNumber()
  }
  async getMustCastToCoin(p: ContractProvider, value: bigint, errCode: bigint): Promise<bigint> {
    const r = await p.get('get_mustCastToCoin', [
      { type: 'int', value: value },
      { type: 'int', value: errCode },
    ])
    return r.stack.readBigNumber()
  }
  async getMustPow10(p: ContractProvider, n: number, errCode: bigint): Promise<bigint> {
    const r = await p.get('get_mustPow10', [
      { type: 'int', value: BigInt(n) },
      { type: 'int', value: errCode },
    ])
    return r.stack.readBigNumber()
  }
}
