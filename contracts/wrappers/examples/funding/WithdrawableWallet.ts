import {
  Address,
  beginCell,
  Builder,
  Cell,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { compile } from '@ton/blueprint'
import * as withdrawable from '../../libraries/funding/Withdrawable'
import * as typeAndVersion from '../../libraries/TypeAndVersion'
import * as ownable2step from '../../libraries/access/Ownable2Step'
import { CellCodec } from '../../utils'

export const FACILITY_NAME = 'com.chainlink.ton.examples.funding.WithdrawableWallet'
export const CONTRACT_VERSION = '1.0.0'

export type Errors = ownable2step.Errors

export type WalletConfig = {
  id: number
  ownable: ownable2step.Data
  reserve: bigint
}

export const builder = {
  message: {
    in: {
      withdraw: withdrawable.builder.message.in.withdraw,
    },
  },
  data: {
    walletConfig: ((): CellCodec<WalletConfig> => {
      return {
        encode: (config: WalletConfig): Builder => {
          return beginCell()
            .storeUint(config.id, 32)
            .storeBuilder(ownable2step.builder.data.traitData.encode(config.ownable))
            .storeCoins(config.reserve)
        },
        load: (src: Slice): WalletConfig => {
          throw new Error('Not implemented')
        },
      }
    })(),
  },
}

export class ContractClient implements withdrawable.Interface {
  private ownable: ownable2step.ContractClient

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    this.ownable = new ownable2step.ContractClient(address)
  }

  static createFromAddress(address: Address) {
    return new ContractClient(address)
  }

  static code(): Promise<Cell> {
    return compile('examples.funding.WithdrawableWallet')
  }

  static version() {
    return CONTRACT_VERSION
  }

  static type() {
    return FACILITY_NAME
  }

  static createFromConfig(config: WalletConfig, code: Cell, workchain = 0) {
    const data = builder.data.walletConfig.encode(config).endCell()
    const init = { code, data }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async getBalance(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('balance', [])
    return result.stack.readBigNumber()
  }

  // Delegate Withdrawable methods
  async sendWithdraw(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: withdrawable.Withdraw,
  ) {
    await withdrawable.sendWithdraw(provider, via, value, body)
  }

  async getReserve(provider: ContractProvider): Promise<bigint> {
    return await withdrawable.getReserve(provider)
  }

  // Ownership methods
  async getOwner(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('owner', [])
    return result.stack.readAddress()
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    const result = await provider.get('pendingOwner', [])
    return result.stack.readAddressOpt()
  }

  async sendTransferOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: ownable2step.TransferOwnership,
  ) {
    return this.ownable.sendTransferOwnership(p, via, value, body)
  }

  async sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint = 0n,
    body: ownable2step.AcceptOwnership,
  ) {
    return this.ownable.sendAcceptOwnership(p, via, value, body)
  }
}
