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

import * as of from '../gen/ccip/OffRamp'

export type FiredrillOffRampStorage = {
  id: bigint
  controlAddress: Address
  chainSelector: bigint
  onRampAddress: of.CrossChainAddress
}

export function firedrillOffRampStorageToCell(config: FiredrillOffRampStorage): Cell {
  return beginCell()
    .storeUint(config.id, 32)
    .storeAddress(config.controlAddress)
    .storeUint(config.chainSelector, 64)
    .storeBuilder(of.CrossChainAddress.toCell(config.onRampAddress).asBuilder())
    .endCell()
}

export const Opcodes = {
  emitSourceChainConfigSet: 0x00000002,
  emitCommitReportAccepted: 0x00000003,
}

export class FiredrillOffRamp implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new FiredrillOffRamp(address)
  }

  static createFromConfig(config: FiredrillOffRampStorage, code: Cell, workchain = 0) {
    const data = firedrillOffRampStorageToCell(config)
    const init = { code, data }
    return new FiredrillOffRamp(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendEmitSourceChainConfigSet(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.emitSourceChainConfigSet, 32).endCell(),
    })
  }

  async sendEmitCommitReportAccepted(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      minSeqNr: bigint
      maxSeqNr: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.emitCommitReportAccepted, 32)
        .storeUint(opts.minSeqNr, 64)
        .storeUint(opts.maxSeqNr, 64)
        .endCell(),
    })
  }

  async getConfig(provider: ContractProvider): Promise<of.Config> {
    const result = await provider.get('config', [])
    return of.Config.create({
      chainSelector: result.stack.readBigNumber(),
      tokenAdminRegistry: result.stack.readAddress(),
      feeQuoter: result.stack.readAddress(),
      permissionlessExecutionThresholdSeconds: result.stack.readBigNumber(),
    })
  }

  async getSourceChainConfig(
    provider: ContractProvider,
    sourceChainSelector: bigint,
  ): Promise<of.SourceChainConfig> {
    const result = await provider.get('sourceChainConfig', [
      { type: 'int', value: sourceChainSelector },
    ])
    const router = result.stack.readAddress()
    const isEnabled = result.stack.readBoolean()
    const minSeqNr = result.stack.readBigNumber()
    const isRMNVerificationDisabled = result.stack.readBoolean()
    const onRamp = result.stack.readCell().beginParse()

    return of.SourceChainConfig.create({
      router,
      isEnabled,
      minSeqNr,
      isRMNVerificationDisabled,
      onRamp,
    })
  }
}
