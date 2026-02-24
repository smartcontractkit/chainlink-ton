import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'
import { crc32 } from 'zlib'

import { errorCode, facilityId } from '../../../wrappers/utils'

import * as typeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as mr from '../../../wrappers/ccip/MerkleRoot'

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
  currentVersionSpec.run([
    {
      code: 'MerkleRoot',
      name: 'merkleroot',
    },
  ])
})

describe('MerkleRoot - Unit Tests', () => {
  let blockchain: Blockchain
  let merkleRoot: SandboxContract<mr.MerkleRoot>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    merkleRoot = await deployMerkleRootContract(blockchain, await blockchain.treasury('owner'))
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await merkleRoot.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(mr.FACILITY_ID))

    const { type } = await merkleRoot.getTypeAndVersion()
    expect(type).toBe(mr.FACILITY_NAME)
    expect(mr.FACILITY_ID).toEqual(facilityId(crc32(mr.FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await merkleRoot.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(mr.ERROR_CODE))

    expect(mr.ERROR_CODE).toEqual(errorCode(crc32(mr.FACILITY_NAME)))
  })
})
