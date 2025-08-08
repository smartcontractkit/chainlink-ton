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
import { CellCodec } from '../utils'

// CallProxy contract storage
export type ContractData = {
  /// ID allows multiple independent instances, since contract address depends on initial state.
  id: number // uint32

  /// The address to which calls are proxied.
  target: Address
}

export const builder = {
  data: (() => {
    // Creates a new `CallProxy_Data` contract data cell
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Cell => {
        return beginCell().storeUint(data.id, 32).storeAddress(data.target).endCell()
      },
      decode: (cell: Cell): ContractData => {
        const s = cell.beginParse()
        return {
          id: s.loadUint(32),
          target: s.loadAddress(),
        }
      },
    }

    return {
      contractData,
    }
  })(),
}

export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static newAt(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0) {
    const init = { code, data: builder.data.contractData.encode(data) }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  // --- Getters ---

  async getID(p: ContractProvider): Promise<number> {
    return p.get('getId', []).then((r) => r.stack.readNumber())
  }

  async getTarget(p: ContractProvider): Promise<Address> {
    return p.get('getTarget', []).then((r) => r.stack.readAddress())
  }
}
