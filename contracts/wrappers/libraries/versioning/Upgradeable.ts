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
import { CellCodec, errorCode, facilityId } from '../../utils'

export const opcodes = {
  Upgrade: 0x0aa811ed,
}

export const FACILITY_NAME = 'link.chain.ton.lib.versioning.Upgradeable'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum Error {
  VersionMismatch = 19900,
}

export const eventTopics = {
  Upgraded: 0x6cf83c03, // crc32("Upgradeable_UpgradedEvent")
}

export type Upgrade = {
  queryId: bigint
  code: Cell
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
          },
          load: (src: Slice): Upgrade => {
            src.skip(32) // opcode
            return {
              queryId: src.loadUintBig(64),
              code: src.loadRef(),
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

export async function sendUpgrade(
  provider: ContractProvider,
  via: Sender,
  value: bigint,
  body: Upgrade,
) {
  await provider.internal(via, {
    value: value,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    body: builder.message.in.upgrade.encode(body).endCell(),
  })
}
export interface Interface extends Contract {
  // readonly address: Address

  sendUpgrade(provider: ContractProvider, via: Sender, value: bigint, body: Upgrade): Promise<void>
}

export async function sendUpgradeAndReturnNewVersion<T extends Interface>(
  current: SandboxContract<Interface>,
  via: Sender,
  value: bigint,
  newVersion: new (address: Address, init?: { code: Cell; data: Cell }) => T,
  newCode: Cell,
  queryId?: bigint,
): Promise<{ upgradeResult: SendMessageResult; newVersionInstance: T }> {
  const newVersionInstance = new newVersion(current.address)
  const upgradeResult = await current.sendUpgrade(via, value, {
    queryId: queryId ?? 0n,
    code: newCode,
  })
  return { upgradeResult, newVersionInstance }
}
