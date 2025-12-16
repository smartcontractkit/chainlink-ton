import { beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { facilityId } from '../../../wrappers/utils'

import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as Ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as or from '../../../wrappers/ccip/OnRamp'
import { deployOnRampContract, CHAINSEL_TON, setup } from './OnRamp.Setup'

describe('OnRamp - WithdrawFeeTokens', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    ;({ deployer, onramp } = await setup(blockchain))
  })

  it('should withdraw fee tokens', async () => {
    const facilityId = await onramp.getFacilityId() // TODO
    expect(facilityId).toBe(BigInt(or.ONRAMP_FACILITY_ID))
  })

  it('should get reserve', async () => {
    const reserve = await onramp.getReserve()
    expect(reserve).toBeGreaterThan(BigInt(0))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_withdraw_fee_tokens', [
        {
          code: await or.OnRamp.code(),
          name: 'onramp',
        },
      ])
    }
  })
})
