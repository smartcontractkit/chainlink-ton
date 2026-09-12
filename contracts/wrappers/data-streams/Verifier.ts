import { crc32 } from 'zlib'
import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core'
import { errorCode, facilityId } from '../utils'
import { contractCode } from '../codeLoader'

export const ARTIFACT_NAME = 'Verifier'
export const CONTRACT_VERSION = '1.0.0'

export const FACILITY_NAME = 'link.chain.ton.data_streams.Verifier'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const opcodes = {
  in: {
    setConfig:        0x1c46b5bf,
    updateConfig:     0x2137fc70,
    activateConfig:   0x255a07ca,
    deactivateConfig: 0x070259c2,
    verify:           0xb3597b7a,
    // Ownable2Step (delegated)
    transferOwnership: 0xf21b7da1,
    acceptOwnership:   0xf9e29e4a,
  },
}

export const Errors = {
  ConfigDigestAlreadySet:       ERROR_CODE + 0,
  ConfigDigestNotSet:           ERROR_CODE + 1,
  DigestInactive:               ERROR_CODE + 2,
  FaultToleranceMustBePositive: ERROR_CODE + 3,
  ExcessSigners:                ERROR_CODE + 4,
  InsufficientSigners:          ERROR_CODE + 5,
  MalformedPayload:             ERROR_CODE + 6,
  MismatchedSignatures:         ERROR_CODE + 7,
  IncorrectSignatureCount:      ERROR_CODE + 8,
  ZeroAddress:                  ERROR_CODE + 9,
  NonUniqueSigningKeys:         ERROR_CODE + 10,
  InvalidSignature:             ERROR_CODE + 11,
  UnauthorizedSigner:           ERROR_CODE + 12,
  PrevSignerCountMismatch:      ERROR_CODE + 13,
  PrevSignerNotFound:           ERROR_CODE + 14,
}

export type ContractData = {
  owner: Address
}

export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0): ContractClient {
    // Storage layout: Ownable2Step{ owner, pendingOwner? } + configs dict
    const dataCell = beginCell()
      .storeAddress(data.owner)  // ownable.owner
      .storeAddress(null)         // ownable.pendingOwner = null
      .storeBit(false)            // configs = empty dict
      .endCell()
    const init = { code, data: dataCell }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  static code(): Promise<Cell> {
    return contractCode.dataStreams.local('Verifier')
  }

  private async sendInternal(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: Cell,
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    })
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint = 0n) {
    await this.sendInternal(provider, via, value, Cell.EMPTY)
  }

  async sendSetConfig(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    params: { configDigest: bigint; f: number; signers: Cell; signerCount: number },
  ) {
    const body = beginCell()
      .storeUint(opcodes.in.setConfig, 32)
      .storeUint(params.configDigest, 256)
      .storeUint(params.f, 8)
      .storeRef(params.signers)
      .storeUint(params.signerCount, 8)
      .endCell()
    return this.sendInternal(provider, via, value, body)
  }

  async sendUpdateConfig(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    params: {
      configDigest: bigint
      f: number
      prevSigners: Cell
      prevSignerCount: number
      newSigners: Cell
      newSignerCount: number
    },
  ) {
    const body = beginCell()
      .storeUint(opcodes.in.updateConfig, 32)
      .storeUint(params.configDigest, 256)
      .storeUint(params.f, 8)
      .storeRef(params.prevSigners)
      .storeUint(params.prevSignerCount, 8)
      .storeRef(params.newSigners)
      .storeUint(params.newSignerCount, 8)
      .endCell()
    return this.sendInternal(provider, via, value, body)
  }

  async sendActivateConfig(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    params: { configDigest: bigint },
  ) {
    const body = beginCell()
      .storeUint(opcodes.in.activateConfig, 32)
      .storeUint(params.configDigest, 256)
      .endCell()
    return this.sendInternal(provider, via, value, body)
  }

  async sendDeactivateConfig(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    params: { configDigest: bigint },
  ) {
    const body = beginCell()
      .storeUint(opcodes.in.deactivateConfig, 32)
      .storeUint(params.configDigest, 256)
      .endCell()
    return this.sendInternal(provider, via, value, body)
  }

  async sendVerify(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    params: { data: Cell },
  ) {
    const body = beginCell()
      .storeUint(opcodes.in.verify, 32)
      .storeRef(params.data)
      .endCell()
    return this.sendInternal(provider, via, value, body)
  }

  async sendTransferOwnership(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    params: { newOwner: Address },
  ) {
    const body = beginCell()
      .storeUint(opcodes.in.transferOwnership, 32)
      .storeUint(0, 64)  // queryId = 0
      .storeAddress(params.newOwner)
      .endCell()
    return this.sendInternal(provider, via, value, body)
  }

  async sendAcceptOwnership(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
  ) {
    const body = beginCell()
      .storeUint(opcodes.in.acceptOwnership, 32)
      .storeUint(0, 64)  // queryId = 0
      .endCell()
    return this.sendInternal(provider, via, value, body)
  }

  async getOwner(provider: ContractProvider): Promise<Address> {
    const result = await provider.get('owner', [])
    return result.stack.readAddress()
  }

  async getPendingOwner(provider: ContractProvider): Promise<Address | null> {
    const result = await provider.get('pendingOwner', [])
    return result.stack.readAddressOpt()
  }

  async getTypeAndVersion(provider: ContractProvider): Promise<{ type: string; version: string }> {
    const result = await provider.get('typeAndVersion', [])
    const typeSlice = result.stack.readCell().beginParse()
    const versionSlice = result.stack.readCell().beginParse()
    return {
      type: typeSlice.loadStringTail(),
      version: versionSlice.loadStringTail(),
    }
  }

  async getConfigIsSet(provider: ContractProvider, configDigest: bigint): Promise<boolean> {
    const result = await provider.get('configIsSet', [{ type: 'int', value: configDigest }])
    return result.stack.readBoolean()
  }
}
