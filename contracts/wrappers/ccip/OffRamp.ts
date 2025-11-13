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
} from '@ton/core'
import { Maybe } from '@ton/core/dist/utils/maybe'
import { compile } from '@ton/blueprint'
import { crc32 } from 'zlib'

import { CellCodec } from '../utils'
import { OCR3Base, ReportContext, SignatureEd25519 } from '../libraries/ocr/MultiOCR3Base'
import { asSnakeData, fromSnakeData, bigIntToUint8Array } from '../../src/utils/types'
import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'

export const Opcodes = {
  commit: crc32('OffRamp_Commit'),
  execute: crc32('OffRamp_Execute'),
  manualExecute: crc32('OffRamp_ManuallyExecute'),
  updateSourceChainConfig: crc32('OffRamp_UpdateSourceChainConfig'),
  dispatchValidated: crc32('OffRamp_DispatchValidated'),
  ccipReceiveConfirm: crc32('OffRamp_CCIPReceiveConfirm'),
  updateCursedSubjects: crc32('OffRamp_UpdateCursedSubjects'),
  setDynamicConfig: crc32('OffRamp_SetDynamicConfig'),
}

export const OFFRAMP_CONTRACT_VERSION = '0.0.12'

export const OFFRAMP_FACILITY_NAME = 'com.chainlink.ton.ccip.OffRamp'
export const OFFRAMP_FACILITY_ID = 84
export const OFFRAMP_ERROR_CODE = 8400 //FACILITY_ID * 100

export const RECEIVE_EXECUTOR_FACILITY_NAME = 'com.chainlink.ton.ccip.ReceiveExecutor'
export const RECEIVE_EXECUTOR_FACILITY_ID = 338
export const RECEIVE_EXECUTOR_ERROR_CODE = 33800 //FACILITY_ID * 100

export enum OffRampError {
  MessageNotFromOwnedContract = OFFRAMP_ERROR_CODE,
  SourceChainNotEnabled,
  EmptyExecutionReport,
  InvalidMessageDestChainSelector,
  SourceChainSelectorMismatch,
  InvalidOnRampUpdate,
  SenderIsNotRouter,
  InsufficientFee,
  SubjectCursed,
  Unauthorized,
  ZeroAddressNotAllowed,
}

export enum ReceiveExecutorError {
  StateIsNotUntouched = RECEIVE_EXECUTOR_ERROR_CODE, // Facility ID * 100
  UpdatingStateOfNonExecutedMessage,
  NotificationFromInvalidReceiver,
  Unauthorized,
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

//TODO: Refactor these with the CellCodec<T> pattern

export const builder = {
  data: (() => {
    const contractData: CellCodec<OffRampStorage> = {
      encode: (storage: OffRampStorage): Builder => {
        return (
          beginCell()
            .storeUint(storage.id, 32)
            .storeAddress(storage.ownable.owner)
            .storeMaybeBuilder(
              storage.ownable.pendingOwner
                ? beginCell().storeAddress(storage.ownable.pendingOwner)
                : null,
            )
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

      load: (src: Slice): OffRampStorage => {
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

    return {
      contractData,
      any2TVMMessage,
    }
  })(),
  message: {
    in: (() => {
      return {}
    })(),
  },
}

export abstract class Params {}
export class OffRamp
  extends OCR3Base
  implements upgradeable.Interface, withdrawable.Interface, typeAndVersion.Interface, Contract
{
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
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
    return OFFRAMP_FACILITY_NAME
  }

  static async code() {
    return await compile('OffRamp')
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
      body: beginCell()
        .storeUint(Opcodes.commit, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeUint(opts.reportContext.configDigest, 256)
        .storeUint(opts.reportContext.padding, 192) //should be zero
        .storeUint(opts.reportContext.sequenceBytes, 64)
        .storeBuilder(commitReportToBuilder(opts.report))
        .storeRef(
          asSnakeData(opts.signatures, (item) =>
            beginCell().storeUint(item.signer, 256).storeUint(item.r, 256).storeUint(item.s, 256),
          ),
        )
        .endCell(),
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
      body: beginCell()
        .storeUint(Opcodes.execute, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeUint(opts.reportContext.configDigest, 256)
        .storeUint(opts.reportContext.padding, 192) //should be zero
        .storeUint(opts.reportContext.sequenceBytes, 64)
        .storeBuilder(ExecutionReportToBuilder(opts.report))
        .endCell(),
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
      body: beginCell()
        .storeUint(Opcodes.manualExecute, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeBuilder(ExecutionReportToBuilder(opts.report))
        .storeCoins(opts.gasOverride ?? 0)
        .endCell(),
    })
  }

  async sendUpdateSourceChainConfig(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryID?: number
      sourceChainSelector: bigint
      config: SourceChainConfig
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.updateSourceChainConfig, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeUint(opts.sourceChainSelector, 64)
        .storeBuilder(sourceChainConfigToBuilder(opts.config))
        .endCell(),
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
    let subjects = Dictionary.empty(Dictionary.Keys.BigInt(128), Dictionary.Values.Bool())
    for (const subject of opts.subjects) {
      subjects.set(subject, true)
    }

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.updateCursedSubjects, 32).storeDict(subjects).endCell(),
    })
  }

  async setDynamicConfig(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint
      queryId: bigint
      feeQuoter: Address
      permissionlessExecutionThresholdSeconds: number
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.setDynamicConfig, 32)
        .storeUint(opts.queryId, 64)
        .storeAddress(opts.feeQuoter)
        .storeUint(opts.permissionlessExecutionThresholdSeconds, 32)
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
      body: beginCell()
        .storeUint(Opcodes.dispatchValidated, 32)
        .storeRef(Any2TVMRampMessageToBuilder(opts.message))
        .storeUint(opts.execId, 192)
        .storeMaybeUint(opts.gasOverride, 64)
        .endCell(),
    })
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
    const onRampLength = onRampSlice.loadUint(8)
    const onRamp = onRampSlice.loadBuffer(onRampLength)

    return {
      router,
      isEnabled,
      minSeqNr,
      isRMNVerificationDisabled,
      onRamp,
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
}

export function priceUpdatesToCell(priceUpdates: PriceUpdates): Cell {
  return beginCell()
    .storeRef(
      asSnakeData(priceUpdates.tokenPriceUpdates, (item) =>
        beginCell().storeAddress(item.sourceToken).storeUint(item.usdPerToken, 224),
      ),
    )
    .storeRef(
      asSnakeData(priceUpdates.gasPriceUpdates, (item) =>
        beginCell()
          .storeUint(item.destChainSelector, 64)
          .storeUint(item.executionGasPrice, 112)
          .storeUint(item.dataAvailabilityGasPrice, 112),
      ),
    )
    .endCell()
}

export function priceUpdatesFromCell(data: Cell): PriceUpdates {
  const cs = data.beginParse()

  const tokenPriceUpdates: TokenPriceUpdate[] = fromSnakeData(cs.loadRef(), (x) => {
    const sourceToken = x.loadAddress()
    const usdPerToken = x.loadUintBig(224)
    return { sourceToken, usdPerToken }
  })

  const gasPriceUpdates: GasPriceUpdate[] = fromSnakeData(cs.loadRef(), (x) => {
    const destChainSelector = x.loadUintBig(64)
    const executionGasPrice = x.loadUintBig(112)
    const dataAvailabilityGasPrice = x.loadUintBig(112)
    return { destChainSelector, executionGasPrice, dataAvailabilityGasPrice }
  })

  return { tokenPriceUpdates, gasPriceUpdates }
}

export function merkleRootsToCell(roots: MerkleRoot[]): Cell {
  return asSnakeData(roots, (item) =>
    beginCell()
      .storeUint(item.sourceChainSelector, 64)
      .storeUint(item.onRampAddress.byteLength, 8)
      .storeBuffer(item.onRampAddress, item.onRampAddress.byteLength)
      .storeUint(item.minSeqNr, 64)
      .storeUint(item.maxSeqNr, 64)
      .storeUint(item.merkleRoot, 256),
  )
}

export function merkleRootFromSlice(data: Slice): MerkleRoot {
  const sourceChainSelector = data.loadUintBig(64)
  const onRampAddressLength = data.loadUint(8)
  const onRampAddress = Buffer.from(bigIntToUint8Array(data.loadUintBig(onRampAddressLength * 8)))
  const minSeqNr = data.loadUintBig(64)
  const maxSeqNr = data.loadUintBig(64)
  const merkleRoot = data.loadUintBig(256)
  return {
    sourceChainSelector,
    onRampAddress,
    minSeqNr,
    maxSeqNr,
    merkleRoot,
  }
}

export function commitReportToBuilder(report: CommitReport): import('@ton/core').Builder {
  let priceUpdates: Cell | undefined = undefined
  if (report.priceUpdates != undefined) {
    priceUpdates = priceUpdatesToCell(report.priceUpdates!)
  }

  return beginCell().storeMaybeRef(priceUpdates).storeRef(merkleRootsToCell(report.merkleRoots))
}

export const sourceChainConfigToBuilder = (config: SourceChainConfig) => {
  return beginCell()
    .storeAddress(config.router)
    .storeBit(config.isEnabled)
    .storeUint(config.minSeqNr, 64)
    .storeBit(config.isRMNVerificationDisabled)
    .storeUint(config.onRamp.byteLength, 8)
    .storeBuffer(config.onRamp, config.onRamp.byteLength)
}

export const sourceChainConfigFromSlice = (slice: Slice): SourceChainConfig => {
  return {
    router: slice.loadAddress(),
    isEnabled: slice.loadBit(),
    minSeqNr: slice.loadUintBig(64),
    isRMNVerificationDisabled: slice.loadBit(),
    onRamp: slice.loadBuffer(slice.loadUint(8)),
  }
}

export function ExecutionReportToBuilder(report: ExecutionReport) {
  return beginCell()
    .storeUint(report.sourceChainSelector, 64)
    .storeRef(
      asSnakeData(report.messages, (message) => {
        return Any2TVMRampMessageToBuilder(message)
      }),
    )
    .storeRef(Cell.EMPTY) //TODO: offchainTokenData
    .storeRef(
      asSnakeData(report.proofs, (proof) => {
        return beginCell().storeUint(proof, 256)
      }),
    )
    .storeUint(report.proofFlagBits, 256)
}

export function Any2TVMRampMessageToBuilder(message: Any2TVMRampMessage) {
  return beginCell()
    .storeBuilder(RampMessageHeaderToBuidler(message.header))
    .storeRef(
      beginCell()
        .storeUint(message.sender.byteLength, 8)
        .storeBuffer(message.sender, message.sender.byteLength)
        .endCell(),
    )
    .storeRef(message.data)
    .storeAddress(message.receiver)
    .storeCoins(message.gasLimit)
    .storeMaybeRef(message.tokenAmounts)
}

function RampMessageHeaderToBuidler(header: RampMessageHeader) {
  return beginCell()
    .storeUint(header.messageId, 256)
    .storeUint(header.sourceChainSelector, 64)
    .storeUint(header.destChainSelector, 64)
    .storeUint(header.sequenceNumber, 64)
    .storeUint(header.nonce, 64)
}
