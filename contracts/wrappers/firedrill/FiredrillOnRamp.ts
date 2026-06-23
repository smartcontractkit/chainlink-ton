import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Dictionary,
} from '@ton/core'
import * as or from '../ccip/OnRamp'

export type FiredrillOnRampStorage = {
  id: bigint
  controlAddress: Address
  chainSelector: bigint
  tokenAddress: Address
}

export type EmitCCIPMessageSent = {
  sender: Address
  sequenceNumber: bigint
}

export type DestChainConfig = {
  router: Address
  sequenceNumber: bigint
  allowlistEnabled: boolean
  allowedSenders: Dictionary<Address, boolean>
}

export function firedrillOnRampConfigToCell(config: FiredrillOnRampStorage): Cell {
  return beginCell()
    .storeUint(config.id, 32)
    .storeAddress(config.controlAddress)
    .storeUint(config.chainSelector, 64)
    .storeAddress(config.tokenAddress)
    .endCell()
}

export const Opcodes = {
  emitCCIPMessageSent: 0x00000001,
}

export class FiredrillOnRamp implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new FiredrillOnRamp(address)
  }

  static createFromConfig(config: FiredrillOnRampStorage, code: Cell, workchain = 0) {
    const data = firedrillOnRampConfigToCell(config)
    const init = { code, data }
    return new FiredrillOnRamp(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendEmitCCIPMessageSent(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      sender: Address
      sequenceNumber: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.emitCCIPMessageSent, 32)
        .storeAddress(opts.sender)
        .storeUint(opts.sequenceNumber, 64)
        .endCell(),
    })
  }

  async getStaticConfig(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('staticConfig', [])
    return result.stack.readBigNumber()
  }

  async getDynamicConfig(provider: ContractProvider): Promise<or.DynamicConfig> {
    const result = await provider.get('dynamicConfig', [])
    return {
      addresses: or.builder.data.addresses.load(result.stack.readCell().beginParse()),
      tokenRegistryDeployment: or.builder.data.tokenRegistryDeployment.load(
        result.stack.readCell().beginParse(),
      ),
      reserve: result.stack.readBigNumber(),
    }
  }

  async getDestChainConfig(
    provider: ContractProvider,
    destChainSelector: bigint,
  ): Promise<DestChainConfig> {
    const result = await provider.get('destChainConfig', [
      { type: 'int', value: destChainSelector },
    ])
    return {
      router: result.stack.readAddress(),
      sequenceNumber: result.stack.readBigNumber(),
      allowlistEnabled: result.stack.readBoolean(),
      allowedSenders:
        result.stack
          .readCellOpt()
          ?.beginParse()
          .loadDictDirect(Dictionary.Keys.Address(), Dictionary.Values.Bool()) ??
        Dictionary.empty(),
    }
  }
}
