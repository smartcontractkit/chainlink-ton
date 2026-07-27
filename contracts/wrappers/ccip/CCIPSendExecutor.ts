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
import { contractCode } from '../codeLoader'

import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import * as or from './OnRamp'
import * as fq from './FeeQuoter'

export const CONTRACT_VERSION = '1.6.1'

export const FACILITY_NAME = 'link.chain.ton.ccip.CCIPSendExecutor'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum error {
  StateNotExpected = 17800, // Facility ID * 100
  Unauthorized,
  InsufficientFunds,
  InsufficientFee,
  FeeQuoterBounce,
}

export type InitialData = {
  onramp: Address
  id: bigint
}

export type Data = {
  id: bigint
  onrampSend: or.OnRampSend
  addresses: Addresses
  state: State
}

export type Addresses = {
  onramp: Address
  feeQuoter: Address
  // Null when the send carries no token transfers.
  tokenRegistry?: Address | null
}

export type State =
  | Initialized
  | OnGoingFeeValidation
  | TokenRegistryAccess
  | TokenTransfer
  | Finalized

export type Initialized = {
  kind: 'initialized'
}

export type OnGoingFeeValidation = {
  kind: 'on-going-fee-validation'
}

export type TokenRegistryAccess = {
  kind: 'token-registry-access'
  fee: fq.Fee
}

export type TokenTransfer = {
  kind: 'token-transfer'
  tokenPool: Address
  fee: fq.Fee
}

export type Finalized = {
  kind: 'finalized'
}

export type Config = {
  feeQuoter: Address
}

export type Execute = {
  onrampSend: or.OnRampSend
  config: Config
}

export const opcodes = {
  in: {
    execute: 0xaf3c62b3,
    messageValidated: fq.opcodes.out.messageValidated,
    messageValidationFailed: fq.opcodes.out.messageValidationFailed,
    tokenRegistryReturnTokenInfo: 0xddccddb5,
  },
}
