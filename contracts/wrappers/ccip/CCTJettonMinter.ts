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
import { contractCode } from '../codeLoader'
import { builder as jettonMinterBuilder } from '../jetton/JettonMinter'

export type CCTJettonMinterConfig = {
  totalSupply: bigint
  adminAddress: Address | null
  nextAdminAddress: Address | null
  jettonWalletCode: Cell
  metadataUri: string
}

export type CCTMintMessage = {
  queryId: bigint
  destination: Address
  tonAmount: bigint
  jettonAmount: bigint
  from: Address | null
  responseDestination: Address | null
  forwardTonAmount?: bigint
}

export class CCTJettonMinter implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new CCTJettonMinter(address)
  }

  static createFromConfig(config: CCTJettonMinterConfig, code: Cell, workchain = 0) {
    const data = beginCell()
      .storeCoins(config.totalSupply)
      .storeAddress(config.adminAddress)
      .storeAddress(config.nextAdminAddress)
      .storeRef(config.jettonWalletCode)
      .storeStringRefTail(config.metadataUri)
      .endCell()

    const init = { code, data }
    return new CCTJettonMinter(contractAddress(workchain, init), init)
  }

  static code(): Promise<Cell> {
    return contractCode.ccip.local('ccip.cct.JettonMinter')
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: CCTMintMessage
    },
  ) {
    const internalTransferMsg = beginCell()
      .storeUint(0x178d4519, 32)
      .storeUint(opts.message.queryId, 64)
      .storeCoins(opts.message.jettonAmount)
      .storeAddress(opts.message.from)
      .storeAddress(opts.message.responseDestination)
      .storeCoins(opts.message.forwardTonAmount ?? 0n)
      .storeSlice(beginCell().endCell().beginParse())
      .endCell()

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x00000015, 32)
        .storeUint(opts.message.queryId, 64)
        .storeAddress(opts.message.destination)
        .storeCoins(opts.message.tonAmount)
        .storeRef(internalTransferMsg)
        .endCell(),
    })
  }

  async sendChangeMinterAdmin(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: bigint
      newAdminAddress: Address
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: jettonMinterBuilder.messages.in.changeMinterAdmin
        .encode({ queryId: opts.queryId ?? 0n, newAdmin: opts.newAdminAddress })
        .asCell(),
    })
  }

  async getWalletAddress(provider: ContractProvider, ownerAddress: Address): Promise<Address> {
    const { stack } = await provider.get('get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(ownerAddress).endCell() },
    ])
    return stack.readAddress()
  }
}
