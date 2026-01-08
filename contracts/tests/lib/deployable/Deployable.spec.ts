import { beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { generateRandomContractId } from '../../../src/utils'

import * as counter from '../../../wrappers/examples/Counter'
import * as dep from '../../../wrappers/libraries/Deployable'

describe('Deployable - Opcodes', () => {
  it('should match opcodes', () => {
    expect(dep.opcodes.in.initialize).toBe(crc32('Deployable_Initialize'))
    expect(dep.opcodes.in.initializeAndSend).toBe(crc32('Deployable_InitializeAndSend'))
  })
})

describe('Deployable - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let deployableCode: Cell
  let counterCode: Cell
  let deployable: SandboxContract<dep.ContractClient>

  beforeAll(async () => {
    deployableCode = await dep.ContractClient.code()
    counterCode = await counter.ContractClient.code()

    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    deployer = await blockchain.treasury('deployer')

    const data: dep.DeployableStorage = {
      owner: deployer.address,
      id: beginCell().storeStringTail('DeployableTests').storeUint(generateRandomContractId(), 32),
    }

    deployable = blockchain.openContract(dep.ContractClient.createFromConfig(data, deployableCode))
  })

  it('should initialize and replace code and data', async () => {
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
        code: counterCode,
        data,
      },
    })
    expect(result.transactions).toHaveTransaction({
      to: deployable.address,
      deploy: true,
      success: true,
    })

    const counterContract = blockchain.openContract(
      counter.ContractClient.createFromAddress(deployable.address),
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

  it('should initialize and send a message to self', async () => {
    const data = counter.builder.data.contractData
      .encode({
        id: Number(generateRandomContractId()),
        value: 0,
        ownable: {
          owner: deployable.address,
          pendingOwner: undefined,
        },
      })
      .asCell()
    const result = await deployable.sendInitializeAndSend(deployer.getSender(), toNano('0.05'), {
      stateInit: {
        code: await counter.ContractClient.code(),
        data,
      },
      selfMessage: {
        value: toNano('0.02'),
        body: counter.builder.message.in.setCount
          .encode({
            queryId: 1n,
            newCount: 42,
          })
          .asCell(),
      },
    })
    expect(result.transactions).toHaveTransaction({
      to: deployable.address,
      deploy: true,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployable.address,
      to: deployable.address,
      success: true,
      op: counter.opcodes.in.SetCount,
    })

    const counterContract = blockchain.openContract(
      counter.ContractClient.createFromAddress(deployable.address),
    )
    expect(await counterContract.getValue()).toBe(42)
  })

  it('should not allow non-owner to initialize', async () => {
    const other = await blockchain.treasury('other')

    const result = await deployable.sendInitialize(other.getSender(), toNano('0.05'), {
      stateInit: {
        code: Cell.EMPTY,
        data: Cell.EMPTY,
      },
    })
    expect(result.transactions).toHaveTransaction({
      to: deployable.address,
      success: false,
      exitCode: dep.Errors.ErrorNotOwner,
    })
  })

  it('should not allow non-owner to initialize and send', async () => {
    const other = await blockchain.treasury('other')

    const result = await deployable.sendInitializeAndSend(other.getSender(), toNano('0.05'), {
      stateInit: {
        code: Cell.EMPTY,
        data: Cell.EMPTY,
      },
      selfMessage: {
        value: 0n,
        body: Cell.EMPTY,
      },
    })
    expect(result.transactions).toHaveTransaction({
      to: deployable.address,
      success: false,
      exitCode: dep.Errors.ErrorNotOwner,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'deployable_unit_tests', [
        {
          code: deployableCode,
          name: 'deployable',
        },
      ])
    }
  })
})
