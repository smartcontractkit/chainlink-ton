import { beginCell, Cell, Dictionary } from '@ton/core'

import * as mcms from '../../../wrappers/mcms/MCMS'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import { loadMap } from '../../../src/utils/dict'
import { contractCode } from '../../../wrappers/codeLoader'

export type McmsVersion = 'local' | '1.6.2'

export type McmsVersionConfig = {
  loadCode: () => Promise<Cell>
  encodeStorage: (data: mcms.ContractData) => Cell
}

const encodeStorage = (data: mcms.ContractData): Cell =>
  beginCell()
    .storeUint(data.id, 32)
    .storeBuilder(ownable2step.builder.data.traitData.encode(data.ownable))
    .storeAddress(data.oracle)
    .storeDict(
      loadMap(
        Dictionary.Keys.BigUint(160),
        Dictionary.Values.Buffer(mcms.LEN_SIGNER_BYTES),
        data.signers,
      ),
      Dictionary.Keys.BigUint(160),
      Dictionary.Values.Buffer(mcms.LEN_SIGNER_BYTES),
    )
    .storeRef(mcms.builder.data.config.encode(data.config).endCell())
    .storeDict(
      loadMap(Dictionary.Keys.BigUint(256), Dictionary.Values.Bool(), data.seenSignedHashes),
      Dictionary.Keys.BigUint(256),
      Dictionary.Values.Bool(),
    )
    .storeRef(
      beginCell()
        .storeBuilder(
          mcms.builder.data.expiringRootAndOpCount.encode(data.rootInfo.expiringRootAndOpCount),
        )
        .storeBuilder(mcms.builder.data.rootMetadata.encode(data.rootInfo.rootMetadata))
        .endCell(),
    )
    .endCell()

export const MCMS_VERSIONS: Record<McmsVersion, McmsVersionConfig> = {
  local: {
    loadCode: () => contractCode.ccip.local('mcms.MCMS'),
    encodeStorage,
  },
  '1.6.2': {
    loadCode: () => contractCode.ccip.release_1_6_2('mcms.MCMS'),
    encodeStorage,
  },
}

export const isVersionAvailable = (version: McmsVersion): boolean =>
  version !== '1.6.2' || !!process.env['PATH_CONTRACTS_1_6_2']
