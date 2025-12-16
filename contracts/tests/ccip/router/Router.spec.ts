import { compile } from '@ton/blueprint'
import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { crc32 } from 'zlib'
import * as coverage from '../../coverage/coverage'
import { facilityId } from '../../../wrappers/utils'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import { ownable2StepSpec } from '../../lib/access/Ownable2StepSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as rt from '../../../wrappers/ccip/Router'
import { contractsCoverageConfig, deployRouterContract, setup } from './Router.Setup'

describe('rt.Router - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: rt.Router.type(),
    version: rt.Router.version(),
    deployContract: deployRouterContract,
  })

  currentVersionSpec.run([
    {
      code: 'Router',
      name: 'router',
    },
  ])
})

describe('Router - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('Router'),
    ContractConstructor: rt.Router,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: deployRouterContract,
  })
  withdrawableSpec.run([
    {
      code: 'Router',
      name: 'router',
    },
  ])
})

// TODO when we have a new version
// describe('Router - Upgrade Tests', () => {
//   const upgradeSpec = UpgradeableSpec.newUpgradeSpec(
//     {
//       contractType: RouterPrev.type(),
//       prevVersion: RouterPrev.version(),
//       currentVersion: Router.version(),
//       getPrevCode: () => RouterPrev.code(),
//       getCurrentCode: () => Router.code(),
//       CurrentVersionConstructor: Router,
//     },
//     async (blockchain, owner) => {
//       const codeV1 = await RouterPrev.code()
//       const data = {} as any // TODO fill with valid data
//       const contract = blockchain.openContract(
//         RouterPrev.createFromConfig(
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

describe('Router - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: rt.Router.type(),
    currentVersion: rt.Router.version(),
    getCurrentCode: () => rt.Router.code(),
    CurrentVersionConstructor: rt.Router,
    deployCurrentContract: deployRouterContract,
  })
  currentVersionSpec.run('router')
})

describe('Router - Ownable Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>

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
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
  })

  beforeEach(async () => {
    ;({ deployer, sender, router } = await setup(blockchain, { feeQuoter, onRamp }))
  })

  it('supports ownable messages', async () => {
    const other = await blockchain.treasury('other')
    await ownable2StepSpec(deployer, other, router, {
      coverage: {
        blockchain,
        conf: [
          {
            code: 'Router',
            name: 'router',
          },
        ],
      },
    })
  })

  it('supports RMN ownable messages', async () => {
    const other = await blockchain.treasury('other')
    await ownable2StepSpec(deployer, other, blockchain.openContract(router.RMNOwnable), {
      coverage: {
        blockchain,
        conf: [
          {
            code: 'Router',
            name: 'router',
          },
        ],
      },
    })
  })

  it('should match facility ID', async () => {
    const facilityId = await router.getFacilityId()
    expect(facilityId).toBe(BigInt(rt.ROUTER_FACILITY_ID))
  })

  it('should match error code', async () => {
    const errorCode = await router.getErrorCode(0n)
    expect(errorCode).toBe(BigInt(rt.ROUTER_ERROR_CODE))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_ownable',
        await contractsCoverageConfig(),
      )
    }
  })
})

describe('Router - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(rt.opcodes.in.applyRampUpdates).toBe(crc32('Router_ApplyRampUpdates'))
    expect(rt.opcodes.in.ccipSend).toBe(crc32('Router_CcipSend'))
    expect(rt.opcodes.in.ccipReceiveConfirm).toBe(crc32('Router_CcipReceiveConfirm'))
    expect(rt.opcodes.in.routeMessage).toBe(crc32('Router_RouteMessage'))
    expect(rt.opcodes.in.rmnRemoteCurse).toBe(crc32('Router_Curse'))
    expect(rt.opcodes.in.rmnRemoteUncurse).toBe(crc32('Router_Uncurse'))
    expect(rt.opcodes.in.verifyNotCursed).toBe(crc32('Router_VerifyNotCursed'))
    expect(rt.opcodes.in.messageSent).toBe(crc32('Router_MessageSent'))
    expect(rt.opcodes.in.messageRejected).toBe(crc32('Router_MessageRejected'))
    expect(rt.opcodes.in.getValidatedFee).toBe(crc32('Router_GetValidatedFee'))
  })

  it('should match out opcodes', () => {
    expect(rt.opcodes.out.messageValidated).toBe(crc32('Router_MessageValidated'))
    expect(rt.opcodes.out.messageValidationFailed).toBe(crc32('Router_MessageValidationFailed'))
    expect(rt.opcodes.out.ccipSendACK).toBe(crc32('Router_CCIPSendACK'))
    expect(rt.opcodes.out.ccipSendNACK).toBe(crc32('Router_CCIPSendNACK'))
  })
})

describe('Router - Facility ID', () => {
  it('Test facilityId matches facility name', () => {
    expect(rt.ROUTER_FACILITY_ID).toEqual(facilityId(crc32(rt.ROUTER_FACILITY_NAME)))
  })
})
