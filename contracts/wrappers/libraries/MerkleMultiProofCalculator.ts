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

export type MerkleMultiProofCalculatorStorage = {
  id: number
  root: bigint
}

export function MerkleRootCalculatorToCell(config: MerkleMultiProofCalculatorStorage): Cell {
  return beginCell().storeUint(config.id, 64).storeUint(config.root, 256).endCell()
}

export const Opcodes = {
  OP_MERKLE_ROOT: 0x00000001,
}

export class MerkleMultiProofCalculator implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new MerkleMultiProofCalculator(address)
  }

  static createFromConfig(config: MerkleMultiProofCalculatorStorage, code: Cell, workchain = 0) {
    const data = MerkleRootCalculatorToCell(config)
    const init = { code, data }
    return new MerkleMultiProofCalculator(contractAddress(workchain, init), init)
  }

  async sendMerkleRoot(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    leaves: Cell,
    levesLen: number,
    proofs: Cell,
    proofsLen: number,
    proofFlagBits: bigint,
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.OP_MERKLE_ROOT, 32)
        .storeUint(0, 64)
        .storeRef(leaves)
        .storeUint(levesLen, 16)
        .storeRef(proofs)
        .storeUint(proofsLen, 16)
        .storeUint(proofFlagBits, 256)
        .endCell(),
    })
  }

  async getRoot(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('root', [])
    return result.stack.readBigNumber()
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }
}
