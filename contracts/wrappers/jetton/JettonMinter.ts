import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
  toNano,
} from '@ton/core'
import { JettonOpcodes } from './constants'
import { JettonMinterCode } from './JettonCode'
import { Maybe } from '@ton/core/dist/utils/maybe'
import { CellCodec } from '../utils'

export type JettonMinterContent = {
  uri: string
}

export type JettonMinterData = {
  totalSupply: bigint
  admin: Address | null
  walletCode: Cell
  jettonContent: Cell
  transferAdmin: Maybe<Address>
}

export type JettonMinterConfig = {
  totalSupply: bigint
  admin: Maybe<Address>
  walletCode: Cell
  jettonContent: Cell | JettonMinterContent
  transferAdmin: Maybe<Address>
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

export type MintNewJettons = {
  queryId: bigint
  destination: Address
  tonAmount: bigint
  jettonAmount: bigint
  from: Maybe<Address>
  responseDestination: Maybe<Address>
  customPayload?: Cell | null
  forwardTonAmount?: bigint
}

export type InternalTransferStep = {
  queryId: bigint
  jettonAmount: bigint
  from: Maybe<Address>
  responseDestination: Maybe<Address>
  customPayload?: Cell | null
  forwardTonAmount?: bigint
}

export type RequestWalletAddress = {
  queryId: bigint
  ownerAddress: Address
  includeOwnerAddress: boolean
}

export type ChangeMinterAdmin = {
  queryId: bigint
  newAdmin: Address
}

export type ChangeMinterMetadataUri = {
  queryId: bigint
  content: Cell | JettonMinterContent
}

export type ClaimMinterAdmin = {
  queryId: bigint
}

export type DropMinterAdmin = {
  queryId: bigint
}

export type UpgradeMinterCode = {
  queryId: bigint
  newData: Cell
  newCode: Cell
}

export type TopUpTons = Record<never, never>

function contentToCell(content: Cell | JettonMinterContent): Cell {
  return content instanceof Cell ? content : builder.data.content.encode(content).asCell()
}

function toContractData(config: JettonMinterConfig): JettonMinterData {
  return {
    totalSupply: config.totalSupply,
    admin: config.admin ?? null,
    transferAdmin: config.transferAdmin,
    walletCode: config.walletCode,
    jettonContent: contentToCell(config.jettonContent),
  }
}

function toInternalTransferStep(message: MintNewJettons): InternalTransferStep {
  return {
    queryId: message.queryId,
    jettonAmount: message.jettonAmount,
    from: message.from,
    responseDestination: message.responseDestination,
    customPayload: message.customPayload,
    forwardTonAmount: message.forwardTonAmount,
  }
}

export const builder = {
  data: {
    content: ((): CellCodec<JettonMinterContent> => {
      return {
        encode: (data: JettonMinterContent): Builder => {
          return beginCell().storeStringRefTail(data.uri)
        },
        load: (src: Slice): JettonMinterContent => {
          return { uri: src.loadStringRefTail() }
        },
      }
    })(),
    contractData: ((): CellCodec<JettonMinterData> => {
      return {
        encode: (data: JettonMinterData): Builder => {
          return beginCell()
            .storeCoins(data.totalSupply)
            .storeAddress(data.admin)
            .storeAddress(data.transferAdmin)
            .storeRef(data.walletCode)
            .storeRef(data.jettonContent)
        },
        load: (src: Slice): JettonMinterData => {
          return {
            totalSupply: src.loadCoins(),
            admin: src.loadMaybeAddress(),
            transferAdmin: src.loadMaybeAddress(),
            walletCode: src.loadRef(),
            jettonContent: src.loadRef(),
          }
        },
      }
    })(),
  },
  messages: {
    in: {
      mintNewJettons: (opts: { opcode?: number } = {}): CellCodec<MintNewJettons> => {
        return {
          encode: (data: MintNewJettons): Builder => {
            return beginCell()
              .storeUint(opts.opcode ?? MinterOpcodes.MINT, 32)
              .storeUint(data.queryId, 64)
              .storeAddress(data.destination)
              .storeCoins(data.tonAmount)
              .storeRef(
                builder.messages.out.internalTransferStep.encode(toInternalTransferStep(data)),
              )
          },
          load: (src: Slice): MintNewJettons => {
            src.skip(32)
            const queryId = src.loadUintBig(64)
            const destination = src.loadAddress()
            const tonAmount = src.loadCoins()
            const internalTransfer = builder.messages.out.internalTransferStep.load(
              src.loadRef().beginParse(),
            )

            return {
              queryId,
              destination,
              tonAmount,
              jettonAmount: internalTransfer.jettonAmount,
              from: internalTransfer.from,
              responseDestination: internalTransfer.responseDestination,
              customPayload: internalTransfer.customPayload,
              forwardTonAmount: internalTransfer.forwardTonAmount,
            }
          },
        }
      },
      requestWalletAddress: ((): CellCodec<RequestWalletAddress> => {
        return {
          encode: (data: RequestWalletAddress): Builder => {
            return beginCell()
              .storeUint(MinterOpcodes.PROVIDE_WALLET_ADDRESS, 32)
              .storeUint(data.queryId, 64)
              .storeAddress(data.ownerAddress)
              .storeBit(data.includeOwnerAddress)
          },
          load: (src: Slice): RequestWalletAddress => {
            src.skip(32)
            return {
              queryId: src.loadUintBig(64),
              ownerAddress: src.loadAddress(),
              includeOwnerAddress: src.loadBit(),
            }
          },
        }
      })(),
      changeMinterAdmin: ((): CellCodec<ChangeMinterAdmin> => {
        return {
          encode: (data: ChangeMinterAdmin): Builder => {
            return beginCell()
              .storeUint(MinterOpcodes.CHANGE_ADMIN, 32)
              .storeUint(data.queryId, 64)
              .storeAddress(data.newAdmin)
          },
          load: (src: Slice): ChangeMinterAdmin => {
            src.skip(32)
            return {
              queryId: src.loadUintBig(64),
              newAdmin: src.loadAddress(),
            }
          },
        }
      })(),
      claimMinterAdmin: ((): CellCodec<ClaimMinterAdmin> => {
        return {
          encode: (data: ClaimMinterAdmin): Builder => {
            return beginCell().storeUint(MinterOpcodes.CLAIM_ADMIN, 32).storeUint(data.queryId, 64)
          },
          load: (src: Slice): ClaimMinterAdmin => {
            src.skip(32)
            return { queryId: src.loadUintBig(64) }
          },
        }
      })(),
      dropMinterAdmin: ((): CellCodec<DropMinterAdmin> => {
        return {
          encode: (data: DropMinterAdmin): Builder => {
            return beginCell().storeUint(MinterOpcodes.DROP_ADMIN, 32).storeUint(data.queryId, 64)
          },
          load: (src: Slice): DropMinterAdmin => {
            src.skip(32)
            return { queryId: src.loadUintBig(64) }
          },
        }
      })(),
      changeMinterMetadataUri: ((): CellCodec<ChangeMinterMetadataUri> => {
        return {
          encode: (data: ChangeMinterMetadataUri): Builder => {
            const content =
              data.content instanceof Cell
                ? data.content.beginParse().loadStringTail()
                : data.content.uri

            return beginCell()
              .storeUint(MinterOpcodes.CHANGE_METADATA_URL, 32)
              .storeUint(data.queryId, 64)
              .storeStringTail(content)
          },
          load: (src: Slice): ChangeMinterMetadataUri => {
            src.skip(32)
            return {
              queryId: src.loadUintBig(64),
              content: { uri: src.loadStringTail() },
            }
          },
        }
      })(),
      upgradeMinterCode: ((): CellCodec<UpgradeMinterCode> => {
        return {
          encode: (data: UpgradeMinterCode): Builder => {
            return beginCell()
              .storeUint(MinterOpcodes.UPGRADE, 32)
              .storeUint(data.queryId, 64)
              .storeRef(data.newData)
              .storeRef(data.newCode)
          },
          load: (src: Slice): UpgradeMinterCode => {
            src.skip(32)
            return {
              queryId: src.loadUintBig(64),
              newData: src.loadRef(),
              newCode: src.loadRef(),
            }
          },
        }
      })(),
      topUpTons: ((): CellCodec<TopUpTons> => {
        return {
          encode: (): Builder => {
            return beginCell().storeUint(MinterOpcodes.TOP_UP, 32)
          },
          load: (src: Slice): TopUpTons => {
            src.skip(32)
            return {}
          },
        }
      })(),
    },
    out: {
      internalTransferStep: ((): CellCodec<InternalTransferStep> => {
        return {
          encode: (data: InternalTransferStep): Builder => {
            return beginCell()
              .storeUint(MinterOpcodes.INTERNAL_TRANSFER, 32)
              .storeUint(data.queryId, 64)
              .storeCoins(data.jettonAmount)
              .storeAddress(data.from)
              .storeAddress(data.responseDestination)
              .storeCoins(data.forwardTonAmount ?? 0n)
              .storeMaybeRef(data.customPayload ?? null)
          },
          load: (src: Slice): InternalTransferStep => {
            src.skip(32)
            return {
              queryId: src.loadUintBig(64),
              jettonAmount: src.loadCoins(),
              from: src.loadMaybeAddress(),
              responseDestination: src.loadMaybeAddress(),
              forwardTonAmount: src.loadCoins(),
              customPayload: src.loadMaybeRef(),
            }
          },
        }
      })(),
    },
  },
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
    const data = builder.data.contractData.encode(toContractData(config)).asCell()
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
      body: builder.messages.in.topUpTons.encode({}).asCell(),
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
      message: MintNewJettons
      mintOpcode?: number
    },
  ) {
    const body = builder.messages.in
      .mintNewJettons({ opcode: opts.mintOpcode })
      .encode(opts.message)
      .asCell()

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
      message: ChangeMinterAdmin
    },
  ) {
    await provider.internal(via, {
      value: opts.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.changeMinterAdmin.encode(opts.message).asCell(),
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
      body: builder.messages.in.claimMinterAdmin.encode({ queryId: opts.queryId ?? 0n }).asCell(),
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
      body: builder.messages.in.dropMinterAdmin.encode({ queryId: opts.queryId ?? 0n }).asCell(),
    })
  }

  async sendChangeContent(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value?: bigint
      message: ChangeMinterMetadataUri
    },
  ) {
    await provider.internal(via, {
      value: opts.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.changeMinterMetadataUri.encode(opts.message).asCell(),
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
      body: builder.messages.in.upgradeMinterCode
        .encode({ queryId: opts.queryId ?? 0n, newData: opts.newData, newCode: opts.newCode })
        .asCell(),
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
