import { Address, Cell, toNano } from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'
import { contractCode } from '../codeLoader'
import * as rt from '../gen/ccip/Router'

export const ARTIFACT_NAME = 'Router'

export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<Cell>> = {
  '1.6.0': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME), // Last bundle with version 1.6.0
}
export const ROUTER_CONTRACT_VERSION = '1.7.0'

export const FACILITY_NAME = 'link.chain.ton.ccip.Router'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const RMNREMOTE_GLOBAL_CURSE_SUBJECT = 0x01000000000000000000000000000001n
export const CURSE_ROLE = 0xb3c5b7cb9096e539f419cdc795a52c8cbe8dfbc9e27f70077d0b9749efe27fc5n
export const UNCURSE_ROLE = 0x19331e9591f40b6bd5c2716faeab95f6a63184877fab2619bf484155c597abf0n

// The Router has no init message, so deployment tooling constructs its initial
// AccessControl data directly. The RMN administrator starts as the default
// admin and retains both legacy operation permissions.
export function createRMNAccessControl(admin: Address) {
  const roleData = () =>
    rt.AccessControl_RoleData.create({
      adminRole: 0n,
      membersLen: 1n,
      hasRole: new Map([[admin, true]]),
    })
  return rt.AccessControl_Data.create({
    roles: new Map([
      [0n, roleData()],
      [CURSE_ROLE, roleData()],
      [UNCURSE_ROLE, roleData()],
    ]),
  })
}

export const opcodes = {
  in: {
    applyRampUpdates: 0x7db6745d,
    ccipSend: 0x31768d95,
    ccipReceiveConfirm: 0x1e55bbf6,
    routeMessage: 0xfc69c50b,
    rmnRemoteCurse: 0xf3388046,
    rmnRemoteUncurse: 0x3f153a31,
    accessControlGrantRole: 0x95cd540f,
    accessControlRevokeRole: 0x969b0db9,
    accessControlRenounceRole: 0x39452c46,
    verifyNotCursed: 0x0b95aa4e,
    messageSent: 0x6513f8e1,
    messageRejected: 0x8ae25114,
    getValidatedFee: 0x4dd6aa82,
    lockOrBurn: 0x6f2d00df,
    rmnOwnableMessage: 0xaf7a9ac6,
    tokenRegistrySetTokenInfo: 0xfed7cfba,
  },
  out: {
    messageValidated: 0x9e2155ec,
    messageValidationFailed: 0xec23c562,
    ccipSendACK: 0x78d0f21e,
    ccipSendNACK: 0x5a45d434,
    rmnRemoteVerifyNotCursedResponse: 0x22ba83b3,
  },
}
export const ccipSendCost = toNano('3') // TODO this should be calculated based on the message size and gas limit, but for now we use a fixed value
