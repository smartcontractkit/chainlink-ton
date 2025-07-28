import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core'

import { Ownable2StepConfig } from '../libraries/access/Ownable2Step'
import { OCR3Base } from '../libraries/ocr/MultiOCR3Base'

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
    return (
      beginCell()
        .storeAddress(config.ownable.owner)
        .storeMaybeBuilder(
          config.ownable.pendingOwner
            ? beginCell().storeAddress(config.ownable.pendingOwner)
            : null,
        )
        .storeRef(config.deployerCode)
        .storeRef(config.merkleRootCode)
        .storeAddress(config.feeQuoter)
        // empty OCR3Base::
        .storeUint(1, 8) //chainId
        .storeBit(false)
        .storeBit(false)
        .storeUint(config.chainSelector, 64)
        .storeUint(config.permissionlessExecutionThresholdSeconds, 32)
        .storeDict(Dictionary.empty()) // sourceChainConfigs
        .storeUint(64, 16) // keyLen
        .storeUint(config.latestPriceSequenceNumber, 64)
        .endCell()
    )
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static commit = 0x00000001
  static execute = 0x00000002
}

export abstract class Errors {}

export class OffRamp extends OCR3Base {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
  }

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

  async sendCommit(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      reportContext: Cell
      report: Cell
      signatures: Cell
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.commit, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(opts.reportContext)
        .storeRef(opts.report)
        .storeRef(opts.signatures)
        .endCell(),
    })
  }

  async sendExecute(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      reportContext: Cell
      report: Cell
      signatures: Cell
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.execute, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(opts.reportContext)
        .storeRef(opts.report)
        .storeRef(opts.signatures)
        .endCell(),
    })
  }
}
