import { SandboxContract } from '@ton/sandbox'
import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  ContractABI,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { loadContractCode } from '../../codeLoader'

import { CellCodec } from '../../utils'
import * as ownable2step from '../../libraries/access/Ownable2Step'
import * as typeAndVersion from '../../libraries/versioning/TypeAndVersion'
import { Maybe } from '@ton/core/dist/utils/maybe'

/// @dev Message to set the contract value.
export type SetValue = {
  queryID: bigint
  value: number
}

/// Message to drain the contract balance.
export type Drain = {}

export const opcodes = {
  in: {
    SetValue: 0xed2287f4,
    drain: 0xfd475c25,
  },
  out: {},
}

export type ContractData = {
  /// ID allows multiple independent instances, since contract address depends on initial state.
  id: bigint | number // uint32
  value: number // uint32
}

export const builder = {
  message: {
    in: (() => {
      // Creates a new `setValue` message.
      const setValue: CellCodec<SetValue> = {
        encode: (msg: SetValue): Builder => {
          return beginCell() // break line
            .storeUint(opcodes.in.SetValue, 32)
            .storeUint(msg.queryID, 64)
            .storeUint(msg.value, 32)
        },
        load: (src: Slice): SetValue => {
          src.skip(32) // skip opcode
          return {
            queryID: src.loadUintBig(64),
            value: src.loadUint(32),
          }
        },
      }
      // Creates a new `IncreaseCount` message.
      const drain: CellCodec<Drain> = {
        encode: (msg: Drain): Builder => {
          return beginCell().storeUint(opcodes.in.drain, 32)
        },
        load: (src: Slice): Drain => {
          src.skip(32) // skip opcode
          return {}
        },
      }

      return { setValue, drain }
    })(),
  },
  data: (() => {
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Builder => {
        return beginCell().storeUint(data.id, 32).storeUint(data.value, 32)
      },
      load: (src: Slice): ContractData => {
        return {
          id: src.loadUintBig(32),
          value: src.loadUint(32),
        }
      },
    }

    return {
      contractData,
    }
  })(),
}

export class ContractClient implements Contract, typeAndVersion.Interface {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
    readonly abi?: Maybe<ContractABI>,
  ) {
    this.abi = {
      name: 'Freezer',
    }
  }

  static createFromAddress(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static createFromConfig(data: ContractData, code: Cell, workchain = 0): ContractClient {
    const init = { code, data: builder.data.contractData.encode(data).asCell() }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  static createFromFrozen(
    contract: SandboxContract<ContractClient>,
    stateInit: { code: Cell; data: Cell },
  ): any {
    return new ContractClient(contract.address, stateInit)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendDeploy(p: ContractProvider, via: Sender, value: bigint): Promise<void> {
    const body = Cell.EMPTY
    await this.sendInternal(p, via, value, body)
  }

  async sendSetValue(p: ContractProvider, via: Sender, opts: { value: bigint; body: SetValue }) {
    return this.sendInternal(
      p,
      via,
      opts.value,
      builder.message.in.setValue.encode(opts.body).asCell(),
    )
  }

  async sendDrain(provider: ContractProvider, via: Sender, value: bigint): Promise<void> {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.drain.encode({}).asCell(),
    })
  }

  static code(): Promise<Cell> {
    return loadContractCode('examples.funding.Freezer')
  }

  async getValue(provider: ContractProvider): Promise<number> {
    const result = await provider.get('value', [])
    return result.stack.readNumber()
  }

  async getId(provider: ContractProvider): Promise<number> {
    const result = await provider.get('id', [])
    return result.stack.readNumber()
  }

  // Delegate TypeAndVersion methods
  async getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    return typeAndVersion.getTypeAndVersion(provider)
  }

  async getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }

  async getCodeHash(provider: ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
  }
}
