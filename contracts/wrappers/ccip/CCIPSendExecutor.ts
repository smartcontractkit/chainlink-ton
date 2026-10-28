import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

import * as fq from './FeeQuoter'
import { Costs } from './Router'

export const CONTRACT_VERSION = '1.7.0'

export const FACILITY_NAME = 'link.chain.ton.ccip.CCIPSendExecutor'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const opcodes = {
  in: {
    execute: 0xaf3c62b3,
    messageValidated: fq.opcodes.out.messageValidated,
    messageValidationFailed: fq.opcodes.out.messageValidationFailed,
    tokenRegistryReturnTokenInfo: 0xddccddb5,
  },
}
/** Value of the Deployable_InitializeAndSend that deploys an executor for a send that may carry tokens. */
export const deploySendExecutorCost =
  Costs.executorDeploy + Costs.executorExecute + Costs.executorReserveWithTokens
