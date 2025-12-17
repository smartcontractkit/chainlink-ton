import {
  Address,
  beginCell,
  Builder,
  Cell,
  contractAddress,
  ContractProvider,
  Sender,
  SenderArguments,
  SendMode,
  Slice,
  toNano,
} from '@ton/core'
import { CellCodec } from '../../utils'
import { compile } from '@ton/blueprint'
import {
  Blockchain,
  BlockchainContractProvider,
  SandboxContract,
  SandboxContractProvider,
  SendMessageResult,
} from '@ton/sandbox'
import * as deployable from '../../libraries/Deployable'

export type Relay_Send = {
  bounce: boolean
  value: bigint
  to: Address
  body: Cell
  sendMode: SendMode
}

export enum OpCodes {
  Relay_Send = 0x527146b1,
}

export const builder = {
  message: {
    in: {
      relay_Send: ((): CellCodec<Relay_Send> => {
        return {
          encode: (data: Relay_Send): Builder => {
            return beginCell()
              .storeUint(OpCodes.Relay_Send, 32)
              .storeBit(data.bounce)
              .storeCoins(data.value)
              .storeAddress(data.to)
              .storeRef(data.body)
              .storeUint(data.sendMode, 8)
          },
          load: (src: Slice): Relay_Send => {
            src.skip(32) // opcode
            return {
              bounce: src.loadBit(),
              value: src.loadCoins(),
              to: src.loadAddress()!,
              body: src.loadRef(),
              sendMode: Number(src.loadUint(8)),
            }
          },
        }
      })(),
    },
  },
}

export class ContractClient {
  constructor(
    readonly address: Address,
    readonly init?: {
      code: Cell
    },
  ) {}

  static createFromAddress(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static createFromConfig(code: Cell, workchain = 0): ContractClient {
    const init = {
      code,
      data: Cell.EMPTY,
    }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendRelay(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      body: Relay_Send
    },
  ) {
    return await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.relay_Send.encode(opts.body).asCell(),
    })
  }

  static async code(): Promise<Cell> {
    return await compile('tests.mock.Relay')
  }

  // Get a sender that routes messages via Relay contract
  // This is not a contract getter but we use a get* name to use the injected
  // provider when opened as a sandbox contract
  async getSender(provider: SandboxContractProvider, via: Sender): Promise<Sender> {
    return new RelaySender(this, provider, via)
  }
}

// A sender that routes messages via Relay contract
export class RelaySender implements Sender {
  address?: Address | undefined
  constructor(
    readonly mock: ContractClient,
    readonly provider: SandboxContractProvider,
    readonly via: Sender,
  ) {
    this.address = mock.address
  }

  send(args: SenderArguments): Promise<void> {
    return this.mock.sendRelay(this.provider, this.via, {
      value: args.value + toNano('0.1'),
      body: {
        bounce: args.bounce ?? false,
        value: args.value,
        to: args.to,
        body: args.body ?? Cell.EMPTY,
        sendMode: args.sendMode ?? SendMode.PAY_GAS_SEPARATELY,
      },
    })
  }
}
