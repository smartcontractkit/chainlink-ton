import { compile } from '@ton/blueprint'
import * as e from '../../../wrappers/ccip/CCIPSendExecutor'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as coverage from '../../coverage/coverage'
import { crc32 } from 'zlib'
import { facilityId } from '../../../wrappers/utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { ZERO_ADDRESS } from '../../../src/utils'

async function setupTestCCIPSendExecutor(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
): Promise<SandboxContract<TypeAndVersionSpec.TypeAndVersionContract>> {
  let code = await compile('CCIPSendExecutor')

  let data: e.InitialData = {
    onramp: ZERO_ADDRESS,
    id: 0n,
  }
  let ccipSendExecutor = blockchain.openContract(e.ContractClient.createFromConfig(data, code))

  let result = await ccipSendExecutor.sendDeploy(deployer.getSender(), 1_000_000_000n)
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: ccipSendExecutor.address,
    deploy: true,
    success: true,
  })
  return ccipSendExecutor
}

describe('CCIPSendExecutor - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: e.ContractClient.type(),
    version: e.ContractClient.version(),
    deployContract: setupTestCCIPSendExecutor,
  })
  currentVersionSpec.run([
    {
      code: 'CCIPSendExecutor',
      name: 'send_executor',
    },
  ])
})

describe('CCIPSendExecutor - Wrapper', () => {
  it('Test facilityId matches facility name', () => {
    expect(e.CCIP_SEND_EXECUTOR_FACILITY_ID).toEqual(
      facilityId(crc32(e.CCIP_SEND_EXECUTOR_FACILITY_NAME)),
    )
  })
})
