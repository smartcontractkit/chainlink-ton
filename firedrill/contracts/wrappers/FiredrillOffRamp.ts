import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
  Builder,
} from '@ton/core'

export type FiredrillOffRampConfig = {
  id: bigint
  controlAddress: Address
  chainSelector: bigint
  onRampAddress: Address
}

export type FiredrillOffRampStorage = {
  id: bigint
  controlAddress: Address
  chainSelector: bigint
  onRampAddress: Address
}

export type SourceChainConfig = {
  router: Address
  isEnabled: boolean
  minSeqNr: bigint
  isRMNVerificationDisabled: boolean
  onRamp: Buffer
}

export function firedrillOffRampConfigToCell(config: FiredrillOffRampConfig): Cell {
  return beginCell()
    .storeUint(config.id, 32)
    .storeAddress(config.controlAddress)
    .storeUint(config.chainSelector, 64)
    .storeAddress(config.onRampAddress)
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

  static createFromConfig(config: FiredrillOffRampConfig, code: Cell, workchain = 0) {
    const data = firedrillOffRampConfigToCell(config)
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

  async sendEmitSourceChainConfigSet(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
  ) {
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

  async getStaticConfig(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('staticConfig', [])
    return result.stack.readBigNumber()
  }

  async getDynamicConfig(provider: ContractProvider): Promise<{
    feeQuoter: Address
    permissionlessExecutionThresholdSeconds: number
  }> {
    const result = await provider.get('dynamicConfig', [])
    return {
      feeQuoter: result.stack.readAddress(),
      permissionlessExecutionThresholdSeconds: result.stack.readNumber(),
    }
  }

  async getSourceChainConfig(
    provider: ContractProvider,
    sourceChainSelector: bigint,
  ): Promise<SourceChainConfig> {
    const result = await provider.get('sourceChainConfig', [
      { type: 'int', value: sourceChainSelector },
    ])
    const router = result.stack.readAddress()
    const isEnabled = result.stack.readBoolean()
    const minSeqNr = result.stack.readBigNumber()
    const isRMNVerificationDisabled = result.stack.readBoolean()
    const onRamp = result.stack.readCell().beginParse().loadBuffer(result.stack.readCell().beginParse().remainingBits / 8)
    
    return {
      router,
      isEnabled,
      minSeqNr,
      isRMNVerificationDisabled,
      onRamp,
    }
  }
}
