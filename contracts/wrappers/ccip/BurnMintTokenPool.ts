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
import { crc32 } from 'zlib'
import { facilityId, errorCode } from '../utils'
import { contractCode } from '../codeLoader'
import {
  codec,
  createJettonClientData,
  createTokenPoolData,
  opcodes,
  sendApplyChainUpdates,
  sendReleaseOrMint,
  sendUpdateCursedSubjects,
  sendUpdateRampAccess,
  type ChainUpdate,
  type JettonClientConfig,
  type RampAccess,
  type TokenPoolConfig,
  type ReleaseOrMintInV1,
  type LockOrBurnInV1,
  type LockOrBurnPayload,
} from './TokenPool'

export const FACILITY_NAME = 'link.chain.ton.ccip.BurnMintTokenPool'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))
export const CONTRACT_VERSION = '0.1.0'
const BURN_MINT_CLAIM_MINTER_ADMIN_OPCODE = 0x93c174a1

export type Config = TokenPoolConfig & {
  jettonClient: JettonClientConfig
}

export class BurnMintTokenPool implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new BurnMintTokenPool(address)
  }

  static createFromConfig(config: Config, code: Cell, workchain = 0) {
    const data = beginCell()
      .storeRef(createTokenPoolData(config))
      .storeRef(createJettonClientData(config.jettonClient))
      .storeDict(null)
      .storeDict(null)
      .endCell()

    const init = { code, data }
    return new BurnMintTokenPool(contractAddress(workchain, init), init)
  }

  static code(): Promise<Cell> {
    return contractCode.ccip.local('ccip.pools.BurnMintTokenPool')
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async sendApplyChainUpdates(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: { queryId: bigint; remove: bigint[]; add: ChainUpdate[] },
  ) {
    await sendApplyChainUpdates(provider, via, value, body)
  }

  async sendUpdateRampAccess(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: { queryId: bigint; updates: RampAccess[] },
  ) {
    await sendUpdateRampAccess(provider, via, value, body)
  }

  async sendUpdateCursedSubjects(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    cursedSubjects: bigint[],
  ) {
    await sendUpdateCursedSubjects(provider, via, value, cursedSubjects)
  }

  async sendReleaseOrMint(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    body: {
      queryId: bigint
      request: ReleaseOrMintInV1
      requestedFinalityConfig?: number
      replyTo?: Address | null
    },
  ) {
    await sendReleaseOrMint(provider, via, value, body)
  }

  async sendClaimMinterAdmin(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    queryId: bigint = 0n,
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(BURN_MINT_CLAIM_MINTER_ADMIN_OPCODE, 32)
        .storeUint(queryId, 64)
        .endCell(),
    })
  }

  async getHasPendingBurn(provider: ContractProvider, queryId: bigint) {
    return provider
      .get('hasPendingBurn', [{ type: 'int', value: queryId }])
      .then((res) => res.stack.readBoolean())
  }

  async getHasPendingMint(provider: ContractProvider, queryId: bigint) {
    return provider
      .get('hasPendingMint', [{ type: 'int', value: queryId }])
      .then((res) => res.stack.readBoolean())
  }

  async getVerifyNotCursed(provider: ContractProvider, subject: bigint) {
    return provider
      .get('verifyNotCursed', [{ type: 'int', value: subject }])
      .then((res) => res.stack.readBoolean())
  }

  async getOnRamp(provider: ContractProvider, remoteChainSelector: bigint) {
    return provider
      .get('onRamp', [{ type: 'int', value: remoteChainSelector }])
      .then((res) => res.stack.readAddressOpt())
  }

  async getOffRamp(provider: ContractProvider, remoteChainSelector: bigint) {
    return provider
      .get('offRamp', [{ type: 'int', value: remoteChainSelector }])
      .then((res) => res.stack.readAddressOpt())
  }

  async getIsSupportedChain(provider: ContractProvider, remoteChainSelector: bigint) {
    return provider
      .get('isSupportedChain', [{ type: 'int', value: remoteChainSelector }])
      .then((res) => res.stack.readBoolean())
  }
}

export { codec, opcodes }
export type {
  ChainUpdate,
  JettonClientConfig,
  LockOrBurnInV1,
  LockOrBurnPayload,
  RampAccess,
  ReleaseOrMintInV1,
}
