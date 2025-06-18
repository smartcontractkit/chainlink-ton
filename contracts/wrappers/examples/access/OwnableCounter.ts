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
import { Ownable2Step, Ownable2StepConfig } from '../../libraries/access/Ownable2Step'

export type OwnableCounterStorage = {
  id: number
  count: number
  ownable: Ownable2StepConfig
}

export function counterConfigToCell(config: OwnableCounterStorage): Cell {
  const builder = beginCell()
    .storeUint(config.id, 64)
    .storeUint(config.count, 32)
    .storeAddress(config.ownable.owner)

  if (config.ownable.pendingOwner) {
    builder
      .storeBit(1) // Store '1' to indicate the address is present
      .storeAddress(config.ownable.pendingOwner) // Then store the address
  } else {
    builder.storeBit(0) // Store '0' to indicate the address is absent
  }

  return builder.endCell()
}

export const Opcodes = {
  OP_SET_COUNT: 0x00000001,
}

export class OwnableCounter extends Ownable2Step {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
  }

  static createFromAddress(address: Address) {
    return new OwnableCounter(address)
  }

  static createFromConfig(config: OwnableCounterStorage, code: Cell, workchain = 0) {
    const data = counterConfigToCell(config)
    const init = { code, data }
    return new OwnableCounter(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendSetCount(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
      count: number
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.OP_SET_COUNT, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .storeUint(opts.count, 32)
        .endCell(),
    })
  }

  async getCounter(provider: ContractProvider): Promise<number> {
    const result = await provider.get('counter', [])
    return result.stack.readNumber()
  }

  async getOwner(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('owner', [])
    return result.stack.readAddress()
  }

  async getId(provider: ContractProvider): Promise<number> {
    const result = await provider.get('id', [])
    return result.stack.readNumber()
  }
}
