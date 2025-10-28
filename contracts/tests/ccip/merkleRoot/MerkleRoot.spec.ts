import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import * as mr from '../../../wrappers/ccip/MerkleRoot'
import * as typeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import { toNano } from '@ton/core'

async function deployMerkleRootContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
) {
  const code = await mr.MerkleRoot.code()
  let data: mr.MerkleRootStorage = {
    rootId: 0n,
    owner: owner.address,
    state: 0,
    executionState: 0,
    tokenBalance: {
      amount: BigInt(0),
      failed: false,
    },
    message: null,
  }

  const contract = blockchain.openContract(mr.MerkleRoot.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('1'))
  return contract
}

describe('MerkleRoot - TypeAndVersion Tests', () => {
  const currentVersionSpec = typeAndVersionSpec.newInstance({
    type: mr.MerkleRoot.type(),
    version: mr.MerkleRoot.version(),
    deployContract: deployMerkleRootContract,
  })
  currentVersionSpec.run()
})
