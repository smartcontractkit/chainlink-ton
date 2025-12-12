import { compile } from '@ton/blueprint'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { ZERO_ADDRESS } from '../../../src/utils'
import * as e from '../../../wrappers/ccip/CCIPSendExecutor'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'

export async function setupTestCCIPSendExecutor(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
): Promise<SandboxContract<TypeAndVersionSpec.TypeAndVersionContract>> {
  let code = await compile('CCIPSendExecutor')

  let data: e.InitialData = {
    onramp: ZERO_ADDRESS,
    id: 0n,
  }
  let ccipSendExecutor = blockchain.openContract(e.ContractClient.createFromConfig(data, code))

  let result = await ccipSendExecutor.sendDeploy(deployer.getSender(), 1000000000n)
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: ccipSendExecutor.address,
    deploy: true,
    success: true,
  })
  return ccipSendExecutor
}
