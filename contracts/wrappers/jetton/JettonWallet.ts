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
} from '@ton/core'
import { JettonOpcodes } from '../examples/jetton/types'

export type JettonWalletConfig = {
  ownerAddress: Address
  jettonMasterAddress: Address
  balance?: bigint
  status?: number
}

export function jettonWalletConfigToCell(config: JettonWalletConfig): Cell {
  return beginCell()
    .storeUint(config.status ?? 0, 4) // status
    .storeCoins(config.balance ?? 0n) // jetton balance
    .storeAddress(config.ownerAddress)
    .storeAddress(config.jettonMasterAddress)
    .endCell()
}

export function parseJettonWalletData(data: Cell) {
  const sc = data.beginParse()
  return {
    status: sc.loadUint(4),
    balance: sc.loadCoins(),
    ownerAddress: sc.loadAddress(),
    jettonMasterAddress: sc.loadAddress(),
  }
}

export const WalletOpcodes = {
  TRANSFER: JettonOpcodes.TRANSFER,
  TRANSFER_NOTIFICATION: JettonOpcodes.TRANSFER_NOTIFICATION,
  INTERNAL_TRANSFER: JettonOpcodes.INTERNAL_TRANSFER,
  EXCESSES: JettonOpcodes.EXCESSES,
  BURN: JettonOpcodes.BURN,
  BURN_NOTIFICATION: JettonOpcodes.BURN_NOTIFICATION,
  WITHDRAW_TONS: JettonOpcodes.WITHDRAW_TONS,
  WITHDRAW_JETTONS: JettonOpcodes.WITHDRAW_JETTONS,
}

export type TransferMessage = {
  queryId: bigint
  jettonAmount: bigint
  destination: Address
  responseDestination: Address
  customPayload: Cell | null
  forwardTonAmount: bigint
  forwardPayload: Cell | Slice | null
}

export type BurnMessage = {
  queryId: bigint
  jettonAmount: bigint
  responseDestination: Address | null
  customPayload: Cell | null
}

export class JettonWallet implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new JettonWallet(address)
  }

  static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
    const data = jettonWalletConfigToCell(config)
    const init = { code, data }
    return new JettonWallet(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: TransferMessage
    },
  ) {
    const forwardPayload = opts.message.forwardPayload
    const body = beginCell()
      .storeUint(WalletOpcodes.TRANSFER, 32)
      .storeUint(opts.message.queryId, 64)
      .storeCoins(opts.message.jettonAmount)
      .storeAddress(opts.message.destination)
      .storeAddress(opts.message.responseDestination)

    body.storeMaybeRef(opts.message.customPayload)

    body.storeCoins(opts.message.forwardTonAmount)

    const byRef = forwardPayload instanceof Cell
    body.storeBit(byRef)
    if (byRef) {
      body.storeRef(forwardPayload)
    } else if (forwardPayload) {
      body.storeSlice(forwardPayload)
    }

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body.endCell(),
    })
  }

  async sendBurn(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: BurnMessage
    },
  ) {
    const body = beginCell()
      .storeUint(WalletOpcodes.BURN, 32)
      .storeUint(opts.message.queryId, 64)
      .storeCoins(opts.message.jettonAmount)
      .storeAddress(opts.message.responseDestination)

    if (opts.message.customPayload) {
      body.storeBit(1).storeRef(opts.message.customPayload)
    } else {
      body.storeBit(0)
    }

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body.endCell(),
    })
  }

  async sendWithdrawTons(provider: ContractProvider, via: Sender, value: bigint = 50000000n) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(WalletOpcodes.WITHDRAW_TONS, 32)
        .storeUint(0, 64) // query_id
        .endCell(),
    })
  }

  async sendWithdrawJettons(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      from: Address
      amount: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(WalletOpcodes.WITHDRAW_JETTONS, 32)
        .storeUint(0, 64) // query_id
        .storeAddress(opts.from)
        .storeCoins(opts.amount)
        .endCell(),
    })
  }

  async getWalletData(provider: ContractProvider) {
    const { stack } = await provider.get('get_wallet_data', [])
    return {
      balance: stack.readBigNumber(),
      owner: stack.readAddress(),
      minter: stack.readAddress(),
      walletCode: stack.readCell(),
    }
  }

  async getJettonBalance(provider: ContractProvider): Promise<bigint> {
    const walletData = await this.getWalletData(provider)
    return walletData.balance
  }

  async getWalletStatus(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('get_status', [])
    return stack.readNumber()
  }
}
