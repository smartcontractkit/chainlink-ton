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

describe('OnRamp - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: or.OnRamp.type(),
    version: or.OnRamp.version(),
    deployContract: (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
      deployOnRampContract(blockchain, owner).then((c) => c.onramp),
  })
  currentVersionSpec.run([
    {
      code: 'OnRamp',
      name: 'onramp',
    },
  ])
})

// TODO when we have a new version
// describe('OnRamp - Upgrade Tests', () => {
//   const upgradeSpec = UpgradeableSpec.newUpgradeSpec(
//     {
//       contractType: OnRampPrev.type(),
//       prevVersion: OnRampPrev.version(),
//       currentVersion: OnRamp.version(),
//       getPrevCode: () => OnRampPrev.code(),
//       getCurrentCode: () => OnRamp.code(),
//       CurrentVersionConstructor: OnRamp,
//     },
//     async (blockchain, owner) => {
//       const codeV1 = await OnRampPrev.code()
//       const data = {} as any // TODO fill with valid data
//       const contract = blockchain.openContract(
//         OnRampPrev.createFromConfig(
//           data,
//           codeV1,
//         ),
//       )
//       const deployer = await blockchain.treasury('deployer')
//       await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
//       return contract
//     },
//   )
//   upgradeSpec.run()
// })

describe('OnRamp - Ownable Tests', () => {
  it('supports ownable messages', async () => {
    const blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }

    const deployer = await blockchain.treasury('deployer')
    const other = await blockchain.treasury('other')
    const { onramp } = await deployOnRampContract(blockchain, deployer)

    await Ownable2StepSpec.ownable2StepSpec(deployer, other, onramp, {
      coverage: {
        blockchain,
        conf: [
          {
            code: await onramp.getCode(),
            name: 'onramp',
          },
        ],
      },
    })
  })
})

describe('OnRamp - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: or.OnRamp.type(),
    currentVersion: or.OnRamp.version(),
    getCurrentCode: () => or.OnRamp.code(),
    CurrentVersionConstructor: or.OnRamp,
    deployCurrentContract: (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
      deployOnRampContract(blockchain, owner).then((c) => c.onramp),
  })
  currentVersionSpec.run('onramp')
})

describe('OnRamp - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(or.opcodes.in.onrampSend).toBe(crc32('OnRamp_Send'))
    expect(or.opcodes.in.getValidatedFee).toBe(crc32('OnRamp_GetValidatedFee'))
    expect(or.opcodes.in.executorFinishedSuccessfully).toBe(
      crc32('OnRamp_ExecutorFinishedSuccessfully'),
    )
    expect(or.opcodes.in.executorFinishedWithError).toBe(crc32('OnRamp_ExecutorFinishedWithError'))
    expect(or.opcodes.in.setDynamicConfig).toBe(crc32('OnRamp_SetDynamicConfig'))
    expect(or.opcodes.in.updateDestChainConfigs).toBe(crc32('OnRamp_UpdateDestChainConfigs'))
    expect(or.opcodes.in.updateSendExecutor).toBe(crc32('OnRamp_UpdateSendExecutor'))
    expect(or.opcodes.in.updateAllowlists).toBe(crc32('OnRamp_UpdateAllowlists'))
    expect(or.opcodes.in.withdrawFeeTokens).toBe(crc32('OnRamp_WithdrawFeeTokens'))
  })

  it('should match out opcodes', () => {
    expect(or.opcodes.out.messageValidated).toBe(crc32('OnRamp_MessageValidated'))
    expect(or.opcodes.out.messageValidationFailed).toBe(crc32('OnRamp_MessageValidationFailed'))
  })
})

describe('OnRamp - Facility ID', () => {
  it('Test facilityId matches facility name', () => {
    expect(or.ONRAMP_FACILITY_ID).toEqual(facilityId(crc32(or.ONRAMP_FACILITY_NAME)))
  })
})

describe('OnRamp - Unit Tests', () => {
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

  it('should match facility ID', async () => {
    const facilityId = await onramp.getFacilityId()
    expect(facilityId).toBe(BigInt(or.ONRAMP_FACILITY_ID))
  })

  it('should match error code', async () => {
    const errorCode = await onramp.getErrorCode(0n)
    expect(errorCode).toBe(BigInt(or.ONRAMP_ERROR_CODE))
  })

  it('getStaticConfig should return chain selector', async () => {
    const result = await onramp.getStaticConfig()
    expect(result).toBe(CHAINSEL_TON)
  })

  it('should allow owner to updateSendExecutor', async () => {
    const newExecutor = beginCell().storeUint(12345678, 32).endCell()
    const result = await onramp.sendUpdateSendExecutor(deployer.getSender(), {
      value: toNano('0.05'),
      code: newExecutor,
    })

    expect(result.transactions).toHaveTransaction({
      to: onramp.address,
      success: true,
    })

    const executorCode = await onramp.getSendExecutorCode()
    expect(executorCode.equals(newExecutor)).toBe(true)
    const executorCodeHash = await onramp.getSendExecutorCodeHash()
    expect(executorCodeHash).toBe(BigInt('0x' + newExecutor.hash().toString('hex')))
  })

  it('should not allow non-owner to updateSendExecutor', async () => {
    const other = await blockchain.treasury('other')
    const newExecutor = beginCell().storeUint(12345678, 32).endCell()
    const result = await onramp.sendUpdateSendExecutor(other.getSender(), {
      value: toNano('0.05'),
      code: newExecutor,
    })

    expect(result.transactions).toHaveTransaction({
      to: onramp.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })

    const executorCode = await onramp.getSendExecutorCode()
    expect(executorCode.equals(beginCell().endCell())).toBe(true)
    const executorCodeHash = await onramp.getSendExecutorCodeHash()
    expect(executorCodeHash).toBe(BigInt('0x' + beginCell().endCell().hash().toString('hex')))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_unit_tests', [
        {
          code: await or.OnRamp.code(),
          name: 'onramp',
        },
      ])
    }
  })
})
