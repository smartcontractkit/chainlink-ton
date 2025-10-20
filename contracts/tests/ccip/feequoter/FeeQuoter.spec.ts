import { compile } from '@ton/blueprint'
import { FeeQuoter } from '../../../wrappers/ccip/FeeQuoter'
import { setupTestFeeQuoter } from '../helpers/SetUp'
import { toNano } from '@ton/core'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'

describe('FeeQuoter - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec(
    {
      getCode: () => compile('FeeQuoter'),
      ContractConstructor: FeeQuoter,
    },
    async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  )
  withdrawableSpec.run()
})
