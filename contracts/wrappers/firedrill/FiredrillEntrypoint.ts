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
  Builder,
} from '@ton/core'
import * as ownable2Step from '../libraries/access/Ownable2Step'

export type FiredrillContracts = {
  firedrillOnRamp: Address
  firedrillOffRamp: Address
}

export type FiredrillEntrypointStorage = {
  id: bigint
  ownable: ownable2Step.Data
  chainSelector: bigint
  tokenAddress: Address
  firedrillContracts?: FiredrillContracts
  sSendLast: bigint
}

export type OnRamps = {
  destChainSelectors: bigint[]
  onRamp: Address
}

export type OffRamps = {
  sourceChainSelectors: bigint[]
  offRamp: Address
}

export type TimestampedPrice = {
  value: bigint
  timestamp: bigint
}

export type GasPrice = {
  executionGasPrice: bigint
  dataAvailabilityGasPrice: bigint
  timestamp: bigint
}

export function firedrillEntrypointConfigToCell(config: FiredrillEntrypointStorage): Cell {
  const ownable = beginCell()
    .storeAddress(config.ownable.owner)
    .storeAddress(config.ownable.pendingOwner)

  let firedrillContractsCell: Cell | undefined = undefined
  if (config.firedrillContracts) {
    firedrillContractsCell = beginCell()
      .storeAddress(config.firedrillContracts.firedrillOnRamp)
      .storeAddress(config.firedrillContracts.firedrillOffRamp)
      .endCell()
  }

  return beginCell()
    .storeUint(config.id, 32)
    .storeBuilder(ownable)
    .storeUint(config.chainSelector, 64)
    .storeAddress(config.tokenAddress)
    .storeMaybeRef(firedrillContractsCell)
    .storeUint(config.sSendLast, 64)
    .endCell()
}

export const Opcodes = {
  prepareRegister: 0x10000001,
  drillPendingCommitPendingQueueTxSpike: 0x10000002,
  drillPendingExecution: 0x10000003,
  drillPriceRegistries: 0x10000004,
  initRamps: 0x10000005,
}

export class FiredrillEntrypoint implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new FiredrillEntrypoint(address)
  }

  static createFromConfig(config: FiredrillEntrypointStorage, code: Cell, workchain = 0) {
    const data = firedrillEntrypointConfigToCell(config)
    const init = { code, data }
    return new FiredrillEntrypoint(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendInitRamps(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    onramp: Address,
    offramp: Address,
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.initRamps, 32)
        .storeAddress(onramp)
        .storeAddress(offramp)
        .endCell(),
    })
  }

  async sendPrepareRegister(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.prepareRegister, 32).endCell(),
    })
  }

  async sendDrillPendingCommitPendingQueueTxSpike(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      from: bigint
      to: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.drillPendingCommitPendingQueueTxSpike, 32)
        .storeUint(opts.from, 64)
        .storeUint(opts.to, 64)
        .endCell(),
    })
  }

  async sendDrillPendingExecution(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      from: bigint
      to: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.drillPendingExecution, 32)
        .storeUint(opts.from, 64)
        .storeUint(opts.to, 64)
        .endCell(),
    })
  }

  async sendDrillPriceRegistries(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.drillPriceRegistries, 32).endCell(),
    })
  }

  // Router getters
  async getOnRamp(provider: ContractProvider, destChainSelector: bigint): Promise<Address> {
    const result = await provider.get('onRamp', [{ type: 'int', value: destChainSelector }])
    return result.stack.readAddress()
  }

  async getOffRamp(provider: ContractProvider, sourceChainSelector: bigint): Promise<Address> {
    const result = await provider.get('offRamp', [{ type: 'int', value: sourceChainSelector }])
    return result.stack.readAddress()
  }

  async getOnRamps(provider: ContractProvider): Promise<OnRamps> {
    const result = await provider.get('onRamps', [])
    const destChainSelectors = result.stack.readCell()
    const onRamp = result.stack.readAddress()

    // Parse the selectors from the cell
    const selectors = [destChainSelectors.beginParse().loadUintBig(64)]

    return {
      destChainSelectors: selectors,
      onRamp,
    }
  }

  async getOffRamps(provider: ContractProvider): Promise<OffRamps> {
    const result = await provider.get('offRamps', [])
    const sourceChainSelectors = result.stack.readCell()
    const offRamp = result.stack.readAddress()

    // Parse the selectors from the cell
    const selectors = [sourceChainSelectors.beginParse().loadUintBig(64)]

    return {
      sourceChainSelectors: selectors,
      offRamp,
    }
  }

  // FeeQuoter getters
  async getStaticConfig(provider: ContractProvider): Promise<{
    maxFeeJuelsPerMsg: bigint
    linkToken: Address
    tokenPriceStalenessThreshold: bigint
  }> {
    const result = await provider.get('staticConfig', [])
    return {
      maxFeeJuelsPerMsg: result.stack.readBigNumber(),
      linkToken: result.stack.readAddress(),
      tokenPriceStalenessThreshold: result.stack.readBigNumber(),
    }
  }

  async getTokenPrice(provider: ContractProvider, token: Address): Promise<TimestampedPrice> {
    const result = await provider.get('tokenPrice', [
      { type: 'slice', cell: beginCell().storeAddress(token).endCell() },
    ])
    return {
      value: result.stack.readBigNumber(),
      timestamp: result.stack.readBigNumber(),
    }
  }

  async getDestinationChainGasPrice(
    provider: ContractProvider,
    destChainSelector: bigint,
  ): Promise<GasPrice> {
    const result = await provider.get('destinationChainGasPrice', [
      { type: 'int', value: destChainSelector },
    ])
    const cell = result.stack.readCell()
    const slice = cell.beginParse()
    return {
      executionGasPrice: slice.loadUintBig(112),
      dataAvailabilityGasPrice: slice.loadUintBig(112),
      timestamp: slice.loadUintBig(64),
    }
  }

  // Common getters
  async getChainSelector(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('chainSelector', [])
    return result.stack.readBigNumber()
  }

  async getTokenAddress(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('tokenAddress', [])
    return result.stack.readAddress()
  }

  async getOnRampAddress(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('onRampAddress', [])
    return result.stack.readAddress()
  }

  async getOffRampAddress(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('offRampAddress', [])
    return result.stack.readAddress()
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
