import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'

import { Ownable2StepConfig } from '../libraries/access/Ownable2Step'
import { OCR3Base, ReportContext, SignatureEd25519 } from '../libraries/ocr/MultiOCR3Base'

import { asSnakeData, fromSnakeData } from '../../utils/Utils'

export type OffRampStorage = {
  ownable: Ownable2StepConfig
  deployerCode: Cell
  merkleRootCode: Cell
  feeQuoter: Address
  chainSelector: bigint
  permissionlessExecutionThresholdSeconds: number
  latestPriceSequenceNumber: bigint
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

export type CrossChainAddress = Slice

export type RampMessageHeader = {
  messageId: bigint, //256
  sourceChainSelector: bigint, //64
  destChainSelector: bigint, //64
  sequenceNumber: bigint, //64
  nonce: bigint, //64
}

export type Any2TVMRampMessage = {
  header: RampMessageHeader,
  sender: CrossChainAddress,
  data: Cell,
  receiver: Address,
  //gasLimit: coins , does not make sense here
  tokenAmounts?: Cell, // vec<Any2TONTokenTransfer>
}

export type MerkleRoot = {
  sourceChainSelector: bigint
  onRampAddress: CrossChainAddress,
  minSeqNr: bigint,
  maxSeqNr: bigint,
  merkleRoot: bigint
}

export const Builder = {
  asStorage: (config: OffRampStorage): Cell => {
    return (
      beginCell()
        .storeAddress(config.ownable.owner)
        .storeMaybeBuilder(
          config.ownable.pendingOwner
            ? beginCell().storeAddress(config.ownable.pendingOwner)
            : null,
        )
        .storeRef(config.deployerCode)
        .storeRef(config.merkleRootCode)
        .storeAddress(config.feeQuoter)
        // empty OCR3Base::
        .storeUint(1, 8) //chainId
        .storeBit(false)
        .storeBit(false)
        .storeUint(config.chainSelector, 64)
        .storeUint(config.permissionlessExecutionThresholdSeconds, 32)
        .storeDict(Dictionary.empty()) // sourceChainConfigs
        .storeUint(64, 16) // keyLen
        .storeUint(config.latestPriceSequenceNumber, 64)
        .endCell()
    )
  },
}
export abstract class Params {}

export abstract class Opcodes {
  static commit = 0x00000001
  static execute = 0x00000002
}

export abstract class Errors {}

export class OffRamp extends OCR3Base {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {
    super()
  }

  static createFromAddress(address: Address) {
    return new OffRamp(address)
  }

  static createFromConfig(config: OffRampStorage, code: Cell, workchain = 0) {
    const data = Builder.asStorage(config)
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
      body: beginCell().endCell(),
    })
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
        .storeRef(commitReportToCell(opts.report))
        .storeRef(asSnakeData(opts.signatures, (item) =>
            beginCell()
            .storeUint(item.r, 256)
            .storeUint(item.s, 256)
            .storeUint(item.signer, 256)))
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
      signatures: SignatureEd25519[]
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
        .storeRef(ExecutionReportToCell(opts.report))
        .storeRef(asSnakeData(opts.signatures, (item) =>
            beginCell()
            .storeUint(item.r, 256)
            .storeUint(item.s, 256)
            .storeUint(item.signer, 256)))
        .endCell(),
    })
  }
}

export function priceUpdatesToCell(priceUpdates: PriceUpdates): Cell {
    return beginCell()
      .storeRef(asSnakeData(priceUpdates.tokenPriceUpdates, (item) => 
        beginCell()
        .storeAddress(item.sourceToken)
        .storeUint(item.usdPerToken, 224)))
      .storeRef(asSnakeData(priceUpdates.gasPriceUpdates, (item) =>
        beginCell()
        .storeUint(item.destChainSelector, 64)
        .storeUint(item.executionGasPrice, 112)
        .storeUint(item.dataAvailabilityGasPrice, 112)))
      .endCell()
}

export function priceUpdatesFromCell(data: Cell): PriceUpdates {
  const cs = data.beginParse()

  const tokenPriceUpdates: TokenPriceUpdate[] = fromSnakeData(cs.loadRef(), (x) => {
    const sourceToken = x.loadAddress()
    const usdPerToken = x.loadUintBig(224)
    return {sourceToken, usdPerToken}
  })

  const gasPriceUpdates: GasPriceUpdate[] = fromSnakeData(cs.loadRef(), (x) => {
    const destChainSelector = x.loadUintBig(64)
    const executionGasPrice = x.loadUintBig(112)
    const dataAvailabilityGasPrice = x.loadUintBig(112)
    return {destChainSelector, executionGasPrice, dataAvailabilityGasPrice}
  })

  return {tokenPriceUpdates, gasPriceUpdates}
}

export function merkleRootsToCell(roots: MerkleRoot[]): Cell {
  return asSnakeData(roots, (item) => 
      beginCell()
      .storeUint(item.sourceChainSelector, 64)
      .storeSlice(item.onRampAddress)
      .storeUint(item.minSeqNr, 64)
      .storeUint(item.maxSeqNr, 64)
      .storeUint(item.merkleRoot, 256))
}

export function merkleRootsFromCell(data: Cell): MerkleRoot[] {
  return fromSnakeData(data, (x) => {
    const sourceChainSelector = x.loadUintBig(64)
    const onRampAddress = x.loadRef().beginParse()
    const minSeqNr = x.loadUintBig(64)
    const maxSeqNr = x.loadUintBig(64)
    const merkleRoot = x.loadUintBig(256)
    return {
      sourceChainSelector,
      onRampAddress,
      minSeqNr,
      maxSeqNr,
      merkleRoot
    }
  }) 
}

export function commitReportToCell(report: CommitReport): Cell {
  let priceUpdates: Cell | undefined = undefined
  if (report.priceUpdates != undefined) {
    priceUpdates = priceUpdatesToCell(report.priceUpdates!)
  }

  return beginCell()
    .storeMaybeRef(priceUpdates)
    .storeRef(merkleRootsToCell(report.merkleRoots))
    .endCell()
}

function ExecutionReportToCell(report: ExecutionReport): Cell | import("@ton/core").Builder {
    throw new Error('Function not implemented.')
}
