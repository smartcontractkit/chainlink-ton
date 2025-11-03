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
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    minMsgNr: 0n, //todo shold be configured
    maxMsgNr: 5n, //idem
    messageStates: 0n,
    deliveredMessageCount: 0n,
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
