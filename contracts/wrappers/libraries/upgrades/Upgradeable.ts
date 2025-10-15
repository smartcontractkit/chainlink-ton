import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { SandboxContract, SendMessageResult } from '@ton/sandbox'
import { crc32 } from 'zlib'
import { CellCodec } from '../../utils'

export const opcodes = {
  Upgrade: crc32('Upgradeable_Upgrade'),
}

export type Upgrade = {
  queryId: bigint
  code: Cell
  fromVersion: string
}

export type UpgradedEvent = {
  code: Cell
  codeHash: bigint
  version: string
}

export const builder = {
  message: {
    in: {
      upgrade: ((): CellCodec<Upgrade> => {
        return {
          encode: (msg: Upgrade): Builder => {
            return beginCell()
              .storeUint(opcodes.Upgrade, 32)
              .storeUint(msg.queryId, 64)
              .storeRef(msg.code)
              .storeStringTail(msg.fromVersion)
          },
          load: (src: Slice): Upgrade => {
            src.skip(32) // opcode
            return {
              queryId: src.loadUintBig(64),
              code: src.loadRef(),
              fromVersion: src.loadStringTail(),
            }
          },
        }
      })(),
    },
  },
  event: {
    upgraded: ((): CellCodec<UpgradedEvent> => {
      return {
        encode: (event: UpgradedEvent): Builder => {
          return beginCell()
            .storeRef(event.code)
            .storeUint(event.codeHash, 256)
            .storeStringTail(event.version)
        },
        load: (src: Slice): UpgradedEvent => {
          return {
            code: src.loadRef(),
            codeHash: src.loadUintBig(256),
            version: src.loadStringTail(),
          }
        },
      }
    })(),
  },
}

export class Upgradeable {
  readonly address: Address

  async sendUpgrade(provider: ContractProvider, via: Sender, value: bigint, body: Upgrade) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.upgrade.encode(body).endCell(),
    })
  }

  code(): Promise<Cell> {
    throw new Error('Method not implemented.')
  }
}

export async function sendUpgradeAndReturnNewVersion<T extends Upgradeable>(
  current: SandboxContract<Upgradeable>,
  via: Sender,
  value: bigint,
  newVersion: new (address: Address, init?: { code: Cell; data: Cell }) => T,
  fromVersion: string,
  queryId?: bigint,
): Promise<{ upgradeResult: SendMessageResult; newVersionInstance: T }> {
  const newVersionInstance = new newVersion(current.address)
  const upgradeResult = await current.sendUpgrade(via, value, {
    queryId: queryId ?? 0n,
    fromVersion: fromVersion,
    code: await newVersionInstance.code(),
  })
  return { upgradeResult, newVersionInstance }
}

export function loadUpgradedEvent(slice: Slice): {
  version: string
  code: Cell
  codeHash: bigint
} {
  const code = slice.loadRef()
  const codeHash = slice.loadUintBig(256)
  const version = slice.loadStringTail()
  return {
    version,
    code,
    codeHash,
  }
}
