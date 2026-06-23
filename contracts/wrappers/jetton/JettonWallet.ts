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
} from '@ton/core'
import { JettonOpcodes } from './constants'
import { CellCodec } from '../utils'

export type JettonWalletConfig = {
  ownerAddress: Address
  jettonMasterAddress: Address
  balance?: bigint
  status?: number
}

export type JettonWalletData = {
  ownerAddress: Address
  jettonMasterAddress: Address
  balance: bigint
  status: number
}

export const opcodes = {
  in: {
    TRANSFER: JettonOpcodes.TRANSFER,
    TRANSFER_NOTIFICATION: JettonOpcodes.TRANSFER_NOTIFICATION,
    TOP_UP: JettonOpcodes.TOP_UP,
    INTERNAL_TRANSFER: JettonOpcodes.INTERNAL_TRANSFER,
    EXCESSES: JettonOpcodes.EXCESSES,
    BURN: JettonOpcodes.BURN,
    BURN_NOTIFICATION: JettonOpcodes.BURN_NOTIFICATION,
    WITHDRAW_TONS: JettonOpcodes.WITHDRAW_TONS,
    WITHDRAW_JETTONS: JettonOpcodes.WITHDRAW_JETTONS,
  },
}

export type AskToTransfer = {
  queryId: number
  jettonAmount: bigint
  destination: Address
  responseDestination: Address | null
  customPayload: Cell | null
  forwardTonAmount: bigint
  forwardPayload: Cell | Slice | null
}

export type AskToTransferWithFwdPayload<T> = {
  queryId: number
  jettonAmount: bigint
  destination: Address
  responseDestination: Address | null
  customPayload: Cell | null
  forwardTonAmount: bigint
  forwardPayload: T
}

export type AskToBurn = {
  queryId: bigint
  jettonAmount: bigint
  responseDestination: Address | null
  customPayload: Cell | null
}

export type InternalTransferStep = {
  queryId: bigint
  jettonAmount: bigint
  transferInitiator: Address | null
  responseDestination: Address | null
  forwardTonAmount?: bigint
  forwardPayload?: Cell | Slice | null
}

export type TransferNotificationForRecipient = {
  queryId: number | bigint
  jettonAmount: bigint
  senderAddress: Address
  forwardPayload: Cell | null
}

export type TransferNotificationWithFwdPayload<T> = {
  queryId: number | bigint
  jettonAmount: bigint
  senderAddress: Address
  forwardPayload: T
}

export type BurnNotificationForMinter = {
  queryId: bigint
  jettonAmount: bigint
  burnInitiator: Address
  responseDestination: Address | null
}

export type ReturnExcessesBack = {
  queryId: bigint
}

export type TopUpTons = Record<never, never>

export type WithdrawTonsMessage = {
  queryId: bigint
}

// wGRAM-specific extension: lets the wallet owner withdraw any GRAM surplus
// sitting above the strict `jettonBalance + storage_fee`
export type AskToWithdrawExcess = {
  queryId: bigint
  sendExcessesTo: Address
}

function toContractData(config: JettonWalletConfig): JettonWalletData {
  return {
    ownerAddress: config.ownerAddress,
    jettonMasterAddress: config.jettonMasterAddress,
    balance: config.balance ?? 0n,
    status: config.status ?? 0,
  }
}

function loadForwardPayload(src: Slice): Cell | Slice | null {
  const byRef = src.loadBit()
  if (byRef) {
    return src.loadRef()
  }
  return src.remainingBits > 0 || src.remainingRefs > 0 ? src : null
}

function toForwardPayloadSlice(payload: Cell | Slice): Slice {
  return payload instanceof Cell ? payload.beginParse() : payload
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
    const data = builder.data.contractData.encode(toContractData(config)).asCell()
    const init = { code, data }
    return new JettonWallet(contractAddress(workchain, init), init)
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

  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: AskToTransfer
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.askToTransfer.encode(opts.message).asCell(),
    })
  }

  async sendBurn(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: AskToBurn
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.askToBurn.encode(opts.message).asCell(),
    })
  }

  async sendWithdrawTons(provider: ContractProvider, via: Sender, value: bigint = 50000000n) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.withdrawTons.encode({ queryId: 0n }).asCell(),
    })
  }

  async sendWithdrawExcess(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      opcode: number
      message: AskToWithdrawExcess
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in
        .askToWithdrawExcess({ opcode: opts.opcode })
        .encode(opts.message)
        .asCell(),
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

export const builder = {
  data: {
    contractData: ((): CellCodec<JettonWalletData> => {
      return {
        encode: (data: JettonWalletData): Builder => {
          return beginCell()
            .storeUint(data.status, 4)
            .storeCoins(data.balance)
            .storeAddress(data.ownerAddress)
            .storeAddress(data.jettonMasterAddress)
        },
        load: (src: Slice): JettonWalletData => {
          return {
            status: src.loadUint(4),
            balance: src.loadCoins(),
            ownerAddress: src.loadAddress(),
            jettonMasterAddress: src.loadAddress(),
          }
        },
      }
    })(),
  },
  messages: {
    in: (() => {
      const askToTransfer: CellCodec<AskToTransfer> = {
        encode: function (data: AskToTransfer): Builder {
          const body = beginCell()
            .storeUint(opcodes.in.TRANSFER, 32)
            .storeUint(data.queryId, 64)
            .storeCoins(data.jettonAmount)
            .storeAddress(data.destination)
            .storeAddress(data.responseDestination)
            .storeMaybeRef(data.customPayload)
            .storeCoins(data.forwardTonAmount)

          const forwardPayload = data.forwardPayload
          const byRef = forwardPayload instanceof Cell
          body.storeBit(byRef)
          if (byRef) {
            body.storeRef(forwardPayload)
          } else if (forwardPayload) {
            body.storeSlice(forwardPayload)
          }
          return body
        },
        load: function (src: Slice): AskToTransfer {
          let op = src.loadUint(32)
          if (op !== opcodes.in.TRANSFER) {
            throw new Error(`Invalid opcode, expected ${opcodes.in.TRANSFER}, got ${op}`)
          }
          const parsed = {
            queryId: src.loadUint(64),
            jettonAmount: src.loadCoins(),
            destination: src.loadAddress(),
            responseDestination: src.loadAddress(),
            customPayload: src.loadMaybeRef(),
            forwardTonAmount: src.loadCoins(),
            forwardPayload: loadForwardPayload(src),
          }
          return parsed
        },
      }
      const askToTransferWithFwdPayload = <T>(
        payloadCodec: CellCodec<T>,
      ): CellCodec<AskToTransferWithFwdPayload<T>> => {
        return {
          encode: function (data: AskToTransferWithFwdPayload<T>): Builder {
            let tr: AskToTransfer = {
              ...data,
              forwardPayload: payloadCodec.encode(data.forwardPayload).endCell(),
            }
            return askToTransfer.encode(tr)
          },
          load: function (src: Slice): AskToTransferWithFwdPayload<T> {
            let transferRequest = askToTransfer.load(src)
            if (!transferRequest.forwardPayload) {
              throw new Error('forwardPayload is null')
            }
            let payload = payloadCodec.load(toForwardPayloadSlice(transferRequest.forwardPayload))
            return {
              ...transferRequest,
              forwardPayload: payload,
            }
          },
        }
      }
      const askToBurn: CellCodec<AskToBurn> = {
        encode: function (data: AskToBurn): Builder {
          return beginCell()
            .storeUint(opcodes.in.BURN, 32)
            .storeUint(data.queryId, 64)
            .storeCoins(data.jettonAmount)
            .storeAddress(data.responseDestination)
            .storeMaybeRef(data.customPayload)
        },
        load: function (src: Slice): AskToBurn {
          const op = src.loadUint(32)
          if (op !== opcodes.in.BURN) {
            throw new Error(`Invalid opcode, expected ${opcodes.in.BURN}, got ${op}`)
          }
          return {
            queryId: src.loadUintBig(64),
            jettonAmount: src.loadCoins(),
            responseDestination: src.loadMaybeAddress(),
            customPayload: src.loadMaybeRef(),
          }
        },
      }
      const topUpTons: CellCodec<TopUpTons> = {
        encode: function (): Builder {
          return beginCell().storeUint(opcodes.in.TOP_UP, 32)
        },
        load: function (src: Slice): TopUpTons {
          const op = src.loadUint(32)
          if (op !== opcodes.in.TOP_UP) {
            throw new Error(`Invalid opcode, expected ${opcodes.in.TOP_UP}, got ${op}`)
          }
          return {}
        },
      }
      const withdrawTons: CellCodec<WithdrawTonsMessage> = {
        encode: function (data: WithdrawTonsMessage): Builder {
          return beginCell().storeUint(opcodes.in.WITHDRAW_TONS, 32).storeUint(data.queryId, 64)
        },
        load: function (src: Slice): WithdrawTonsMessage {
          const op = src.loadUint(32)
          if (op !== opcodes.in.WITHDRAW_TONS) {
            throw new Error(`Invalid opcode, expected ${opcodes.in.WITHDRAW_TONS}, got ${op}`)
          }
          return { queryId: src.loadUintBig(64) }
        },
      }
      const askToWithdrawExcess = (opts: { opcode: number }): CellCodec<AskToWithdrawExcess> => ({
        encode: function (data: AskToWithdrawExcess): Builder {
          return beginCell()
            .storeUint(opts.opcode, 32)
            .storeUint(data.queryId, 64)
            .storeAddress(data.sendExcessesTo)
        },
        load: function (src: Slice): AskToWithdrawExcess {
          const op = src.loadUint(32)
          if (op !== opts.opcode) {
            throw new Error(`Invalid opcode, expected ${opts.opcode}, got ${op}`)
          }
          return {
            queryId: src.loadUintBig(64),
            sendExcessesTo: src.loadAddress(),
          }
        },
      })
      return {
        askToTransfer,
        askToTransferWithFwdPayload,
        askToBurn,
        topUpTons,
        withdrawTons,
        askToWithdrawExcess,
      }
    })(),
    out: (() => {
      const transferNotificationForRecipient: CellCodec<TransferNotificationForRecipient> = {
        encode: function (data: TransferNotificationForRecipient): Builder {
          return beginCell()
            .storeUint(opcodes.in.TRANSFER_NOTIFICATION, 32)
            .storeUint(data.queryId, 64)
            .storeCoins(data.jettonAmount)
            .storeAddress(data.senderAddress)
            .storeMaybeRef(data.forwardPayload)
        },
        load: function (src: Slice): TransferNotificationForRecipient {
          src.skip(32)
          return {
            queryId: src.loadUint(64),
            jettonAmount: src.loadCoins(),
            senderAddress: src.loadAddress(),
            forwardPayload: src.loadMaybeRef(),
          }
        },
      }
      const transferNotificationWithFwdPayload = <T>(
        payloadCodec: CellCodec<T>,
      ): CellCodec<TransferNotificationWithFwdPayload<T>> => {
        return {
          encode: function (data: TransferNotificationWithFwdPayload<T>): Builder {
            let tn: TransferNotificationForRecipient = {
              ...data,
              forwardPayload: payloadCodec.encode(data.forwardPayload).endCell(),
            }
            return transferNotificationForRecipient.encode(tn)
          },
          load: function (src: Slice): TransferNotificationWithFwdPayload<T> {
            let tn = transferNotificationForRecipient.load(src)
            if (!tn.forwardPayload) {
              throw new Error('forwardPayload is null')
            }
            let payload = payloadCodec.load(toForwardPayloadSlice(tn.forwardPayload))
            return {
              ...tn,
              forwardPayload: payload,
            }
          },
        }
      }
      const burnNotificationForMinter: CellCodec<BurnNotificationForMinter> = {
        encode: function (data: BurnNotificationForMinter): Builder {
          return beginCell()
            .storeUint(opcodes.in.BURN_NOTIFICATION, 32)
            .storeUint(data.queryId, 64)
            .storeCoins(data.jettonAmount)
            .storeAddress(data.burnInitiator)
            .storeAddress(data.responseDestination)
        },
        load: function (src: Slice): BurnNotificationForMinter {
          const op = src.loadUint(32)
          if (op !== opcodes.in.BURN_NOTIFICATION) {
            throw new Error(`Invalid opcode, expected ${opcodes.in.BURN_NOTIFICATION}, got ${op}`)
          }
          return {
            queryId: src.loadUintBig(64),
            jettonAmount: src.loadCoins(),
            burnInitiator: src.loadAddress(),
            responseDestination: src.loadMaybeAddress(),
          }
        },
      }
      const returnExcessesBack: CellCodec<ReturnExcessesBack> = {
        encode: function (data: ReturnExcessesBack): Builder {
          return beginCell().storeUint(opcodes.in.EXCESSES, 32).storeUint(data.queryId, 64)
        },
        load: function (src: Slice): ReturnExcessesBack {
          const op = src.loadUint(32)
          if (op !== opcodes.in.EXCESSES) {
            throw new Error(`Invalid opcode, expected ${opcodes.in.EXCESSES}, got ${op}`)
          }
          return { queryId: src.loadUintBig(64) }
        },
      }
      const internalTransferStep: CellCodec<InternalTransferStep> = {
        encode: function (data: InternalTransferStep): Builder {
          const body = beginCell()
            .storeUint(opcodes.in.INTERNAL_TRANSFER, 32)
            .storeUint(data.queryId, 64)
            .storeCoins(data.jettonAmount)
            .storeAddress(data.transferInitiator)
            .storeAddress(data.responseDestination)
            .storeCoins(data.forwardTonAmount ?? 0n)

          const forwardPayload = data.forwardPayload ?? null
          const byRef = forwardPayload instanceof Cell
          body.storeBit(byRef)
          if (byRef) {
            body.storeRef(forwardPayload)
          } else if (forwardPayload) {
            body.storeSlice(forwardPayload)
          }

          return body
        },
        load: function (src: Slice): InternalTransferStep {
          const op = src.loadUint(32)
          if (op !== opcodes.in.INTERNAL_TRANSFER) {
            throw new Error(`Invalid opcode, expected ${opcodes.in.INTERNAL_TRANSFER}, got ${op}`)
          }
          return {
            queryId: src.loadUintBig(64),
            jettonAmount: src.loadCoins(),
            transferInitiator: src.loadMaybeAddress(),
            responseDestination: src.loadMaybeAddress(),
            forwardTonAmount: src.loadCoins(),
            forwardPayload: loadForwardPayload(src),
          }
        },
      }
      return {
        transferNotificationForRecipient,
        transferNotificationWithFwdPayload,
        burnNotificationForMinter,
        returnExcessesBack,
        internalTransferStep,
      }
    })(),
  },
}
