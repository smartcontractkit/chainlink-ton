import { compile } from '@ton/blueprint'
import { FeeQuoter } from '../../../wrappers/ccip/FeeQuoter'
import { setupTestFeeQuoter } from '../helpers/SetUp'
import { toNano } from '@ton/core'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

describe('FeeQuoter - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('FeeQuoter'),
    ContractConstructor: FeeQuoter,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  })
  withdrawableSpec.run()
})
