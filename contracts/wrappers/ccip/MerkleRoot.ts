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

import { CellCodec } from '../utils'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { loadContractCode } from '../codeLoader'
import * as or from './OffRamp'

export const MERKLE_ROOT_CONTRACT_VERSION = '1.6.0'

export const MERKLE_ROOT_FACILITY_NAME = 'com.chainlink.ton.ccip.MerkleRoot'
export const MERKLE_ROOT_FACILITY_ID = 479
export const MERKLE_ROOT_ERROR_CODE = 47900 //FACILITY_ID * 100

export enum MerkleRootError {
  AlreadyExecuted = MERKLE_ROOT_ERROR_CODE, // Facility ID * 100
  NotOwner,
  ManualExecutionNotYetEnabled,
  SkippedAlreadyExecutedMessage,
}

export type TokenBalance = {
  amount: bigint
  failed: boolean
}

export abstract class Opcodes {
  static validate = 0x038ede91
  static markState = 0x019f4cd2
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
    return MERKLE_ROOT_CONTRACT_VERSION
  }

  static type() {
    return MERKLE_ROOT_FACILITY_NAME
  }

  static code(): Promise<Cell> {
    return loadContractCode('MerkleRoot')
  }
}
