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
  Builder,
  TupleItem,
} from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId, CellCodec } from '../utils'

import * as ownable2step from '../libraries/access/Ownable2Step'
import * as withdrawable from '../libraries/funding/Withdrawable'
import { asSnakedCell, fromSnakeData } from '../../src/utils'
import * as rt from './Router'
import * as upgradeable from '../libraries/versioning/Upgradeable'
import * as typeAndVersion from '../libraries/versioning/TypeAndVersion'
import { contractCode } from '../codeLoader'
import * as fq from './FeeQuoter'

export const ARTIFACT_NAME = 'OnRamp'
export const FACILITY_NAME = 'link.chain.ton.ccip.OnRamp'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<Cell>> = {
  '1.6.0': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME), // Last bundle with version 1.6.0
}
export const CONTRACT_VERSION = '1.6.1'

export const opcodes = {
  in: {
    onrampSend: 0xdcf993c2,
    getValidatedFee: 0x9c2ccc7e,
    get messageValidated() {
      return fq.opcodes.out.messageValidated
    },
    get messageValidationFailed() {
      return fq.opcodes.out.messageValidationFailed
    },
    executorRequestsLockOrBurn: 0x9be1fb61,
    executorFinishedSuccessfully: 0xcfa6b336,
    executorFinishedWithError: 0xc4068e21,
    setDynamicConfig: 0xa178c62e,
    updateDestChainConfigs: 0x1a246b6c,
    updateSendExecutor: 0x82901c45,
    updateAllowlists: 0x9dc06185,
    withdrawFeeTokens: 0x7052dc75,
  },
  out: {
    messageValidated: 0x2afb11bd,
    messageValidationFailed: 0xac1dd12e,
  },
}
