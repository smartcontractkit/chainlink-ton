import { beginCell, Cell, Dictionary } from '@ton/core'

import * as mcms from '../../../wrappers/mcms/MCMS'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import { loadMap } from '../../../src/utils/dict'
import { contractCode } from '../../../wrappers/codeLoader'

export type McmsVersion = 'local' | '1.6.2'

export type McmsVersionConfig = {
  loadCode: () => Promise<Cell>
  supportsStagedConfig: boolean
  encodeStorage: (data: mcms.ContractData) => Cell
}

const storeCommonData = (data: mcms.ContractData, b: ReturnType<typeof beginCell>) => {
  b.storeUint(data.id, 32)
  b.storeBuilder(ownable2step.builder.data.traitData.encode(data.ownable))
  b.storeAddress(data.oracle)
  b.storeDict(
    loadMap(
      Dictionary.Keys.BigUint(160),
      Dictionary.Values.Buffer(mcms.LEN_SIGNER_BYTES),
      data.signers,
    ),
    Dictionary.Keys.BigUint(160),
    Dictionary.Values.Buffer(mcms.LEN_SIGNER_BYTES),
  )
}

const storeRootInfo = (data: mcms.ContractData) =>
  beginCell()
    .storeBuilder(
      mcms.builder.data.expiringRootAndOpCount.encode(data.rootInfo.expiringRootAndOpCount),
    )
    .storeBuilder(mcms.builder.data.rootMetadata.encode(data.rootInfo.rootMetadata))
    .endCell()

const encodeSeenHashes = (data: mcms.ContractData) =>
  loadMap(Dictionary.Keys.BigUint(256), Dictionary.Values.Bool(), data.seenSignedHashes)

const encodeCurrentStorage = (data: mcms.ContractData): Cell => {
  const b = beginCell()
  storeCommonData(data, b)
  b.storeRef(
    beginCell()
      .storeRef(mcms.builder.data.config.encode(data.config).endCell())
      .storeBit(false) // no staged config
      .endCell(),
  )
  b.storeDict(encodeSeenHashes(data), Dictionary.Keys.BigUint(256), Dictionary.Values.Bool())
  b.storeRef(storeRootInfo(data))
  return b.endCell()
}

// 1.6.2 predates ConfigState; its storage has config: Cell<Config> directly.
const encodeLegacyStorage = (data: mcms.ContractData): Cell => {
  const b = beginCell()
  storeCommonData(data, b)
  b.storeRef(mcms.builder.data.config.encode(data.config).endCell())
  b.storeDict(encodeSeenHashes(data), Dictionary.Keys.BigUint(256), Dictionary.Values.Bool())
  b.storeRef(storeRootInfo(data))
  return b.endCell()
}

export const MCMS_VERSIONS: Record<McmsVersion, McmsVersionConfig> = {
  local: {
    loadCode: () => contractCode.ccip.local('mcms.MCMS'),
    supportsStagedConfig: true,
    encodeStorage: encodeCurrentStorage,
  },
  '1.6.2': {
    loadCode: () => contractCode.ccip.release_1_6_2('mcms.MCMS'),
    supportsStagedConfig: false,
    encodeStorage: encodeLegacyStorage,
  },
}

export const isVersionAvailable = (version: McmsVersion): boolean =>
  version !== '1.6.2' || !!process.env['PATH_CONTRACTS_1_6_2']
