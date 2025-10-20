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
      withdrawValue: toNano('0.05'),
      reserve: toNano('1'),
    },
    async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  )
  withdrawableSpec.run()
})
