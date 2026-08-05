import { toNano, beginCell, Cell, Address } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { crc32 } from 'zlib'
import generateMessageID from '../../../src/offramp/generateMessageID'
import {
  generateMockTonAddress,
  bigIntToBuffer,
  asSnakedCell,
  generateRandomContractId,
  generateRandomTonAddress,
  uint8ArrayToBigInt,
} from '../../../src/utils'
import * as CCIPLogs from '../../../wrappers/ccip/Logs'
import * as ofManual from '../../../wrappers/ccip/OffRamp'
import { RMNREMOTE_GLOBAL_CURSE_SUBJECT } from '../../../wrappers/ccip/Router'
import { contractCode } from '../../../wrappers/codeLoader'
import * as tr from '../../../wrappers/examples/Receiver'
import * as mr from '../../../wrappers/gen/ccip/MerkleRoot'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import * as ocr from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import { facilityId, errorCode } from '../../../wrappers/utils'
import * as coverage from '../../coverage/coverage'
import { MerkleHelper } from '../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { expectFailedTransaction, expectSuccessfulTransaction, assertLog } from '../../Logs'
import { ChainSelectors } from '../../utils/Selectors'
import { PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS } from './OffRamp.commitAndExec.spec'
import {
  OffRampTestSetup,
  createSignatures,
  getDefaultMetadataHash,
  buildCursedSubjects,
  EVM_ONRAMP_ADDRESS_TEST,
  generateMerkleRootBytes,
} from './OffRamp.Setup'

describe('OffRamp - Dynamic Config', () => {
  let blockchain: Blockchain
  let setup: OffRampTestSetup

  // Helper functions for configuration and data creation
  //
  const warpTime = (period: number) => {
    blockchain.now = blockchain.now!! + period
  }

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    blockchain.now = 10000
    setup = await OffRampTestSetup.Init(blockchain)
  })

  beforeEach(async () => {
    await setup.SetupContracts()
  }, 60000) // setup can take a while, since we deploy contracts

  it('SetDynamicConfig', async () => {
    // owner can call SetDynamicConfig
    const newFeeQuoter = await generateRandomTonAddress()
    const newPermissionlessExecutionThresholdSeconds = BigInt(7200)
    const result = await setup.offRamp.sendOffRampSetDynamicConfig(
      setup.deployer.getSender(),
      toNano('0.1'),
      {
        feeQuoter: newFeeQuoter,
        permissionlessExecutionThresholdSeconds: newPermissionlessExecutionThresholdSeconds,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: setup.deployer.address,
      to: setup.offRamp.address,
      success: true,
    })

    // verify changes
    const dynamicConfig = await setup.offRamp.getConfig()
    expect(dynamicConfig.feeQuoter).toEqual(newFeeQuoter)
    expect(dynamicConfig.permissionlessExecutionThresholdSeconds).toBe(
      newPermissionlessExecutionThresholdSeconds,
    )

    // non-owner cannot call SetDynamicConfig
    const other = await blockchain.treasury('other')
    const result2 = await setup.offRamp.sendOffRampSetDynamicConfig(
      other.getSender(),
      toNano('0.1'),
      {
        feeQuoter: newFeeQuoter,
        permissionlessExecutionThresholdSeconds: newPermissionlessExecutionThresholdSeconds,
      },
    )
    expect(result2.transactions).toHaveTransaction({
      from: other.address,
      to: setup.offRamp.address,
      success: false,
    })
  })

  it('updateDeployables', async () => {
    // owner can update deployables
    const mockMerkleRootCode = beginCell().storeUint(0x12345678, 32).endCell()
    const mockReceiveExecutorCode = beginCell().storeUint(0x87654321, 32).endCell()

    const result = await setup.offRamp.sendOffRampUpdateDeployables(
      setup.deployer.getSender(),
      toNano('0.1'),
      {
        receiveExecutorCode: mockReceiveExecutorCode,
        merkleRootCode: mockMerkleRootCode,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: setup.deployer.address,
      to: setup.offRamp.address,
      success: true,
    })

    // verify changes
    const deployables = await setup.offRamp.getDeployableHashes()

    expect(deployables.merkleRoot).toBe(uint8ArrayToBigInt(mockMerkleRootCode.hash()))

    expect(deployables.receiveExecutor).toBe(uint8ArrayToBigInt(mockReceiveExecutorCode.hash()))

    expect(deployables.deployer).toBe(uint8ArrayToBigInt(setup.code.deployer.hash()))

    // non-owner cannot update deployables
    const other = await blockchain.treasury('other')
    const result2 = await setup.offRamp.sendOffRampUpdateDeployables(
      other.getSender(),
      toNano('0.1'),
      {
        receiveExecutorCode: mockReceiveExecutorCode,
        merkleRootCode: mockMerkleRootCode,
      },
    )
    expect(result2.transactions).toHaveTransaction({
      from: other.address,
      to: setup.offRamp.address,
      success: false,
    })
  })

  it('getAllSourceChainConfigs', async () => {
    await setup.setupSourceChainConfig()
    const result = await setup.offRamp.getAllSourceChainConfigs()
    const expectedSourceChainConfigs = setup.createDefaultUpdateSourceChainConfigs()
    // Compare dictionary entries with expected configs
    expect(result.size).toBe(expectedSourceChainConfigs.length)
    for (const expected of expectedSourceChainConfigs) {
      const actual = result.get(expected.sourceChainSelector)
      expect(actual).toBeDefined()
      expect(actual!).toEqual(expected.config)
    }
  })
  it('price updates are not sent to feequoter if they are empty', async () => {
    await setup.setupOCRConfig()
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [],
    })
    const result = await setup.commitReport([], toNano('0.5'), 0x01, priceUpdates)
    expect(result.transactions).not.toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.feeQuoter.address,
    })

    //should send update if only one of the updates is non-empty
    const priceUpdates2 = of.PriceUpdates.create({
      tokenPriceUpdates: [
        of.TokenPriceUpdate.create({
          sourceToken: generateMockTonAddress(),
          usdPerToken: 12345678n,
        }),
      ],
      gasPriceUpdates: [],
    })

    const result2 = await setup.commitReport([], toNano('0.5'), 0x02, priceUpdates2)
    expect(result2.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.feeQuoter.address,
    })

    //test with other combination
    const priceUpdates3 = of.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [
        of.GasPriceUpdate.create({
          destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        }),
      ],
    })

    const result3 = await setup.commitReport([], toNano('0.5'), 0x03, priceUpdates3)
    expect(result3.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.feeQuoter.address,
      success: true,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'offramp_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.offRamp,
          name: 'offramp',
        },
        {
          code: setup.code.router,
          name: 'router',
        },
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
        {
          code: setup.code.merkleRoot,
          name: 'merkleroot',
        },
        {
          code: setup.code.receiveExecutor,
          name: 'receive_executor',
        },
      ])
    }
  })
})
