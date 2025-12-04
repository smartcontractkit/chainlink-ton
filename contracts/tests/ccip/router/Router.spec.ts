import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell, Dictionary, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import { crc32 } from 'zlib'
import { generateRandomTonAddress } from '../../../src/utils'
import { JettonMinterCode, JettonWalletCode } from '../../../wrappers/jetton/JettonCode'
import { facilityId } from '../../../wrappers/utils'
import { dump } from '../../utils/prettyPrint'
import * as coverage from '../../coverage/coverage'
import { assertLog } from '../../Logs'
import { LogTypes } from '../../../wrappers/ccip/Logs'
import {
  verifyBodyIsRouterCCIPSendACK,
  verifyBodyIsRouterMessageSent,
} from '../../utils/verifyMessageBody'

import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as ownable2StepSpec from '../../lib/access/Ownable2StepSpec'
import * as UpgradeableSpec from '../../lib/versioning/UpgradeableSpec'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import { getValidatedFee } from '../../../src/ccipSend/fee'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'
import * as rt from '../../../wrappers/ccip/Router'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import * as sendExecutor from '../../../wrappers/ccip/CCIPSendExecutor'
import {
  CHAINSEL_EVM_TEST_90000001,
  CHAINSEL_EVM_TEST_90000002,
  deployRouterContract,
  EVM_ADDRESS,
  setup,
  TEST_TOKEN_ADDR,
} from './Router.Setup'
import { sendGetValidatedFee } from '../onramp/OnChainGetValidatedFee'

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
  currentVersionSpec.run()
})

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let onRamp: SandboxContract<or.OnRamp>

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

    beforeEach(async () => {
      ;({ deployer, sender, router, feeQuoter, onRamp } = await setup(blockchain))
    })

    it('router respects cursing', async () => {
      // Curse the lane
      {
        const result = await router.sendCurse(deployer.getSender(), {
          value: toNano('1'),
          queryID: 0,
          subjects: [CHAINSEL_EVM_TEST_90000001],
        })
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: router.address,
          success: true,
        })

        assertLog(result.transactions, router.address, LogTypes.Cursed, {
          subject: CHAINSEL_EVM_TEST_90000001,
        })
      }

      // Fail router.ccipSend
      {
        const result = await router.sendCcipSend(sender.getSender(), {
          value: toNano('1'),
          body: {
            queryID: 1,
            destChainSelector: CHAINSEL_EVM_TEST_90000001,
            receiver: EVM_ADDRESS,
            data: Cell.EMPTY,
            tokenAmounts: [],
            feeToken: TEST_TOKEN_ADDR,
            extraArgs: rt.builder.data.extraArgs
              .encode({
                kind: 'generic-v2',
                gasLimit: 100n,
                allowOutOfOrderExecution: true,
              })
              .asCell(),
          },
        })

        // we called the router
        expect(result.transactions).toHaveTransaction({
          from: sender.address,
          to: router.address,
          deploy: false,
          success: false,
          exitCode: 49605, // subjectCursed
        })
      }

      // Uncurse the lane
      {
        const result = await router.sendUncurse(deployer.getSender(), {
          value: toNano('1'),
          queryID: 0,
          subjects: [CHAINSEL_EVM_TEST_90000001],
        })
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: router.address,
          success: true,
        })

        assertLog(result.transactions, router.address, LogTypes.Uncursed, {
          subject: CHAINSEL_EVM_TEST_90000001,
        })
      }
    })

    it('onramp arbitrary message passing', async () => {
      // Track initial balance to verify fees are handled correctly
      const initialOnRampBalance = (await blockchain.getContract(onRamp.address)).balance
      const ccipSend: rt.CCIPSend = {
        queryID: 1,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        receiver: EVM_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: TEST_TOKEN_ADDR,
        extraArgs: rt.builder.data.extraArgs
          .encode({
            kind: 'generic-v2',
            gasLimit: 100n,
            allowOutOfOrderExecution: true,
          })
          .asCell(),
      }

      const offchainFee = await getValidatedFee(blockchain, router.address, ccipSend)
      console.log('Validated fee:', offchainFee, 'TON')
      const onchainFee = await sendGetValidatedFee(
        sender.getSender(),
        router,
        ccipSend,
        Cell.EMPTY.asSlice(),
      )
      expect(onchainFee).toBe(offchainFee)

      const totalSendValue = offchainFee + toNano('0.5')
      // router.ccipSend
      {
        const result = await router.sendCcipSend(sender.getSender(), {
          value: totalSendValue,
          body: ccipSend,
        })
        console.log('MsgTrace: \n', (await dump(result.transactions)).join('\n'))
        // console.log('TXs:', result.transactions)

        // we called the router
        expect(result.transactions).toHaveTransaction({
          from: sender.address,
          to: router.address,
          deploy: false,
          success: true,
        })
        // the router called the onRamp
        expect(result.transactions).toHaveTransaction({
          from: router.address,
          to: onRamp.address,
          deploy: false,
          success: true,
        })

        const executorAddress = ((): Address => {
          for (const tx of result.transactions) {
            if (
              tx.inMessage != null &&
              tx.inMessage != undefined &&
              tx.inMessage.info.src != null &&
              tx.inMessage.info.src != undefined &&
              tx.inMessage.info.src instanceof Address &&
              tx.inMessage.info.src.equals(onRamp.address) &&
              tx.inMessage.info.dest != null &&
              tx.inMessage.info.dest != undefined &&
              tx.inMessage.info.dest instanceof Address
            ) {
              return tx.inMessage.info.dest
            }
          }
          throw new Error('Executor address not found')
        })()

        // the onRamp deployed the executor
        expect(result.transactions).toHaveTransaction({
          from: onRamp.address,
          to: executorAddress,
          deploy: true,
          success: true,
        })

        // assert message went to feeQuoter
        expect(result.transactions).toHaveTransaction({
          from: executorAddress,
          to: feeQuoter.address,
          deploy: false,
          success: true,
        })

        // destChainConfig -> feeQuoter -> executor
        expect(result.transactions).toHaveTransaction({
          from: feeQuoter.address,
          to: executorAddress,
          deploy: false,
          success: true,
          destroyed: false,
          // destroyed: true, // TODO should be true after tracetracker is fixed
        })

        // the executor called back the onRamp and self-destructed
        expect(result.transactions).toHaveTransaction({
          from: executorAddress,
          to: onRamp.address,
          deploy: false,
          success: true,
        })

        // assert CCIPMessageSent
        assertLog(result.transactions, onRamp.address, LogTypes.CCIPMessageSent, {
          message: {
            header: {
              destChainSelector: CHAINSEL_EVM_TEST_90000001,
            },
            sender: sender.address,
          },
        })

        // The OnRamp sent Router_MessageSent message to the Router
        expect(result.transactions).toHaveTransaction({
          from: onRamp.address,
          to: router.address,
          deploy: false,
          success: true,
          op: rt.Opcodes.messageSent,
          body(x) {
            return verifyBodyIsRouterMessageSent(x, {
              validation: (messageSent) => {
                return (
                  messageSent.destChainSelector == ccipSend.destChainSelector &&
                  messageSent.sender.equals(sender.address)
                )
              },
            })
          },
        })

        // Router sent Router_CCIPSendACK message to the sender
        expect(result.transactions).toHaveTransaction({
          from: router.address,
          to: sender.address,
          deploy: false,
          success: true,
          op: rt.OutgoingOpcodes.ccipSendACK,
          body(x) {
            return verifyBodyIsRouterCCIPSendACK(x, {
              validation: (ccipSendACK) => {
                return (
                  ccipSendACK.queryID == BigInt(ccipSend.queryID!) && ccipSendACK.messageId != 0n
                )
              },
            })
          },
        })
      }
    })

    it('Test facilityId matches facility name', () => {
      expect(or.ONRAMP_FACILITY_ID).toEqual(facilityId(crc32(or.ONRAMP_FACILITY_NAME)))
      expect(rt.ROUTER_FACILITY_ID).toEqual(facilityId(crc32(rt.ROUTER_FACILITY_NAME)))
      expect(sendExecutor.CCIP_SEND_EXECUTOR_FACILITY_ID).toEqual(
        facilityId(crc32(sendExecutor.CCIP_SEND_EXECUTOR_FACILITY_NAME)),
      )
    })

    it('supports ownable messages', async () => {
      const other = await blockchain.treasury('other')
      await ownable2StepSpec.ownable2StepSpec(deployer, other, router)
    })

    afterAll(async () => {
      if (process.env['COVERAGE'] === 'true') {
        await coverage.generateCoverageArtifacts(blockchain, 'router_unit_tests', [
          {
            code: await router.getCode(),
            name: 'router',
          },
          {
            code: await feeQuoter.getCode(),
            name: 'feequoter',
          },
          {
            code: await onRamp.getCode(),
            name: 'onramp',
          },
          {
            code: await compile('CCIPSendExecutor'),
            name: 'send_executor',
          },
        ])
      }
    })
  })
})
