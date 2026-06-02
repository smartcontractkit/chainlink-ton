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

import { crc32 } from 'zlib'
import { errorCode, facilityId, CellCodec } from '../utils'
import { contractCode, loadContractCode } from '../codeLoader'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as receiver from '../libraries/Receiver'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as upgradeable from '../libraries/versioning/Upgradeable'

export const FACILITY_NAME = 'link.chain.ton.ccip.test.Receiver'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))
export const CONTRACT_VERSION = '1.6.1'

export const ARTIFACT_NAME = 'ccip.test.receiver'
export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<Cell>> = {
  '1.6.0': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME), // Last bundle with version 1.6.0
}

enum TestReceiverError {
  Rejected = 19100, // Facility ID * 100
}

export const error = {
  ...receiver.error,
  ...TestReceiverError,
}

export enum ReceiverBehavior {
  Accept = 0,
  RejectAll,
  ConsumeAllGas,
}

export type Storage = {
  id: bigint
  ownable: ownable2step.Data
  authorizedCaller: Address
  behavior: ReceiverBehavior
}

export const opcodes = {
  in: {
    ...receiver.opcodes.in,
    updateBehavior: 0xcf87a147,
    updateAuthorizedCaller: 0x9f5e489f,
  },
}

export type UpdateAuthorizedCaller = {
  authorizedCaller: Address
}

export type UpdateBehavior = {
  behavior: ReceiverBehavior
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<Storage> = {
      encode: (storage: Storage): Builder => {
        return beginCell()
          .storeUint(storage.id, 32)
          .storeBuilder(ownable2step.builder.data.traitData.encode(storage.ownable))
          .storeAddress(storage.authorizedCaller)
          .storeUint(storage.behavior, 8)
      },

      load: (src: Slice): Storage => {
        const id = src.loadUint(32)
        const ownable = ownable2step.builder.data.traitData.load(src)
        const authorizedCaller = src.loadAddress()
        const behavior = src.loadUint(8)

        return {
          id: BigInt(id),
          ownable,
          authorizedCaller,
          behavior,
        }
      },
    }

    return {
      contractData,
    }
  })(),
  message: {
    in: (() => {
      const updateAuthorizedCaller: CellCodec<UpdateAuthorizedCaller> = {
        encode: (opts: UpdateAuthorizedCaller): Builder => {
          return beginCell()
            .storeUint(opcodes.in.updateAuthorizedCaller, 32)
            .storeAddress(opts.authorizedCaller)
        },
        load: function (src: Slice): UpdateAuthorizedCaller {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            authorizedCaller: src.loadAddress(),
          }
        },
      }

      const updateBehavior: CellCodec<UpdateBehavior> = {
        encode: (opts: UpdateBehavior): Builder => {
          return beginCell()
            .storeUint(opcodes.in.updateBehavior, 32)
            .storeUint(Number(opts.behavior), 8)
        },
        load: function (src: Slice): UpdateBehavior {
          // TODO We can check that the opcode matches
          src.skip(32)

          return {
            behavior: src.loadUint(8),
          }
        },
      }

      return {
        ccipReceive: receiver.builder.message.in.ccipReceive,
        updateAuthorizedCaller,
        updateBehavior,
      }
    })(),
  },
}

export class Receiver implements Contract, receiver.Receiver, upgradeable.Interface {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new Receiver(address)
  }

  static createFromConfig(config: Storage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).asCell()
    const init = { code, data }
    return new Receiver(contractAddress(workchain, init), init)
  }

  static type() {
    return FACILITY_NAME
  }

  static version() {
    return CONTRACT_VERSION
  }

  static code(): Promise<Cell> {
    return loadContractCode(ARTIFACT_NAME)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: upgradeable.Upgrade,
  ): Promise<void> {
    return upgradeable.sendUpgrade(provider, via, value, body)
  }

  async sendCCIPReceive(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: receiver.CCIPReceive,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.ccipReceive.encode(body).asCell(),
    })
  }

  async sendUpdateAuthorizedCaller(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: UpdateAuthorizedCaller,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateAuthorizedCaller.encode(body).asCell(),
    })
  }

  async sendUpdateBehavior(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: UpdateBehavior,
  ) {
    await provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.message.in.updateBehavior.encode(body).asCell(),
    })
  }

  async getId(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('getId', [])
    return stack.readNumber()
  }

  async getAuthorizedCaller(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get('getAuthorizedCaller', [])
    return stack.readAddress()
  }

  async getBehavior(provider: ContractProvider): Promise<number> {
    const { stack } = await provider.get('getBehavior', [])
    return stack.readNumber()
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
}
