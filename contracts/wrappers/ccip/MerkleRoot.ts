import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Builder,
  Slice,
} from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId, CellCodec } from '../utils'
import { contractCode } from '../codeLoader'

import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'

export const CONTRACT_VERSION = '1.6.1'

export const FACILITY_NAME = 'link.chain.ton.ccip.MerkleRoot'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum MerkleRootError {
  AlreadyExecuted = 18600, // Facility ID * 100
  NotOwner,
  ManualExecutionNotYetEnabled,
  SkippedAlreadyExecutedMessage,
}

export type TokenBalance = {
  amount: bigint
  failed: boolean
}

export const opcodes = {
  in: {
    validate: 0x038ede91,
    markState: 0x019f4cd2,
  },
}

export type MerkleRootStorage = {
  rootId: bigint
  owner: Address
  timestamp: bigint //64
  minMsgNr: bigint //64
  maxMsgNr: bigint //64
  messageStates: bigint // seq_num offset -> state (2 bits) //128 bitmap
  deliveredMessageCount: bigint //16
}

export const builder = {
  data: (() => {
    const tokenBalanceBuilder: CellCodec<TokenBalance> = {
      encode: (data: TokenBalance): Builder => {
        return beginCell().storeCoins(data.amount).storeBit(data.failed)
      },
      load: (src: Slice): TokenBalance => {
        const amount = src.loadCoins()
        const failed = src.loadBit()
        return {
          amount,
          failed,
        }
      },
    }

    const contractData: CellCodec<MerkleRootStorage> = {
      encode: (data: MerkleRootStorage): Builder => {
        return beginCell()
          .storeUint(data.rootId, 256)
          .storeAddress(data.owner)
          .storeUint(data.timestamp, 64)
          .storeUint(data.minMsgNr, 64)
          .storeUint(data.maxMsgNr, 64)
          .storeUint(data.messageStates, 128)
          .storeUint(data.deliveredMessageCount, 16)
      },
      load: (src: Slice): MerkleRootStorage => {
        const rootId = src.loadUintBig(224)
        const owner = src.loadAddress()
        const timestamp = src.loadUintBig(64)
        const minMsgNr = src.loadUintBig(64)
        const maxMsgNr = src.loadUintBig(64)
        const messageStates = src.loadUintBig(128)
        const deliveredMessageCount = src.loadUintBig(16)
        return {
          rootId,
          owner,
          timestamp,
          minMsgNr,
          maxMsgNr,
          messageStates,
          deliveredMessageCount,
        }
      },
    }

    return {
      tokenBalance: tokenBalanceBuilder,
      contractData,
    }
  })(),
}

export class MerkleRoot implements typeAndVersion.Interface, Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new MerkleRoot(address)
  }

  static createFromConfig(config: MerkleRootStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new MerkleRoot(contractAddress(workchain, init), init)
  }

  async sendInternal(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async getFacilityId(provider: ContractProvider): Promise<bigint> {
    return provider.get('facilityId', []).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  async getErrorCode(provider: ContractProvider, code: bigint): Promise<bigint> {
    return provider.get('errorCode', [{ type: 'int', value: code }]).then((res) => {
      return res.stack.readBigNumber()
    })
  }

  getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    return typeAndVersion.getTypeAndVersion(provider)
  }
  getCode(provider: ContractProvider): Promise<Cell> {
    return typeAndVersion.getCode(provider)
  }
  getCodeHash(provider: ContractProvider): Promise<bigint> {
    return typeAndVersion.getCodeHash(provider)
  }

  static version() {
    return CONTRACT_VERSION
  }

  static type() {
    return FACILITY_NAME
  }

  static code(): Promise<Cell> {
    return contractCode.ccip.local('MerkleRoot')
  }
}
