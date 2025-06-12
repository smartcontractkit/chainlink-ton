import {
  Address,
  beginCell,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { SandboxContract, SendMessageResult } from '@ton/sandbox'
import { crc32 } from 'zlib'

export const Opcodes = {
  OP_UPGRADE: crc32('Upgrade'),
}

export class Upgradeable {
  readonly address: Address

  async sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: number
      code: Cell
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.OP_UPGRADE, 32)
        .storeUint(opts.queryId ?? 0, 64)
        .storeRef(opts.code)
        .endCell(),
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
  queryId?: number,
): Promise<{ upgradeResult: SendMessageResult; newVersionInstance: T }> {
  const newVersionInstance = new newVersion(current.address)
  const upgradeResult = await current.sendUpgrade(via, {
    value: value,
    queryId: queryId,
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
