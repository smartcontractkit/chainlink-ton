import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { compile } from '@ton/blueprint'
import { Address, beginCell, toNano } from '@ton/core'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { facilityId } from '../../../wrappers/utils'
import {
  CHAINSEL_EVM_TEST_90000001,
  EVM_ADDRESS,
  TEST_LINK_TOKEN_ADDR,
} from '../router/Router.Setup'
import { ZERO_ADDRESS } from '../../../src/utils'

import { setup as ccipSendExecutor, sendDeployOnBlockchain, setup } from './SendExecutor.Setup'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import * as dep from '../../../wrappers/libraries/Deployable'

describe('SendExecutor - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: sx.ContractClient.type(),
    version: sx.ContractClient.version(),
    deployContract: async (
      blockchain: Blockchain,
      deployer: SandboxContract<TreasuryContract>,
    ): Promise<SandboxContract<sx.ContractClient>> => {
      const deployable = await ccipSendExecutor(blockchain, deployer)
      return sendDeployOnBlockchain(blockchain, deployer, deployable, undefined, deployer).then(
        ({ sendExecutor }) => sendExecutor,
      )
    },
  })
  currentVersionSpec.run([
    {
      code: 'SendExecutor',
      name: 'send_executor',
    },
  ])
})

describe('SendExecutor - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(sx.opcodes.in.execute).toBe(crc32('CCIPSendExecutor_Execute'))
  })
})

describe('SendExecutor - Facility ID', () => {
  it('Test facilityId matches facility name', () => {
    expect(sx.CCIP_SEND_EXECUTOR_FACILITY_ID).toEqual(
      facilityId(crc32(sx.CCIP_SEND_EXECUTOR_FACILITY_NAME)),
    )
  })
})

describe('SendExecutor - Unit tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let deployable: SandboxContract<dep.ContractClient>
  let onrampSend: or.OnRampSend
  let onRampMock: SandboxContract<TreasuryContract>
  let feeQuoterMock: SandboxContract<TreasuryContract>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }

    deployer = await blockchain.treasury('deployer')
    onRampMock = await blockchain.treasury('onrampMock')
    feeQuoterMock = await blockchain.treasury('feeQuoterMock')
    sender = await blockchain.treasury('sender')

    onrampSend = {
      msg: {
        queryID: 1,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        receiver: EVM_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: ZERO_ADDRESS,
        extraArgs: beginCell().endCell(),
      },
      metadata: {
        sender: sender.address,
        value: toNano('0.6'),
      },
    }
  })

  beforeEach(async () => {
    deployable = await setup(blockchain, deployer)
  })

  const sendDeploy = async (
    selfMessage?: dep.Message,
  ): Promise<{
    sendExecutor: SandboxContract<sx.ContractClient>
    result: SendMessageResult & {
      result: void
    }
  }> => {
    return await sendDeployOnBlockchain(blockchain, deployer, deployable, selfMessage, onRampMock)
  }

  it('should match facility ID', async () => {
    const { sendExecutor } = await sendDeploy()
    const facilityId = await sendExecutor.getFacilityId()
    expect(facilityId).toBe(BigInt(sx.CCIP_SEND_EXECUTOR_FACILITY_ID))
  })

  it('should match error code', async () => {
    const { sendExecutor } = await sendDeploy()
    const errorCode = await sendExecutor.getErrorCode(0n)
    expect(errorCode).toBe(BigInt(sx.CCIP_SEND_EXECUTOR_ERROR_CODE))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'send_executor_unit_tests', [
        {
          code: await compile('CCIPSendExecutor'),
          name: 'send_executor',
        },
      ])
    }
  })
})
