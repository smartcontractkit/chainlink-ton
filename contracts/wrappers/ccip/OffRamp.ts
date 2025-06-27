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

import { Ownable2StepConfig } from '../libraries/access/Ownable2Step'

export type OffRampStorage = {
  ownable: Ownable2StepConfig
  deployerCode: Cell
  merkleRootCode: Cell
  feeQuoter: Address
  chainSelector: bigint
  permissionlessExecutionThresholdSeconds: number
  latestPriceSequenceNumber: bigint
}

export const Builder = {
  asStorage: (config: OffRampStorage): Cell => {
    let builder = beginCell().storeAddress(config.ownable.owner)
    // TODO: use storeMaybeBuilder()
    if (config.ownable.pendingOwner) {
      builder
        .storeBit(1) // Store '1' to indicate the address is present
        .storeAddress(config.ownable.pendingOwner) // Then store the address
    } else {
      builder.storeBit(0) // Store '0' to indicate the address is absent
    }

    return (
      builder
        .storeRef(config.deployerCode)
        .storeAddress(config.feeQuoter)
        .storeUint(config.chainSelector, 64)
        .storeUint(config.permissionlessExecutionThresholdSeconds, 32)
        .storeUint(config.latestPriceSequenceNumber, 64)
        .endCell()
    )
  },
}
export abstract class Params {}

export abstract class Opcodes {}

export abstract class Errors {}

export class OffRamp implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new OffRamp(address)
  }

  static createFromConfig(config: OffRampStorage, code: Cell, workchain = 0) {
    const data = Builder.asStorage(config)
    const init = { code, data }
    return new OffRamp(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }
}
