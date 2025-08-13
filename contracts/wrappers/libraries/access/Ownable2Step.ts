import {
  Address,
  beginCell,
  Cell,
  Builder,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core'
import { crc32 } from 'zlib'
import { CellCodec } from '../../utils'

// @dev Message sent by the owner to transfer ownership of a contract.
export type TransferOwnership = {
  // Query ID of the change owner request.
  queryId: bigint
  // New owner address.
  newOwner: Address
}

/// Message sent by the pending owner to accept ownership of a contract.
export type AcceptOwnership = {
  // Query ID of the change owner request.
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
    in: {
      // Creates a new `TransferOwnership` message.
      transferOwnership: {
        encode: (msg: TransferOwnership): Cell => {
          return beginCell() // break line
            .storeUint(opcodes.in.TransferOwnership, 32)
            .storeUint(msg.queryId, 64)
            .storeAddress(msg.newOwner)
            .endCell()
        },
        decode: (cell: Cell): TransferOwnership => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
            newOwner: s.loadAddress(),
          }
        },
      },
      acceptOwnership: {
        encode: (msg: AcceptOwnership): Cell => {
          return beginCell() // break line
            .storeUint(opcodes.in.AcceptOwnership, 32)
            .storeUint(msg.queryId, 64)
            .endCell()
        },
        decode: (cell: Cell): AcceptOwnership => {
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
    // Creates a new `Data` contract data cell
    const traitData: CellCodec<Data> = {
      encode: (data: Data): Cell => {
        let _pendingOwnerMaybe = data.pendingOwner
          ? beginCell().storeAddress(data.pendingOwner)
          : null
        let ownable = beginCell().storeAddress(data.owner).storeMaybeBuilder(_pendingOwnerMaybe)
        return beginCell().storeBuilder(ownable).endCell()
      },
      decode: (cell: Cell): Data => {
        const s = cell.beginParse()
        const owner = s.loadAddress()
        const pendingOwner = s.loadMaybeAddress()
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

export function storeOwnable2StepConfig(builder: Builder, config: Data) {
  builder.storeAddress(config.owner)

  if (config.pendingOwner) {
    builder
      .storeBit(1) // Store '1' to indicate the address is present
      .storeAddress(config.pendingOwner) // Then store the address
  } else {
    builder.storeBit(0) // Store '0' to indicate the address is absent
  }
}

export class ContractClient implements Contract {
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
    value: bigint = 0n,
    body: TransferOwnership,
  ) {
    return this.sendInternal(p, via, value, builder.message.in.transferOwnership.encode(body))
  }

  async sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: AcceptOwnership,
  ) {
    return this.sendInternal(p, via, value, builder.message.in.acceptOwnership.encode(body))
  }

  async getOwner(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('owner', [])
    return result.stack.readAddress()
  }
}
