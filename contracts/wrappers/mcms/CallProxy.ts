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
import { crc32 } from 'zlib'
import { CellCodec } from '../utils'

// @dev Top up contract with TON coins.
export type TopUp = {
  // Query ID of the change owner request.
  queryId: bigint
}

// CallProxy contract storage
export type ContractData = {
  /// ID allows multiple independent instances, since contract address depends on initial state.
  id: number // uint32

  /// The address to which calls are proxied.
  target: Address
}

export const opcodes = {
  in: {
    TopUp: crc32('CallProxy_TopUp'),
  },
  out: {},
}

export enum Errors {
  ContractMaxFunded = 101,
  ValueOutOfBounds = 102,
}

export const builder = {
  message: {
    in: {
      // Creates a new `CallProxy_TopUp` message.
      topUp: {
        encode: (msg: TopUp): Cell => {
          return beginCell() // break line
            .storeUint(opcodes.in.TopUp, 32)
            .storeUint(msg.queryId, 64)
            .endCell()
        },
        decode: (cell: Cell): TopUp => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
          }
        },
      },
    },
  },
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
    return p.get('getID', []).then((r) => r.stack.readNumber())
  }

  async getTarget(p: ContractProvider): Promise<Address> {
    return p.get('getTarget', []).then((r) => r.stack.readAddress())
  }
}
