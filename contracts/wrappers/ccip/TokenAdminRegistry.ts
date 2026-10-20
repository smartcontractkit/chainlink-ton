import { crc32 } from 'zlib'
import { toNano } from '@ton/core'
import { errorCode, facilityId } from '../utils'

export const ARTIFACT_NAME = 'TokenAdminRegistry'
export const FACILITY_NAME = 'link.chain.ton.ccip.TokenAdminRegistry'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const CONTRACT_VERSION = '1.6.0'

export const ENTRY_ARTIFACT_NAME = 'TokenAdminRegistryEntry'
export const ENTRY_FACILITY_NAME = 'link.chain.ton.ccip.TokenAdminRegistryEntry'
export const ENTRY_FACILITY_ID = facilityId(crc32(ENTRY_FACILITY_NAME))
export const ENTRY_ERROR_CODE = errorCode(crc32(ENTRY_FACILITY_NAME))
export const ENTRY_CONTRACT_VERSION = '1.6.0'
/** Matches TokenAdminRegistryEntry_VERSION, the minimum entry version the root requests. */
export const ENTRY_VERSION = 1n

export const EventTopics = {
  AdministratorTransferRequested: crc32('AdministratorTransferRequested'),
  AdministratorTransferred: crc32('AdministratorTransferred'),
  PoolSet: crc32('PoolSet'),
} as const

/** Mirrors the TokenAdminRegistry cost functions in Tolk. */
export const Costs = (() => {
  const relayEvent = toNano('0.01')
  const walletQuery = toNano('0.02')
  const poolProbe = toNano('0.05')
  const registrationInitialized = toNano('0.025') + walletQuery + poolProbe + relayEvent
  const deploy = toNano('0.035') + registrationInitialized
  const forward = toNano('0.006') + relayEvent
  return {
    relayEvent,
    walletQuery,
    poolProbe,
    registrationInitialized,
    deploy,
    registerToken: toNano('0.003') + deploy,
    getTokenInfo: toNano('0.008'),
    forward,
    setPool: forward + poolProbe,
    refreshTransferInitiator: forward + poolProbe,
    verifyToken: forward + walletQuery,
    upgrade: toNano('0.01'),
  }
})()
