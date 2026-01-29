import { Contract, ContractProvider } from '@ton/core'

export const FACILITY_NAME = 'com.chainlink.ton.lib.funding.SoftFreeze'
export const FACILITY_ID = 70
export const ERROR_CODE = FACILITY_ID * 100

export enum Errors {
  BelowOperationalBalance = ERROR_CODE,
}

export async function getSoftFreezeThreshold(provider: ContractProvider): Promise<bigint> {
  const { stack } = await provider.get('softFreezeThreshold', [])
  return stack.readBigNumber()
}

export interface Interface extends Contract {
  getSoftFreezeThreshold(provider: ContractProvider): Promise<bigint>
}
