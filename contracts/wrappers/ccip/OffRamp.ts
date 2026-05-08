import {
  Address,
  beginCell,
  Cell,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
  Builder,
  ContractABI,
  Contract,
  DictionaryValue,
  TupleItem,
} from '@ton/core'
import { Maybe } from '@ton/core/dist/utils/maybe'
import { loadContractCode } from '../codeLoader'
import { crc32 } from 'zlib'
import { errorCode, facilityId, CellCodec } from '../utils'

import { OCR3Base, ReportContext, SignatureEd25519 } from '../libraries/ocr/MultiOCR3Base'
import { asSnakedCell, fromSnakeData, bigIntToUint8Array } from '../../src/utils/types'
import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'

export const opcodes = {
  in: {
    commit: crc32('OffRamp_Commit'),
    execute: crc32('OffRamp_Execute'),
    manualExecute: crc32('OffRamp_ManuallyExecute'),
    updateSourceChainConfigs: crc32('OffRamp_UpdateSourceChainConfigs'),
    dispatchValidated: crc32('OffRamp_DispatchValidated'),
    ccipReceiveConfirm: crc32('OffRamp_CCIPReceiveConfirm'),
    updateCursedSubjects: crc32('OffRamp_UpdateCursedSubjects'),
    setDynamicConfig: crc32('OffRamp_SetDynamicConfig'),
    updateDeployables: crc32('OffRamp_UpdateDeployables'),
    notifyFailure: crc32('OffRamp_NotifyFailure'),
  },
}

export const OFFRAMP_SUPPORTED_PREV_VERSIONS = ['1.6.0', '1.6.1'] as const
export const OFFRAMP_CONTRACT_VERSION = '1.6.2'

export const FACILITY_NAME = 'link.chain.ton.ccip.OffRamp'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum ExecutionState {
  Untouched = 0,
  InProgress,
  Success,
  Failure,
}

export enum OffRampError {
  MessageNotFromOwnedContract = 22100,
  SourceChainNotEnabled,
  EmptyExecutionReport,
  InvalidMessageDestChainSelector,
  SourceChainSelectorMismatch,
  InvalidOnRampUpdate,
  InsufficientFee,
  SubjectCursed,
  Unauthorized,
  ZeroAddressNotAllowed,
  TooManyMessagesInReport,
  SignatureVerificationRequiredInCommitPlugin,
  SignatureVerificationNotAllowedInExecutionPlugin,
  InvalidInterval,
  BatchingNotSupported,
  OnRampAddressMismatch,
  EmptyCommitReport,
  MerkleRootCannotBeZero,
}

export type OffRampStorage = {
  id: bigint
  ownable: ownable2step.Data
  deployables: Deployables
  feeQuoter: Address
  router: Address
  chainSelector: bigint
  permissionlessExecutionThresholdSeconds: number
  latestPriceSequenceNumber: bigint
}

export type Deployables = {
  deployerCode: Cell
  merkleRootCode: Cell
  receiveExecutorCode: Cell
}

export type UpdateSourceChainConfig = {
  sourceChainSelector: bigint
  config: SourceChainConfig
}

export type SourceChainConfig = {
  router: Address
  isEnabled: boolean
  minSeqNr: bigint
  isRMNVerificationDisabled: boolean
  onRamp: CrossChainAddress
}

export type TokenPriceUpdate = {
  sourceToken: Address
  usdPerToken: bigint
}

export type GasPriceUpdate = {
  destChainSelector: bigint
  executionGasPrice: bigint
  dataAvailabilityGasPrice: bigint
}

export type PriceUpdates = {
  tokenPriceUpdates: TokenPriceUpdate[]
  gasPriceUpdates: GasPriceUpdate[]
}

export type CommitReport = {
  priceUpdates?: PriceUpdates
  merkleRoots: MerkleRoot[]
}

export type ExecutionReport = {
  sourceChainSelector: bigint
  messages: Any2TVMRampMessage[]
  offchainTokenData: bigint[][]
  proofs: bigint[] //256[]
  proofFlagBits: bigint //256
}

export type CrossChainAddress = Buffer

export type RampMessageHeader = {
  messageId: bigint //256
  sourceChainSelector: bigint //64
  destChainSelector: bigint //64
  sequenceNumber: bigint //64
  nonce: bigint //64
}

export type Any2TVMRampMessage = {
  header: RampMessageHeader
  sender: CrossChainAddress
  data: Cell
  receiver: Address
  gasLimit: bigint
  tokenAmounts?: Cell // vec<Any2TONTokenTransfer>
}

export type Any2TVMMessage = {
  messageId: bigint
  sourceChainSelector: bigint
  sender: CrossChainAddress
  data: Cell
  tokenAmounts?: Cell
}

export type MerkleRoot = {
  sourceChainSelector: bigint
  onRampAddress: CrossChainAddress
  minSeqNr: bigint
  maxSeqNr: bigint
  merkleRoot: bigint
}

export type UpdateDeployables = {
  queryId?: bigint
  receiveExecutorCode?: Cell
  merkleRootCode?: Cell
}

export type CCIPReceiveConfirm = {
  execID: bigint
  receiver: Address
}

export type Config = {
  chainSelector: bigint
  feeQuoter: Address
  permissionlessExecutionThresholdSeconds: number
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<OffRampStorage> = {
      encode: (storage: OffRampStorage): Builder => {
        return (
          beginCell()
            .storeUint(storage.id, 32)
            .storeBuilder(ownable2step.builder.data.traitData.encode(storage.ownable))
            .storeRef(
              beginCell()
                .storeAddress(storage.router)
                .storeRef(storage.deployables.deployerCode)
                .storeRef(storage.deployables.merkleRootCode)
                .storeRef(storage.deployables.receiveExecutorCode)
                .endCell(),
            )
            .storeAddress(storage.feeQuoter)
            // empty OCR3Base::
            .storeRef(
              beginCell()
                .storeUint(1, 8) //chainId
                .storeBit(false)
                .storeBit(false)
                .endCell(),
            )
            .storeDict(Dictionary.empty()) // cursedSubjects
            .storeUint(storage.chainSelector, 64)
            .storeUint(storage.permissionlessExecutionThresholdSeconds, 32)
            .storeDict(Dictionary.empty())
            .storeUint(storage.latestPriceSequenceNumber, 64)
        )
      },

      load: (_: Slice): OffRampStorage => {
        throw new Error('Implement me')
      },
    }

    const any2TVMMessage: CellCodec<Any2TVMMessage> = {
      encode: (message: Any2TVMMessage): Builder => {
        return beginCell()
          .storeUint(message.messageId, 256)
          .storeUint(message.sourceChainSelector, 64)
          .storeUint(message.sender.byteLength, 8)
          .storeBuffer(message.sender, message.sender.byteLength)
          .storeRef(message.data)
          .storeMaybeRef(message.tokenAmounts)
      },

      load: (src: Slice): Any2TVMMessage => {
        const messageId = src.loadUintBig(256)
        const sourceChainSelector = src.loadUintBig(64)
        const senderSize = src.loadUint(8)
        const sender = src.loadBuffer(senderSize * 8)

        return {
          messageId,
          sourceChainSelector,
          sender,
          data: src.loadRef(),
        }
      },
    }

    const priceUpdates: CellCodec<PriceUpdates> = {
      encode: (data: PriceUpdates): Builder => {
        return beginCell()
          .storeRef(
            asSnakedCell(data.tokenPriceUpdates, (item) =>
              beginCell().storeAddress(item.sourceToken).storeUint(item.usdPerToken, 224),
            ),
          )
          .storeRef(
            asSnakedCell(data.gasPriceUpdates, (item) =>
              beginCell()
                .storeUint(item.destChainSelector, 64)
                .storeUint(item.executionGasPrice, 112)
                .storeUint(item.dataAvailabilityGasPrice, 112),
            ),
          )
      },

      load: (src: Slice): PriceUpdates => {
        const tokenPriceUpdates: TokenPriceUpdate[] = fromSnakeData(src.loadRef(), (x) => {
          const sourceToken = x.loadAddress()
          const usdPerToken = x.loadUintBig(224)
          return { sourceToken, usdPerToken }
        })

        const gasPriceUpdates: GasPriceUpdate[] = fromSnakeData(src.loadRef(), (x) => {
          const destChainSelector = x.loadUintBig(64)
          const executionGasPrice = x.loadUintBig(112)
          const dataAvailabilityGasPrice = x.loadUintBig(112)
          return { destChainSelector, executionGasPrice, dataAvailabilityGasPrice }
        })

        return { tokenPriceUpdates, gasPriceUpdates }
      },
    }

    const merkleRoot: CellCodec<MerkleRoot> = {
      encode: (data: MerkleRoot): Builder => {
        return beginCell()
          .storeUint(data.sourceChainSelector, 64)
          .storeUint(data.onRampAddress.byteLength, 8)
          .storeBuffer(data.onRampAddress, data.onRampAddress.byteLength)
          .storeUint(data.minSeqNr, 64)
          .storeUint(data.maxSeqNr, 64)
          .storeUint(data.merkleRoot, 256)
      },

      load: (src: Slice): MerkleRoot => {
        const sourceChainSelector = src.loadUintBig(64)
        const onRampAddressLength = src.loadUint(8)
        return {
          sourceChainSelector,
          onRampAddress: Buffer.from(bigIntToUint8Array(src.loadUintBig(onRampAddressLength * 8))),
          minSeqNr: src.loadUintBig(64),
          maxSeqNr: src.loadUintBig(64),
          merkleRoot: src.loadUintBig(256),
        }
      },
    }

    const commitReport: CellCodec<CommitReport> = {
      encode: (data: CommitReport): Builder => {
        let priceUpdatesCell: Cell | undefined = undefined
        if (data.priceUpdates != undefined) {
          priceUpdatesCell = priceUpdates.encode(data.priceUpdates).endCell()
        }

        return beginCell()
          .storeMaybeRef(priceUpdatesCell)
          .storeRef(asSnakedCell(data.merkleRoots, (item) => merkleRoot.encode(item)))
      },

      load: (_: Slice): CommitReport => {
        throw new Error('Implement me')
      },
    }

    const sourceChainConfig: CellCodec<SourceChainConfig> = {
      encode: (data: SourceChainConfig): Builder => {
        return beginCell()
          .storeAddress(data.router)
          .storeBit(data.isEnabled)
          .storeUint(data.minSeqNr, 64)
          .storeBit(data.isRMNVerificationDisabled)
          .storeUint(data.onRamp.byteLength, 8)
          .storeBuffer(data.onRamp, data.onRamp.byteLength)
      },

      load: (src: Slice): SourceChainConfig => {
        return {
          router: src.loadAddress(),
          isEnabled: src.loadBit(),
          minSeqNr: src.loadUintBig(64),
          isRMNVerificationDisabled: src.loadBit(),
          onRamp: src.loadBuffer(src.loadUint(8)),
        }
      },
    }

    const updateSourceChainConfig: CellCodec<UpdateSourceChainConfig> = {
      encode: (data: UpdateSourceChainConfig): Builder => {
        return beginCell()
          .storeUint(data.sourceChainSelector, 64)
          .storeAddress(data.config.router)
          .storeBit(data.config.isEnabled)
          .storeUint(data.config.minSeqNr, 64)
          .storeBit(data.config.isRMNVerificationDisabled)
          .storeUint(data.config.onRamp.byteLength, 8)
          .storeBuffer(data.config.onRamp, data.config.onRamp.byteLength)
      },

      load: (_: Slice): UpdateSourceChainConfig => {
        throw new Error('Implement me')
      },
    }

    const rampMessageHeader: CellCodec<RampMessageHeader> = {
      encode: (data: RampMessageHeader): Builder => {
        return beginCell()
          .storeUint(data.messageId, 256)
          .storeUint(data.sourceChainSelector, 64)
          .storeUint(data.destChainSelector, 64)
          .storeUint(data.sequenceNumber, 64)
          .storeUint(data.nonce, 64)
      },

      load: (_: Slice): RampMessageHeader => {
        throw new Error('Implement me')
      },
    }

    const any2TVMRampMessage: CellCodec<Any2TVMRampMessage> = {
      encode: (data: Any2TVMRampMessage): Builder => {
        return beginCell()
          .storeBuilder(rampMessageHeader.encode(data.header))
          .storeRef(
            beginCell()
              .storeUint(data.sender.byteLength, 8)
              .storeBuffer(data.sender, data.sender.byteLength)
              .endCell(),
          )
          .storeRef(data.data)
          .storeAddress(data.receiver)
          .storeCoins(data.gasLimit)
          .storeMaybeRef(data.tokenAmounts)
      },

      load: (_: Slice): Any2TVMRampMessage => {
        throw new Error('Implement me')
      },
    }

    const executionReport: CellCodec<ExecutionReport> = {
      encode: (data: ExecutionReport): Builder => {
        return beginCell()
          .storeUint(data.sourceChainSelector, 64)
          .storeRef(asSnakedCell(data.messages, any2TVMRampMessage.encode))
          .storeRef(Cell.EMPTY) //TODO: offchainTokenData
          .storeRef(
            asSnakedCell(data.proofs, (proof) => {
              return beginCell().storeUint(proof, 256)
            }),
          )
          .storeUint(data.proofFlagBits, 256)
      },

      load: (_: Slice): ExecutionReport => {
        throw new Error('Implement me')
      },
    }

    return {
      contractData,
      any2TVMMessage,
      priceUpdates,
      merkleRoot,
      commitReport,
      sourceChainConfig,
      updateSourceChainConfig,
      rampMessageHeader,
      any2TVMRampMessage,
      executionReport,
    }
  })(),
  messages: {
    in: (() => {
      const commit: CellCodec<{
        queryID?: number
        reportContext: ReportContext
        report: CommitReport
        signatures: SignatureEd25519[]
      }> = {
        encode: (data): Builder => {
          return beginCell()
            .storeUint(opcodes.in.commit, 32)
            .storeUint(data.queryID ?? 0, 64)
            .storeUint(data.reportContext.configDigest, 256)
            .storeUint(data.reportContext.padding, 192) //should be zero
            .storeUint(data.reportContext.sequenceBytes, 64)
            .storeBuilder(builder.data.commitReport.encode(data.report))
            .storeRef(
              asSnakedCell(data.signatures, (item) =>
                beginCell()
                  .storeUint(item.signer, 256)
                  .storeUint(item.r, 256)
                  .storeUint(item.s, 256),
              ),
            )
        },
        load: (_: Slice) => {
          throw new Error('Implement me')
        },
      }

      const execute: CellCodec<{
        queryID?: number
        reportContext: ReportContext
        report: ExecutionReport
      }> = {
        encode: (data): Builder => {
          return beginCell()
            .storeUint(opcodes.in.execute, 32)
            .storeUint(data.queryID ?? 0, 64)
            .storeUint(data.reportContext.configDigest, 256)
            .storeUint(data.reportContext.padding, 192) //should be zero
            .storeUint(data.reportContext.sequenceBytes, 64)
            .storeBuilder(builder.data.executionReport.encode(data.report))
        },
        load: (_: Slice) => {
          throw new Error('Implement me')
        },
      }

      const manualExecute: CellCodec<{
        queryID?: number
        report: ExecutionReport
        gasOverride?: bigint
      }> = {
        encode: (data): Builder => {
          return beginCell()
            .storeUint(opcodes.in.manualExecute, 32)
            .storeUint(data.queryID ?? 0, 64)
            .storeBuilder(builder.data.executionReport.encode(data.report))
            .storeCoins(data.gasOverride ?? 0)
        },
        load: (_: Slice) => {
          throw new Error('Implement me')
        },
      }

      const updateSourceChainConfigs: CellCodec<{
        queryID?: number
        configs: UpdateSourceChainConfig[]
      }> = {
        encode: (data): Builder => {
          return beginCell()
            .storeUint(opcodes.in.updateSourceChainConfigs, 32)
            .storeUint(data.queryID ?? 0, 64)
            .storeRef(
              asSnakedCell(data.configs, (message) => {
                return builder.data.updateSourceChainConfig.encode(message)
              }),
            )
        },
        load: (_: Slice) => {
          throw new Error('Implement me')
        },
      }

      const updateCursedSubjects: CellCodec<{
        subjects: bigint[]
      }> = {
        encode: (data): Builder => {
          let subjects = Dictionary.empty(Dictionary.Keys.BigInt(128), Dictionary.Values.Bool())
          for (const subject of data.subjects) {
            subjects.set(subject, true)
          }
          return beginCell().storeUint(opcodes.in.updateCursedSubjects, 32).storeDict(subjects)
        },
        load: (_: Slice) => {
          throw new Error('Implement me')
        },
      }

      const setDynamicConfig: CellCodec<{
        queryId?: bigint
        feeQuoter: Address
        permissionlessExecutionThresholdSeconds: number
      }> = {
        encode: (data): Builder => {
          return beginCell()
            .storeUint(opcodes.in.setDynamicConfig, 32)
            .storeUint(data.queryId ?? 0, 64)
            .storeAddress(data.feeQuoter)
            .storeUint(data.permissionlessExecutionThresholdSeconds, 32)
        },
        load: (_: Slice) => {
          throw new Error('Implement me')
        },
      }

      const dispatchValidated: CellCodec<{
        message: Any2TVMRampMessage
        execId: bigint
        gasOverride?: bigint
      }> = {
        encode: (data): Builder => {
          return beginCell()
            .storeUint(opcodes.in.dispatchValidated, 32)
            .storeRef(builder.data.any2TVMRampMessage.encode(data.message))
            .storeUint(data.execId, 192)
            .storeMaybeUint(data.gasOverride, 64)
        },
        load: (_: Slice) => {
          throw new Error('Implement me')
        },
      }
      const updateDeployables: CellCodec<UpdateDeployables> = {
        encode: (message: UpdateDeployables): Builder => {
          return beginCell()
            .storeUint(opcodes.in.updateDeployables, 32)
            .storeUint(message.queryId ?? 0, 64)
            .storeMaybeRef(message.receiveExecutorCode)
            .storeMaybeRef(message.merkleRootCode)
        },

        load: (src: Slice): UpdateDeployables => {
          src.skip(32) //opcode
          return {
            queryId: src.loadUintBig(64),
            receiveExecutorCode: src.loadMaybeRef() ?? undefined,
            merkleRootCode: src.loadMaybeRef() ?? undefined,
          }
        },
      }

      const ccipReceiveConfirm: CellCodec<CCIPReceiveConfirm> = {
        encode: (data: CCIPReceiveConfirm): Builder => {
          return beginCell()
            .storeUint(opcodes.in.ccipReceiveConfirm, 32)
            .storeUint(data.execID, 192)
            .storeAddress(data.receiver)
        },
        load: (src: Slice): CCIPReceiveConfirm => {
          src.skip(32) //opcode
          return {
            execID: src.loadUintBig(192),
            receiver: src.loadAddress(),
          }
        },
      }

      return {
        commit,
        execute,
        manualExecute,
        updateSourceChainConfigs,
        updateCursedSubjects,
        setDynamicConfig,
        dispatchValidated,
        updateDeployables,
        ccipReceiveConfirm,
      }
    })(),
  },
}

export abstract class Params {}
export class OffRamp
  extends OCR3Base
  implements
    upgradeable.Interface,
    withdrawable.Interface,
    typeAndVersion.Interface,
    ownable2step.ContractClient,
    Contract
{
  private ownable: ownable2step.ContractClient
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
    this.ownable = new ownable2step.ContractClient(address)
  }
  abi?: Maybe<ContractABI>

  static createFromAddress(address: Address) {
    return new OffRamp(address)
  }

  static createFromConfig(config: OffRampStorage, code: Cell, workchain = 0) {
    const data = builder.data.contractData.encode(config).endCell()
    const init = { code, data }
    return new OffRamp(contractAddress(workchain, init), init)
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
      body: Cell.EMPTY,
    })
  }

  sendUpgrade(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: upgradeable.Upgrade,
  ): Promise<void> {
    return upgradeable.sendUpgrade(provider, via, value, body)
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
    return OFFRAMP_CONTRACT_VERSION
  }

  static type() {
    return FACILITY_NAME
  }

  static code(): Promise<Cell> {
    return loadContractCode('OffRamp')
  }

  async sendCommit(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      reportContext: ReportContext
      report: CommitReport
      signatures: SignatureEd25519[]
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.commit.encode(opts).endCell(),
    })
  }

  async sendExecute(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      reportContext: ReportContext
      report: ExecutionReport
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.execute.encode(opts).endCell(),
    })
  }

  async sendManualExecute(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      report: ExecutionReport
      gasOverride?: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.manualExecute.encode(opts).endCell(),
    })
  }

  async sendUpdateSourceChainConfigs(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      configs: UpdateSourceChainConfig[]
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.updateSourceChainConfigs.encode(opts).endCell(),
    })
  }

  async sendUpdateCursedSubjects(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      subjects: bigint[]
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.updateCursedSubjects.encode(opts).endCell(),
    })
  }

  async sendSetDynamicConfig(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: bigint
      feeQuoter: Address
      permissionlessExecutionThresholdSeconds: number
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.setDynamicConfig.encode(opts).endCell(),
    })
  }

  async sendUpdateDeployables(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId?: bigint
      receiveExecutorCode?: Cell
      merkleRootCode?: Cell
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.updateDeployables
        .encode({
          queryId: opts.queryId ?? 0n,
          receiveExecutorCode: opts.receiveExecutorCode,
          merkleRootCode: opts.merkleRootCode,
        })
        .endCell(),
    })
  }

  async sendDispatchValidated(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      message: Any2TVMRampMessage
      execId: bigint
      gasOverride?: bigint
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.messages.in.dispatchValidated.encode(opts).endCell(),
    })
  }

  async getCursedSubjects(provider: ContractProvider): Promise<bigint[]> {
    const res = await provider.get('cursedSubjects', [])
    const tupleItems = res.stack.readLispList()
    const cursedSubjects: bigint[] = tupleItems.map((t: TupleItem) => {
      if (t.type != 'int') {
        throw Error('Not an int: ' + t.type)
      }
      return t.value
    })
    return cursedSubjects
  }

  async getLatestPriceSequenceNumber(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('latestPriceSequenceNumber', [])
    return result.stack.readBigNumber()
  }

  async getSourceChainConfig(
    provider: ContractProvider,
    sourceChainSelector: bigint,
  ): Promise<SourceChainConfig> {
    const result = await provider.get('sourceChainConfig', [
      { type: 'int', value: sourceChainSelector },
    ])
    // Tolk returns struct as tuple
    const router = result.stack.readAddress()
    const isEnabled = result.stack.readBoolean()
    const minSeqNr = result.stack.readBigNumber()
    const isRMNVerificationDisabled = result.stack.readBoolean()
    const onRampSlice = result.stack.readCell().beginParse()
    const remainingBits = onRampSlice.remainingBits
    const onRamp = onRampSlice.loadBuffer(remainingBits / 8)

    return {
      router,
      isEnabled,
      minSeqNr,
      isRMNVerificationDisabled,
      onRamp,
    }
  }

  async getAllSourceChainConfigs(provider: ContractProvider) {
    const result = await provider.get('allSourceChainConfigs', [])
    const cell = result.stack.readCell()

    const dictValueSpec: DictionaryValue<SourceChainConfig> = {
      serialize: builder.data.sourceChainConfig.encode,
      parse: builder.data.sourceChainConfig.load,
    }

    const dict = Dictionary.loadDirect(Dictionary.Keys.BigInt(64), dictValueSpec, cell)

    let configs: UpdateSourceChainConfig[] = []

    dict.keys().forEach((key) => {
      configs.push({
        sourceChainSelector: key,
        config: dict.get(key)!,
      })
    })
    return configs
  }

  async getConfig(provider: ContractProvider): Promise<Config> {
    const result = await provider.get('config', [])
    const chainSelector = result.stack.readBigNumber()
    const feeQuoter = result.stack.readAddress()
    const permissionlessExecutionThresholdSeconds = result.stack.readNumber()
    return {
      chainSelector,
      feeQuoter,
      permissionlessExecutionThresholdSeconds,
    }
  }

  async getDeployableHashes(provider: ContractProvider): Promise<{
    deployerCodeHash: bigint
    merkleRootCodeHash: bigint
    receiveExecutorCodeHash: bigint
  }> {
    const result = await provider.get('deployableHashes', [])
    const merkleRootCodeHash = result.stack.readBigNumber()
    const receiveExecutorCodeHash = result.stack.readBigNumber()
    const deployerCodeHash = result.stack.readBigNumber()
    return {
      merkleRootCodeHash,
      receiveExecutorCodeHash,
      deployerCodeHash,
    }
  }

  // Withdrawable methods
  async sendWithdraw(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: withdrawable.Withdraw,
  ) {
    await withdrawable.sendWithdraw(provider, via, value, body)
  }

  async getReserve(provider: ContractProvider): Promise<bigint> {
    return await withdrawable.getReserve(provider)
  }

  // Ownership methods
  async getOwner(provider: ContractProvider): Promise<Address> {
    return this.ownable.getOwner(provider)
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    return this.ownable.getPendingOwner(provider)
  }

  async sendTransferOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: ownable2step.TransferOwnership,
  ) {
    return this.ownable.sendTransferOwnership(p, via, value, body)
  }

  async sendAcceptOwnership(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: ownable2step.AcceptOwnership,
  ) {
    return this.ownable.sendAcceptOwnership(p, via, value, body)
  }
}
