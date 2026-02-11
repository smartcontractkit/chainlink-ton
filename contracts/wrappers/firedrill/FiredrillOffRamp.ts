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

import { Config, CrossChainAddress, SourceChainConfig } from '../ccip/OffRamp'
import { OCR3Config } from '../libraries/ocr/MultiOCR3Base'

export type FiredrillOffRampStorage = {
  id: bigint
  controlAddress: Address
  chainSelector: bigint
  onRampAddress: CrossChainAddress
}

export function firedrillOffRampStorageToCell(config: FiredrillOffRampStorage): Cell {
  return beginCell()
    .storeUint(config.id, 32)
    .storeAddress(config.controlAddress)
    .storeUint(config.chainSelector, 64)
    .storeUint(config.onRampAddress.byteLength, 8)
    .storeBuffer(config.onRampAddress, config.onRampAddress.byteLength)
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

  async getConfig(provider: ContractProvider): Promise<Config> {
    const result = await provider.get('config', [])
    return {
      chainSelector: result.stack.readBigNumber(),
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
    const onRampSlice = result.stack.readCell().beginParse()
    const remaining = onRampSlice.remainingBits
    const onRamp = onRampSlice.loadBuffer(remaining / 8)

    return {
      router,
      isEnabled,
      minSeqNr,
      isRMNVerificationDisabled,
      onRamp,
    }
  }
}
