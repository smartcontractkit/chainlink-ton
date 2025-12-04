import { compile } from '@ton/blueprint'
import { beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'

import * as WithdrawableSpec from '../../lib/funding/WithdrawableSpec'
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
    deployContract: deployOnRampContract,
  })
  currentVersionSpec.run()
})

describe('OnRamp - Withdrawable Tests', () => {
  const withdrawableSpec = WithdrawableSpec.newWithdrawableSpec({
    getCode: () => compile('OnRamp'),
    ContractConstructor: or.OnRamp,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: deployOnRampContract,
  })
  withdrawableSpec.run([
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
    const onramp = await deployOnRampContract(blockchain, deployer)

    await Ownable2StepSpec.ownable2StepSpec(deployer, other, onramp, blockchain, [
      {
        code: await onramp.getCode(),
        name: 'onramp',
      },
    ])
  })
})

describe('OnRamp - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: or.OnRamp.type(),
    currentVersion: or.OnRamp.version(),
    getCurrentCode: () => or.OnRamp.code(),
    CurrentVersionConstructor: or.OnRamp,
    deployCurrentContract: deployOnRampContract,
  })
  currentVersionSpec.run()
})

describe('OnRamp - Opcodes', () => {
  it('should match opcodes', () => {
    expect(or.Opcodes.onrampSend).toBe(0x10000002) // TODO crc32('OnRamp_Send')
    expect(or.Opcodes.getValidatedFee).toBe(crc32('OnRamp_GetValidatedFee'))
    expect(or.Opcodes.executorFinishedSuccessfully).toBe(
      crc32('OnRamp_ExecutorFinishedSuccessfully'),
    )
    expect(or.Opcodes.executorFinishedWithError).toBe(crc32('OnRamp_ExecutorFinishedWithError'))
    expect(or.Opcodes.setDynamicConfig).toBe(0x10000003) // TODO crc32('OnRamp_SetDynamicConfig')
    expect(or.Opcodes.updateDestChainConfigs).toBe(0x10000004) // TODO crc32('OnRamp_UpdateDestChainConfigs')
    expect(or.Opcodes.updateSendExecutor).toBe(crc32('OnRamp_UpdateSendExecutor'))
    expect(or.Opcodes.updateAllowlists).toBe(crc32('OnRamp_UpdateAllowlists'))

    expect(or.OutOpcodes.messageValidated).toBe(crc32('OnRamp_MessageValidated'))
    expect(or.OutOpcodes.messageValidationFailed).toBe(crc32('OnRamp_MessageValidationFailed'))
  })
})

describe('OnRamp - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>

  beforeEach(async () => {
    ;({ blockchain, deployer, onramp } = await setup())
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
