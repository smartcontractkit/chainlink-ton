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

  async getIsSignatureValid_secp256k1(
    p: ContractProvider,
    hash: bigint,
    sig: Cell,
    pubKey: bigint,
    parity: number,
  ): Promise<boolean> {
    return p
      .get('get_isSignatureValid_secp256k1', [
        {
          type: 'int',
          value: hash,
        },
        {
          type: 'slice',
          cell: sig,
        },
        {
          type: 'int',
          value: pubKey,
        },
        {
          type: 'int',
          value: BigInt(parity),
        },
      ])
      .then((r) => r.stack.readBoolean())
  }

  async getEVM_ecrecoverFrom(p: ContractProvider, hash: bigint, sig: Cell): Promise<bigint> {
    return p
      .get('get_evm_ecrecoverFrom', [
        {
          type: 'int',
          value: hash,
        },
        {
          type: 'slice',
          cell: sig,
        },
      ])
      .then((r) => r.stack.readBigNumber())
  }
}
