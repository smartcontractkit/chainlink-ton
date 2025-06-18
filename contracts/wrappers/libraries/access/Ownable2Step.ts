import {
  Address,
  beginCell,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { SandboxContract, SendMessageResult } from '@ton/sandbox'

import { crc32 } from 'zlib'

export const Opcodes = {
  OP_TRANSFER_OWNERSHIP: crc32('Ownable2Step_TransferOwnership'),
  OP_ACCEPT_OWNERHSIP: crc32('Ownable2Step_AcceptOwnership'),
}

export type Ownable2StepConfig = {
  owner: Address
  pendingOwner: Address | null
}

export class Ownable2Step {
  async sendTransferOwnership(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
      newOwner: Address
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.OP_TRANSFER_OWNERSHIP, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .storeAddress(opts.newOwner)
        .endCell(),
    })
  }

  async sendAcceptOwnership(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.OP_ACCEPT_OWNERHSIP, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .endCell(),
    })
  }
}
