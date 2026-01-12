import {
  Address,
  beginCell,
  Cell,
  Builder,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { crc32 } from 'zlib'
import { CellCodec } from '../../utils'
import { Maybe } from '@ton/core/dist/utils/maybe'

export const FACILITY_NAME = 'com.chainlink.ton.lib.access.Ownable2Step'
export const FACILITY_ID = 204
export const ERROR_CODE = FACILITY_ID * 100

export enum Errors {
  OnlyCallableByOwner = ERROR_CODE,
  CannotTransferToSelf,
  MustBeProposedOwner,
}

// @dev Message sent by the owner to transfer ownership of a contract.
export type TransferOwnership = {
  // Query ID of the change request.
  queryId: bigint
  // New owner address.
  newOwner: Address
}

/// Message sent by the pending owner to accept ownership of a contract.
export type AcceptOwnership = {
  // Query ID of the change request.
  queryId: bigint
}

// TODO: crc32 opcode resolution
export const opcodes = {
  in: {
    TransferOwnership: crc32('Ownable2Step_TransferOwnership'),
    AcceptOwnership: crc32('Ownable2Step_AcceptOwnership'),
  },
}

/// Ownable2Step trait provides ownership two-step transfer functionality.
export type Data = {
  owner: Address
  pendingOwner: Maybe<Address>
}

export const builder = {
  message: {
    in: (() => {
      // Creates a new `TransferOwnership` message.
      function transferOwnershipWithRole(prefix?: number): CellCodec<TransferOwnership> {
        return {
          encode: (msg: TransferOwnership): Builder => {
            return beginCell() // break line
              .storeUint(prefix ?? 0, prefix ? 32 : 0)
              .storeUint(opcodes.in.TransferOwnership, 32)
              .storeUint(msg.queryId, 64)
              .storeAddress(msg.newOwner)
          },
          load: (src: Slice): TransferOwnership => {
            if (prefix) {
              src.skip(32) // skip prefix
            }
            src.skip(32) // skip opcode
            return {
              queryId: src.loadUintBig(64),
              newOwner: src.loadAddress(),
            }
          },
        }
      }
      function acceptOwnershipWithRole(prefix?: number): CellCodec<AcceptOwnership> {
        return {
          encode: (msg: AcceptOwnership): Builder => {
            return beginCell() // break line
              .storeUint(prefix ?? 0, prefix ? 32 : 0)
              .storeUint(opcodes.in.AcceptOwnership, 32)
              .storeUint(msg.queryId, 64)
          },
          load: (src: Slice): AcceptOwnership => {
            if (prefix) {
              src.skip(32) // skip prefix
            }
            src.skip(32) // skip opcode
            return {
              queryId: src.loadUintBig(64),
            }
          },
        }
      }

      return {
        transferOwnershipWithRole,
        transferOwnership: transferOwnershipWithRole(),
        acceptOwnershipWithRole,
        acceptOwnership: acceptOwnershipWithRole(),
      }
    })(),
  },
  data: (() => {
    // Creates a new `Data` contract data cell
    const traitData: CellCodec<Data> = {
      encode: (data: Data): Builder => {
        return (
          beginCell()
            .storeAddress(data.owner)
            // this correctly encodes maybeAddress now
            .storeAddress(data.pendingOwner)
        )
      },
      load: (src: Slice): Data => {
        const owner = src.loadAddress()
        const pendingOwner = src.loadMaybeAddress()
        return {
          owner,
          pendingOwner,
        }
      },
    }

    return {
      traitData,
    }
  })(),
}

export type OwnableRole = {
  opcode: number
  getter: string
}

export class ContractClient implements Contract, Interface {
  constructor(
    readonly address: Address,
    readonly role?: OwnableRole,
  ) {}

  static createFromAddress(
    address: Address,
    role?: { opcode: number; getter: string },
  ): ContractClient {
    return new ContractClient(address, role)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendTransferOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = BigInt(0.01),
    body: TransferOwnership,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.transferOwnershipWithRole(this.role?.opcode).encode(body).asCell(),
    )
  }

  async sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = BigInt(0.01),
    body: AcceptOwnership,
    prefix?: number,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.acceptOwnershipWithRole(this.role?.opcode).encode(body).asCell(),
    )
  }

  async getOwner(provider: ContractProvider): Promise<Address> {
    const result = await provider.get(prefixGetter(this.role?.getter, 'owner'), [])
    return result.stack.readAddress()
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    const result = await provider.get(prefixGetter(this.role?.getter, 'pendingOwner'), [])
    return result.stack.readAddressOpt()
  }
}

function prefixGetter(getter: string | undefined, field: string): string {
  return `${getter ? getter + '_' : ''}${field}`
}

export interface Interface extends Contract {
  getOwner(p: ContractProvider): Promise<Address>
  getPendingOwner(p: ContractProvider): Promise<Address | null>
  sendTransferOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: TransferOwnership,
  ): Promise<void>
  sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: AcceptOwnership,
  ): Promise<void>
}
