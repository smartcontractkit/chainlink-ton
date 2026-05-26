import {
  address,
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano,
} from '@ton/core'
import { JettonOpcodes } from './constants'
import { JettonMinterCode } from './JettonCode'
import { Maybe } from '@ton/core/dist/utils/maybe'

export type JettonMinterContent = {
  uri: string
}

export type JettonMinterConfig = {
  totalSupply: bigint
  admin: Address
  walletCode: Cell
  jettonContent: Cell | JettonMinterContent
  transferAdmin: Maybe<Address>
}

export function jettonContentToCell(content: JettonMinterContent): Cell {
  return beginCell().storeStringRefTail(content.uri).endCell()
}

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
  const content =
    config.jettonContent instanceof Cell
      ? config.jettonContent
      : jettonContentToCell(config.jettonContent)

  return beginCell()
    .storeCoins(config.totalSupply)
    .storeAddress(config.admin)
    .storeAddress(config.transferAdmin)
    .storeRef(config.walletCode)
    .storeRef(content)
    .endCell()
}

export function parseJettonMinterData(data: Cell) {
  const sc = data.beginParse()
  return {
    supply: sc.loadCoins(),
    admin: sc.loadMaybeAddress(),
    transferAdmin: sc.loadMaybeAddress(),
    walletCode: sc.loadRef(),
    jettonContent: sc.loadRef(),
  }
}

export const MinterOpcodes = {
  MINT: JettonOpcodes.MINT,
  BURN_NOTIFICATION: JettonOpcodes.BURN_NOTIFICATION,
  PROVIDE_WALLET_ADDRESS: JettonOpcodes.PROVIDE_WALLET_ADDRESS,
  TAKE_WALLET_ADDRESS: JettonOpcodes.TAKE_WALLET_ADDRESS,
  CHANGE_ADMIN: JettonOpcodes.CHANGE_ADMIN,
  CLAIM_ADMIN: JettonOpcodes.CLAIM_ADMIN,
  DROP_ADMIN: JettonOpcodes.DROP_ADMIN,
  CHANGE_METADATA_URL: JettonOpcodes.CHANGE_METADATA_URL,
  UPGRADE: JettonOpcodes.UPGRADE,
  TOP_UP: JettonOpcodes.TOP_UP,
  INTERNAL_TRANSFER: JettonOpcodes.INTERNAL_TRANSFER,
  EXCESSES: JettonOpcodes.EXCESSES,
}

export type MintMessage = {
  queryId: bigint
  destination: Address
  tonAmount: bigint
  jettonAmount: bigint
  from: Maybe<Address>
  responseDestination: Maybe<Address>
  customPayload?: Cell | null
  forwardTonAmount?: bigint
}

export type WalletAddressRequestMessage = {
  queryId: bigint
  ownerAddress: Address
  includeOwnerAddress: boolean
}

export function mintInternalTransferBody(message: MintMessage): Cell {
  const mintMsg = beginCell()
    .storeUint(MinterOpcodes.INTERNAL_TRANSFER, 32)
    .storeUint(message.queryId, 64)
    .storeCoins(message.jettonAmount)
    .storeAddress(message.from)
    .storeAddress(message.responseDestination)
    .storeCoins(message.forwardTonAmount ?? 0n)

  if (message.customPayload) {
    mintMsg.storeBit(1).storeRef(message.customPayload)
  } else {
    mintMsg.storeBit(0)
  }

  return mintMsg.endCell()
}

export function mintBody(
  message: MintMessage,
  opts: {
    mintOpcode?: number
  } = {},
): Cell {
  return beginCell()
    .storeUint(opts.mintOpcode ?? MinterOpcodes.MINT, 32)
    .storeUint(message.queryId, 64)
    .storeAddress(message.destination)
    .storeCoins(message.tonAmount)
    .storeRef(mintInternalTransferBody(message))
    .endCell()
}

export function walletAddressRequestBody(message: WalletAddressRequestMessage): Cell {
  return beginCell()
    .storeUint(MinterOpcodes.PROVIDE_WALLET_ADDRESS, 32)
    .storeUint(message.queryId, 64)
    .storeAddress(message.ownerAddress)
    .storeBit(message.includeOwnerAddress)
    .endCell()
}

export type ChangeAdminMessage = {
  queryId: bigint
  newAdmin: Address
}

export type ChangeContentMessage = {
  queryId: bigint
  content: Cell | JettonMinterContent
}

export class JettonMinter implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new JettonMinter(address)
  }

  static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
    const data = jettonMinterConfigToCell(config)
    const init = { code, data }
    return new JettonMinter(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async sendTopUpTons(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(MinterOpcodes.TOP_UP, 32).endCell(),
    })
  }

  static async code(): Promise<Cell> {
    return await JettonMinterCode()
  }

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: MintMessage
      mintOpcode?: number
    },
  ) {
    const body = mintBody(opts.message, { mintOpcode: opts.mintOpcode })

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    })
  }

  // async sendDiscovery(
  //   provider: ContractProvider,
  //   via: Sender,
  //   opts: {
  //     value?: bigint
  //     owner: Address
  //     includeAddress: boolean
  //   },
  // ) {
  //   await provider.internal(via, {
  //     value: opts.value ?? toNano('0.1'),
  //     sendMode: SendMode.PAY_GAS_SEPARATELY,
  //     body: beginCell()
  //       .storeUint(MinterOpcodes.PROVIDE_WALLET_ADDRESS, 32)
  //       .storeUint(0, 64) // query_id
  //       .storeAddress(opts.owner)
  //       .storeBit(opts.includeAddress)
  //       .endCell(),
  //   })
  // }

  async sendChangeAdmin(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value?: bigint
      message: ChangeAdminMessage
    },
  ) {
    await provider.internal(via, {
      value: opts.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(MinterOpcodes.CHANGE_ADMIN, 32)
        .storeUint(opts.message.queryId, 64)
        .storeAddress(opts.message.newAdmin)
        .endCell(),
    })
  }

  async sendClaimAdmin(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value?: bigint
      queryId?: bigint
    } = {},
  ) {
    await provider.internal(via, {
      value: opts.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(MinterOpcodes.CLAIM_ADMIN, 32)
        .storeUint(opts.queryId ?? 0n, 64)
        .endCell(),
    })
  }

  async sendDropAdmin(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value?: bigint
      queryId?: bigint
    } = {},
  ) {
    await provider.internal(via, {
      value: opts.value ?? toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(MinterOpcodes.DROP_ADMIN, 32)
        .storeUint(opts.queryId ?? 0n, 64)
        .endCell(),
    })
  }

  async sendChangeContent(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value?: bigint
      message: ChangeContentMessage
    },
  ) {
    const contentString =
      opts.message.content instanceof Cell
        ? opts.message.content.beginParse().loadStringTail()
        : opts.message.content.uri

    await provider.internal(via, {
      value: opts.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(MinterOpcodes.CHANGE_METADATA_URL, 32)
        .storeUint(opts.message.queryId, 64)
        .storeStringTail(contentString)
        .endCell(),
    })
  }

  async sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value?: bigint
      queryId?: bigint
      newData: Cell
      newCode: Cell
    },
  ) {
    await provider.internal(via, {
      value: opts.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(MinterOpcodes.UPGRADE, 32)
        .storeUint(opts.queryId ?? 0n, 64)
        .storeRef(opts.newData)
        .storeRef(opts.newCode)
        .endCell(),
    })
  }

  async getJettonData(provider: ContractProvider) {
    const { stack } = await provider.get('get_jetton_data', [])
    return {
      totalSupply: stack.readBigNumber(),
      mintable: stack.readBoolean(),
      admin: stack.readAddressOpt(),
      jettonContent: stack.readCell(),
      jettonWalletCode: stack.readCell(),
    }
  }

  async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
    const { stack } = await provider.get('get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
    ])
    return stack.readAddress()
  }

  async getNextAdminAddress(provider: ContractProvider): Promise<Address | null> {
    const { stack } = await provider.get('get_next_admin_address', [])
    return stack.readAddressOpt()
  }
}
