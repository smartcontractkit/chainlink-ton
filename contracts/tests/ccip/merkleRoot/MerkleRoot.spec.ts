import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'
import { crc32 } from 'zlib'

import { errorCode, facilityId } from '../../../wrappers/utils'

import * as typeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import {
  FACILITY_NAME,
  CONTRACT_VERSION,
  FACILITY_ID,
  ERROR_CODE,
} from '../../../wrappers/ccip/MerkleRoot'
import * as mr from '../../../wrappers/gen/ccip/MerkleRoot'
import { contractCode } from '../../../wrappers/codeLoader'

async function deployMerkleRootContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
) {
  const code = await contractCode.ccip.local('MerkleRoot')
  let data = mr.MerkleRoot_Storage.create({
    root: 0n,
    owner: owner.address,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    minMsgNr: 0n, //todo shold be configured
    maxMsgNr: 5n, //idem
    messageStates: 0n,
    deliveredMessageCount: 0n,
  })

  const contract = blockchain.openContract(
    mr.MerkleRoot.fromStorage(data, { overrideContractCode: code }),
  )
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('1'))
  return contract
}

describe('MerkleRoot - TypeAndVersion Tests', () => {
  const currentVersionSpec = typeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: CONTRACT_VERSION,
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
    expect(facilityIdVal).toBe(BigInt(FACILITY_ID))

    const [typeSlice] = await merkleRoot.getTypeAndVersion()
    expect(typeSlice.loadStringTail()).toBe(FACILITY_NAME)
    expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await merkleRoot.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ERROR_CODE))

    expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
  })
})
