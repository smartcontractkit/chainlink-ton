import { compile } from '@ton/blueprint'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, SendMode, Slice, toNano } from '@ton/core'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'

import { setupTestFeeQuoter } from '../helpers/SetUp'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import { newSoftFreezeSpec } from '../../lib/funding/SoftFreezeSpec'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import * as ownable2StepSpec from '../../../tests/lib/access/Ownable2StepSpec'

import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import { EVM_ADDRESS } from '../router/Router.Setup'

describe('FeeQuoter - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('FeeQuoter'),
    ContractConstructor: fq.FeeQuoter,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  })
  withdrawableSpec.run([
    {
      code: 'FeeQuoter',
      name: 'feequoter',
    },
  ])
})

describe('FeeQuoter - Soft Freeze Tests', () => {
  const softFreezeSpec = newSoftFreezeSpec({
    getCode: () => compile('FeeQuoter'),
    ContractConstructor: fq.FeeQuoter,
    softFreezeThreshold: fq.SOFT_FREEZE_THRESHOLD,
    deployContract: async (blockchain, owner, initialBalance) => {
      const feeQuoter = await setupTestFeeQuoter(owner, blockchain)
      // Adjust balance to match initial balance requirement
      const currentBalance = (await blockchain.getContract(feeQuoter.address)).balance
      if (currentBalance < initialBalance) {
        const funder = await blockchain.treasury('funder')
        const result = await funder.send({
          to: feeQuoter.address,
          value: initialBalance - currentBalance,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
        })
        expect(result.transactions).toHaveTransaction({
          from: funder.address,
          to: feeQuoter.address,
          success: true,
        })
      } else if (currentBalance > initialBalance) {
        const result = await feeQuoter.sendWithdraw(owner.getSender(), toNano('0.1'), {
          queryId: 0n,
          amount: currentBalance - initialBalance,
          destination: owner.address,
          reserve: 0n, // Override reserve to allow withdrawal below soft freeze threshold
          drainAllAvailable: false,
        })
        expect(result.transactions).toHaveTransaction({
          from: feeQuoter.address,
          to: owner.address,
          success: true,
          value(x) {
            if (!x) return false
            return x >= currentBalance - initialBalance - toNano('0.05') // account for gas
          },
        })
      }
      expect((await blockchain.getContract(feeQuoter.address)).balance).toBe(initialBalance)
      return feeQuoter
    },
    callOwnerMethod: async (contract, sender) => {
      return contract.sendUpdateFeeTokens(sender.getSender(), {
        value: toNano('0.1'),
        msg: {
          add: new Map(),
          remove: [],
        },
      })
    },
    callNonOwnerMethod: async (contract, sender) => {
      return contract.sendGetValidatedFee(sender.getSender(), {
        value: toNano('0.1'),
        msg: {
          msg: {
            receiver: EVM_ADDRESS,
            data: Cell.EMPTY,
            tokenAmounts: [],
            feeToken: null,
            destChainSelector: 909606746561742123n, // CHAINSEL_EVM_TEST_90000001
            extraArgs: new Cell(),
          },
          context: Cell.EMPTY.asSlice(),
        },
      })
    },
  })
  softFreezeSpec.run([
    {
      code: 'FeeQuoter',
      name: 'feequoter',
    },
  ])
})

describe('FeeQuoter - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: fq.FeeQuoter.type(),
    version: fq.FeeQuoter.version(),
    deployContract: async (blockchain, deployer) => {
      return setupTestFeeQuoter(deployer, blockchain)
    },
  })
  currentVersionSpec.run([
    {
      code: 'FeeQuoter',
      name: 'feequoter',
    },
  ])
})

// TODO when we have a new version
// describe('FeeQuoter - Upgrade Tests', () => {
//   const upgradeSpec = UpgradeableSpec.newUpgradeSpec(
//     {
//       contractType: FeeQuoterPrev.type(),
//       prevVersion: FeeQuoterPrev.version(),
//       currentVersion: FeeQuoter.version(),
//       getPrevCode: () => FeeQuoterPrev.code(),
//       getCurrentCode: () => FeeQuoter.code(),
//       CurrentVersionConstructor: FeeQuoter,
//     },
//     async (blockchain, owner) => {
//       const codeV1 = await FeeQuoterPrev.code()
//       const data = {} as any // TODO fill with valid data
//       const contract = blockchain.openContract(
//         FeeQuoterPrev.createFromConfig(
//           data,
//           codeV1,
//         ),
//       )
//       const deployer = await blockchain.treasury('deployer')
//       await contract.sendDeploy(deployer.getSender(), fq.SOFT_FREEZE_THRESHOLD)
//       return contract
//     },
//   )
//   upgradeSpec.run()
// })

describe('FeeQuoter - Ownable Tests', () => {
  it('supports ownable messages', async () => {
    const blockchain = await Blockchain.create()
    blockchain.now = 1
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    await ownable2StepSpec.ownable2StepSpec(deployer, other, feeQuoter, {
      coverage: {
        blockchain,
        conf: [
          {
            code: await feeQuoter.getCode(),
            name: 'feequoter',
          },
        ],
      },
    })
  })
})

describe('FeeQuoter - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: fq.FeeQuoter.type(),
    currentVersion: fq.FeeQuoter.version(),
    getCurrentCode: () => fq.FeeQuoter.code(),
    CurrentVersionConstructor: fq.FeeQuoter,
    deployCurrentContract: async (blockchain, owner) => setupTestFeeQuoter(owner, blockchain),
  })
  currentVersionSpec.run('feequoter')
})

describe('FeeQuoter - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let feeQuoter: SandboxContract<fq.FeeQuoter>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    deployer = await blockchain.treasury('deployer')
    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await feeQuoter.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(fq.FACILITY_ID))

    const { type } = await feeQuoter.getTypeAndVersion()
    expect(type).toBe(fq.FACILITY_NAME)

    expect(fq.FACILITY_ID).toEqual(facilityId(crc32(fq.FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await feeQuoter.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(fq.ERROR_CODE))

    expect(fq.ERROR_CODE).toEqual(errorCode(crc32(fq.FACILITY_NAME), 0))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'feequoter_unit_tests', [
        {
          code: await fq.FeeQuoter.code(),
          name: 'feequoter',
        },
      ])
    }
  })
})
