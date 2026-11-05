import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, contractAddress, toNano } from '@ton/core'

import { CctCostHarness } from '../../wrappers/gen/test/gas/CctCostHarness'
import { WgramCostHarness } from '../../wrappers/gen/test/gas/WgramCostHarness'
import { contractCode } from '../../wrappers/codeLoader'

// The generated harness wrappers keep the constructor protected; expose public factories here so
// every calibration spec deploys them the same way.
class CctHarness extends CctCostHarness {
  static create(code: Cell, data: Cell = Cell.EMPTY, workchain = 0) {
    const init = { code, data }
    return new CctHarness(contractAddress(workchain, init), init)
  }
}

class WgramHarness extends WgramCostHarness {
  static create(code: Cell, data: Cell = Cell.EMPTY, workchain = 0) {
    const init = { code, data }
    return new WgramHarness(contractAddress(workchain, init), init)
  }
}

export type CctHarnessContract = SandboxContract<CctHarness>
export type WgramHarnessContract = SandboxContract<WgramHarness>

export async function deployCctHarness(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
): Promise<CctHarnessContract> {
  const code = await contractCode.ccip.local('CctCostHarness')
  const harness = blockchain.openContract(CctHarness.create(code))
  await harness.sendDeploy(deployer.getSender(), toNano('0.1'))
  return harness
}

export async function deployWgramHarness(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
): Promise<WgramHarnessContract> {
  const code = await contractCode.ccip.local('WgramCostHarness')
  const harness = blockchain.openContract(WgramHarness.create(code))
  await harness.sendDeploy(deployer.getSender(), toNano('0.1'))
  return harness
}
