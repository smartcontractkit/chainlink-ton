import * as c from '@ton/core'
import * as deployable from '../libraries/Deployable'
import { contractCode } from '../codeLoader'

export enum CCIPNamespace {
  CCIPSendExecutor = 0,
  ReceiveExecutor,
  MerkleRoot,
  TokenRegistry,
}

// pass `await contractCode.ccip.local('Deployable')` to `deployableCode`
export function deriveAddress(
  owner: c.Address,
  namespace: CCIPNamespace,
  id: c.Builder,
  deployableCode: c.Cell,
): c.Address {
  const data = deployable.builder.data.contractData
    .encode({
      owner,
      id: deployable.builder.data.namespaced.encode({
        namespace,
        id,
      }),
    })
    .endCell()

  const init: c.StateInit = {
    code: deployableCode,
    data,
  }

  return c.contractAddress(0, init)
}
