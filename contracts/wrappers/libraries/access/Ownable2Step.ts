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

export enum Errors {
  OnlyCallableByOwner = 132,
  CannotTransferToSelf = 1001,
  MustBeProposedOwner = 1002,
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
  pendingOwner: Address | null
}

export const builder = {
  message: {
    in: (() => {
      // Creates a new `TransferOwnership` message.
      const transferOwnership: CellCodec<TransferOwnership> = {
        encode: (msg: TransferOwnership): Builder => {
          return beginCell() // break line
            .storeUint(opcodes.in.TransferOwnership, 32)
            .storeUint(msg.queryId, 64)
            .storeAddress(msg.newOwner)
        },
        load: (src: Slice): TransferOwnership => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            newOwner: src.loadAddress(),
          }
        },
      }
      const acceptOwnership: CellCodec<AcceptOwnership> = {
        encode: (msg: AcceptOwnership): Builder => {
          return beginCell() // break line
            .storeUint(opcodes.in.AcceptOwnership, 32)
            .storeUint(msg.queryId, 64)
        },
        load: (src: Slice): AcceptOwnership => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
          }
        },
      }

      return {
        transferOwnership,
        acceptOwnership,
      }
    })(),
  },
  data: (() => {
    // Creates a new `Data` contract data cell
    const traitData: CellCodec<Data> = {
      encode: (data: Data): Builder => {
        var builder = beginCell()
        builder.storeAddress(data.owner)

        if (data.pendingOwner) {
          builder
            .storeBit(1) // Store '1' to indicate the address is present
            .storeAddress(data.pendingOwner) // Then store the address
        } else {
          builder.storeBit(0) // Store '0' to indicate the address is absent
        }
        return builder
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

export class ContractClient implements Contract, Interface {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static newAt(address: Address): ContractClient {
    return new ContractClient(address)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
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
      builder.message.in.transferOwnership.encode(body).asCell(),
    )
  }

  async sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = BigInt(0.01),
    body: AcceptOwnership,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.acceptOwnership.encode(body).asCell(),
    )
  }

  async getOwner(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('owner', [])
    return result.stack.readAddress()
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    const result = await provider.get('pendingOwner', [])
    return result.stack.readAddressOpt()
  }
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
