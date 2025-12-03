import * as or from '../../../wrappers/ccip/OnRamp'
import * as dep from '../../../wrappers/libraries/Deployable'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'
import { crc32 } from 'zlib'
import { beginCell, toNano } from '@ton/core'
import { generateRandomContractId } from '../../../src/utils'
import * as counter from '../../../wrappers/examples/Counter'

describe('OnRamp - Opcodes', () => {
  it('should match opcodes', () => {
    expect(dep.Opcodes.initialize).toBe(crc32('Deployable_Initialize'))
    expect(dep.Opcodes.initializeAndSend).toBe(crc32('Deployable_InitializeAndSend'))
  })
})

describe('Deployable - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let deployable: SandboxContract<dep.ContractClient>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    deployer = await blockchain.treasury('deployer')

    const code = await dep.ContractClient.code()
    const data: dep.DeployableStorage = {
      owner: deployer.address,
      id: beginCell().storeStringTail('DeployableTests').storeUint(generateRandomContractId(), 32),
    }

    deployable = blockchain.openContract(dep.ContractClient.createFromConfig(data, code))
  })

  it('should initialize and replace code and data', async () => {
    const code = await counter.ContractClient.code()
    const data = counter.builder.data.contractData
      .encode({
        id: Number(generateRandomContractId()),
        value: 0,
        ownable: {
          owner: deployer.address,
          pendingOwner: undefined,
        },
      })
      .asCell()
    const result = await deployable.sendInitialize(deployer.getSender(), toNano('0.05'), {
      stateInit: {
        code,
        data,
      },
    })
    expect(result.transactions).toHaveTransaction({
      to: deployable.address,
      deploy: true,
      success: true,
    })

    const counterContract = blockchain.openContract(
      counter.ContractClient.newAt(deployable.address),
    )
    expect(await counterContract.getValue()).toBe(0)

    const resultIncrease = await counterContract.sendSetCount(
      deployer.getSender(),
      toNano('0.01'),
      {
        queryId: 1n,
        newCount: 42,
      },
    )
    expect(resultIncrease.transactions).toHaveTransaction({
      to: counterContract.address,
      success: true,
    })
    expect(await counterContract.getValue()).toBe(42)
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
