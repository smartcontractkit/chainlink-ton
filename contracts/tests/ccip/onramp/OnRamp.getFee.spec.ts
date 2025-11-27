import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'

import { Address, Cell, toNano } from '@ton/core'
import { generateRandomTonAddress, ZERO_ADDRESS } from '../../../src/utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import {
  CHAINSEL_EVM_TEST,
  CHAINSEL_EVM_TEST_90000002,
  deployOnRampContract,
  setup,
} from './OnRamp.Setup'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

describe('OnRamp - Get Fee', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let feeQuoterAddr: Address

  const ccipSend: rt.CCIPSend = {
    queryID: 1,
    destChainSelector: CHAINSEL_EVM_TEST_90000002,
    receiver: EVM_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: [],
    feeToken: TEST_TOKEN_ADDR,
    extraArgs: rt.builder.data.extraArgs
      .encode({
        kind: 'generic-v2',
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      })
      .asCell(),
  }

  beforeEach(async () => {
    ;({ blockchain, deployer } = await setup())
    feeQuoterAddr = await generateRandomTonAddress()

    onramp = await deployOnRampContract(blockchain, deployer, {
      config: {
        feeQuoter: feeQuoterAddr, // For now, fee quoter is global
      },
    })
  })

  it('should get feequoter offchain', async () => {
    // This is required to get fee off-chain
    // 1. get onramp address from router
    // 2. get fee quoter address from onramp <=
    // 3. get validated fee from fee quoter

    const queriedFeeQuoter = await onramp.getFeeQuoter(CHAINSEL_EVM_TEST_90000002) // We don't validate chain selector here yet. We might enable different fee quoters per chain later.
    expect(queriedFeeQuoter.equals(feeQuoterAddr)).toBe(true)
  })
})
function assertAddressesMatch(arg0: Address[], resultCheckAdd1: Address[]) {
  throw new Error('Function not implemented.')
}
