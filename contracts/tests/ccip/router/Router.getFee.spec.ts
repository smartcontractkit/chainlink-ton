import { toNano, Cell, beginCell, Builder, Slice } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { WRAPPED_NATIVE } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/gen/ccip/Router'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import { setup, contractsCoverageConfig } from './Router.Setup'
import EVM_ADDRESS from '../../utils/evmAddress'
import { ChainSelectors } from '../../utils/Selectors'

const EVM_CC_ADDRESS: rt.CrossChainAddress = EVM_ADDRESS

interface TestContextCase {
  description: string
  expectedToFailForV1: boolean
  context: null | Cell
}

const cases: TestContextCase[] = [
  { description: 'null', expectedToFailForV1: false, context: null },
  { description: 'empty cell', expectedToFailForV1: false, context: beginCell().endCell() },
  {
    description: 'single uint',
    expectedToFailForV1: false,
    context: beginCell().storeUint(123, 32).endCell(),
  },
  {
    description: 'nested cell',
    expectedToFailForV1: false,
    context: beginCell()
      .storeUint(456, 32)
      .storeRef(beginCell().storeUint(789, 32).endCell())
      .endCell(),
  },
  {
    description: 'full cell',
    expectedToFailForV1: true,
    context: beginCell()
      .storeUint(123, 256)
      .storeUint(456, 256)
      .storeUint(789, 256)
      .storeUint(123, 255 - 32 /*opcode size*/)
      .endCell(),
  },
]

const contextsEqual = (actual: Cell | null, expected: Cell | null): boolean =>
  actual === null ? expected === null : expected !== null && actual.equals(expected)

describe.each(cases)(
  'Router > GetValidatedFee',
  ({ description, context, expectedToFailForV1 }) => {
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
      const res = await setup(blockchain, { feeQuoter, onRamp })
      ;({ deployer, sender } = res)
      router = blockchain.openContract(rt.Router.fromAddress(res.router.address))
    })

    const msg = rt.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_CC_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: WRAPPED_NATIVE,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      }),
    })

    describe(`context: ${description}`, () => {
      describe('new version', () => {
        it('should forward getValidatedFee to OnRamp', async () => {
          const result = await router.sendRouterGetValidatedFee(sender.getSender(), toNano('0.5'), {
            ccipSend: msg,
            context,
          })

          expect(result.transactions).toHaveTransaction({
            from: sender.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: onRamp.address,
            success: true,
            op: or.OnRamp_GetValidatedFee.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = or.OnRamp_GetValidatedFee.fromSlice(x.beginParse())
              const decodedContext = rt.Router_GetValidatedFeeContext.fromSlice(
                decoded.context!.beginParse(),
              )
              return (
                decodedContext.routerContext.equals(sender.address) &&
                decodedContext.oldContextVersion === false &&
                contextsEqual(decodedContext.userContext, context) &&
                decoded.ccipSend.queryID === 1n &&
                decoded.ccipSend.data.equals(Cell.EMPTY) &&
                decoded.ccipSend.destChainSelector ===
                  ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 &&
                decoded.ccipSend.receiver.asCell().equals(EVM_ADDRESS.asCell()) &&
                decoded.ccipSend.tokenAmounts.length === 0 &&
                decoded.ccipSend.feeToken!.equals(WRAPPED_NATIVE)
              )
            },
          })
        })

        it('should reject getValidatedFee for disabled dest chain (missing OnRamp)', async () => {
          const badMsg: rt.Router_CCIPSend = {
            $: 'Router_CCIPSend',
            queryID: 1n,
            destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 + 1n,
            receiver: EVM_ADDRESS,
            data: Cell.EMPTY,
            tokenAmounts: [],
            feeToken: WRAPPED_NATIVE,
            extraArgs: rt.GenericExtraArgsV2.create({
              gasLimit: 100n,
              allowOutOfOrderExecution: true,
            }),
          }
          const result = await router.sendRouterGetValidatedFee(sender.getSender(), toNano('0.5'), {
            ccipSend: badMsg,
            context,
          })

          expect(result.transactions).toHaveTransaction({
            from: sender.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: sender.address,
            op: rt.Router_MessageValidationFailed.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = rt.Router_MessageValidationFailed.fromSlice(x.beginParse())
              return decoded.error === BigInt(rt.Router.Errors['Router_Error.DestChainNotEnabled'])
            },
          })
        })

        it('should reject getValidatedFee for disabled dest chain (zero address)', async () => {
          // Disable the onRamp for the chain
          {
            const result = await router.sendRouterApplyRampUpdates(
              deployer.getSender(),
              toNano('1'),
              {
                queryId: 1n,
                onRampUpdates: {
                  $: 'OnRamps',
                  destChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
                  onRamp: null,
                },
                offRampAdds: null,
                offRampRemoves: null,
              },
            )

            expect(result.transactions).toHaveTransaction({
              from: deployer.address,
              to: router.address,
              success: true,
            })
          }

          const badMsg: rt.Router_CCIPSend = {
            $: 'Router_CCIPSend',
            queryID: 1n,
            destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            receiver: EVM_CC_ADDRESS,
            data: Cell.EMPTY,
            tokenAmounts: [],
            feeToken: WRAPPED_NATIVE,
            extraArgs: rt.GenericExtraArgsV2.create({
              gasLimit: 100n,
              allowOutOfOrderExecution: true,
            }),
          }
          const result = await router.sendRouterGetValidatedFee(sender.getSender(), toNano('0.5'), {
            ccipSend: badMsg,
            context,
          })

          expect(result.transactions).toHaveTransaction({
            from: sender.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: sender.address,
            op: rt.Router_MessageValidationFailed.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = rt.Router_MessageValidationFailed.fromSlice(x.beginParse())
              return decoded.error === BigInt(rt.Router.Errors['Router_Error.DestChainNotEnabled'])
            },
          })
        })

        it('should forward messageValidated from OnRamp', async () => {
          const result = await router.sendOnRampMessageValidated(onRamp.getSender(), toNano('1'), {
            fee: toNano('0.5'),
            msg,
            context: rt.Router_GetValidatedFeeContext.toCell(
              rt.Router_GetValidatedFeeContext.create({
                routerContext: sender.address,
                oldContextVersion: false,
                userContext: context,
              }),
            ),
          })

          expect(result.transactions).toHaveTransaction({
            from: onRamp.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: sender.address,
            op: rt.Router_MessageValidated.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = rt.Router_MessageValidated.fromSlice(x.beginParse())
              return (
                contextsEqual(decoded.context, context) &&
                decoded.fee === toNano('0.5') &&
                decoded.msg.queryID === 1n &&
                decoded.msg.data.equals(Cell.EMPTY) &&
                decoded.msg.destChainSelector ===
                  ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 &&
                decoded.msg.receiver.asCell().equals(EVM_CC_ADDRESS.asCell()) &&
                decoded.msg.tokenAmounts.length === 0 &&
                decoded.msg.feeToken!.equals(WRAPPED_NATIVE)
              )
            },
          })
        })

        it('should throw on messageValidated from non OnRamp', async () => {
          const result = await router.sendOnRampMessageValidated(sender.getSender(), toNano('1'), {
            fee: toNano('0.5'),
            msg,
            context: rt.Router_GetValidatedFeeContext.toCell(
              rt.Router_GetValidatedFeeContext.create({
                routerContext: sender.address,
                oldContextVersion: false,
                userContext: context,
              }),
            ),
          })

          expect(result.transactions).toHaveTransaction({
            from: sender.address,
            to: router.address,
            success: false,
            exitCode: rt.Router.Errors['Router_Error.NotOnRamp'],
          })
        })

        it('should forward messageValidationFailed from OnRamp', async () => {
          const result = await router.sendOnRampMessageValidationFailed(
            onRamp.getSender(),
            toNano('1'),
            {
              error: 12345n,
              msg,
              context: rt.Router_GetValidatedFeeContext.toCell(
                rt.Router_GetValidatedFeeContext.create({
                  routerContext: sender.address,
                  oldContextVersion: false,
                  userContext: context,
                }),
              ),
            },
          )

          expect(result.transactions).toHaveTransaction({
            from: onRamp.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: sender.address,
            op: rt.Router_MessageValidationFailed.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = rt.Router_MessageValidationFailed.fromSlice(x.beginParse())
              return (
                contextsEqual(decoded.context, context) &&
                decoded.error === 12345n &&
                decoded.msg.queryID === 1n &&
                decoded.msg.data.equals(Cell.EMPTY) &&
                decoded.msg.destChainSelector ===
                  ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 &&
                decoded.msg.receiver.asCell().equals(EVM_CC_ADDRESS.asCell()) &&
                decoded.msg.tokenAmounts.length === 0 &&
                decoded.msg.feeToken!.equals(WRAPPED_NATIVE)
              )
            },
          })
        })

        it('should throw on messageValidationFailed from non OnRamp', async () => {
          const result = await router.sendOnRampMessageValidationFailed(
            sender.getSender(),
            toNano('1'),
            {
              error: 12345n,
              msg,
              context: rt.Router_GetValidatedFeeContext.toCell(
                rt.Router_GetValidatedFeeContext.create({
                  routerContext: sender.address,
                  oldContextVersion: false,
                  userContext: context,
                }),
              ),
            },
          )

          expect(result.transactions).toHaveTransaction({
            from: sender.address,
            to: router.address,
            success: false,
            exitCode: rt.Router.Errors['Router_Error.NotOnRamp'],
          })
        })
      })

      describe('backwards compatibility with V1', () => {
        it('should forward getValidatedFee to OnRamp', async () => {
          const result = await router.sendRouterGetValidatedFeeV1(
            sender.getSender(),
            toNano('0.5'),
            {
              ccipSend: msg,
              context: (context ?? Cell.EMPTY).asSlice(),
            },
          )

          expect(result.transactions).toHaveTransaction({
            from: sender.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: onRamp.address,
            success: true,
            op: or.OnRamp_GetValidatedFee.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = or.OnRamp_GetValidatedFee.fromSlice(x.beginParse())
              const decodedContext = rt.Router_GetValidatedFeeContext.fromSlice(
                decoded.context!.beginParse(),
              )
              return (
                decodedContext.routerContext.equals(sender.address) &&
                decodedContext.oldContextVersion === true &&
                contextsEqual(decodedContext.userContext, context ?? Cell.EMPTY) &&
                decoded.ccipSend.queryID === 1n &&
                decoded.ccipSend.data.equals(Cell.EMPTY) &&
                decoded.ccipSend.destChainSelector ===
                  ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 &&
                decoded.ccipSend.receiver.asCell().equals(EVM_ADDRESS.asCell()) &&
                decoded.ccipSend.tokenAmounts.length === 0 &&
                decoded.ccipSend.feeToken!.equals(WRAPPED_NATIVE)
              )
            },
          })
        })

        it('should forward messageValidated from OnRamp', async () => {
          const result = await router.sendOnRampMessageValidated(onRamp.getSender(), toNano('1'), {
            fee: toNano('0.5'),
            msg,
            context: rt.Router_GetValidatedFeeContext.toCell(
              rt.Router_GetValidatedFeeContext.create({
                routerContext: sender.address,
                oldContextVersion: true,
                userContext: context,
              }),
            ),
          })

          if (expectedToFailForV1) {
            expect(result.transactions).toHaveTransaction({
              from: onRamp.address,
              to: router.address,
              success: false,
              exitCode: 8,
            })
            return
          }

          expect(result.transactions).toHaveTransaction({
            from: onRamp.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: sender.address,
            op: rt.Router_MessageValidated_V1.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = rt.Router_MessageValidated_V1.fromSlice(x.beginParse())
              return (
                decoded.context.asCell().equals(context ?? Cell.EMPTY) &&
                decoded.fee === toNano('0.5') &&
                decoded.msg.queryID === 1n &&
                decoded.msg.data.equals(Cell.EMPTY) &&
                decoded.msg.destChainSelector ===
                  ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 &&
                decoded.msg.receiver.asCell().equals(EVM_CC_ADDRESS.asCell()) &&
                decoded.msg.tokenAmounts.length === 0 &&
                decoded.msg.feeToken!.equals(WRAPPED_NATIVE)
              )
            },
          })
        })

        it('should forward messageValidationFailed from OnRamp', async () => {
          const result = await router.sendOnRampMessageValidationFailed(
            onRamp.getSender(),
            toNano('1'),
            {
              error: 12345n,
              msg,
              context: rt.Router_GetValidatedFeeContext.toCell(
                rt.Router_GetValidatedFeeContext.create({
                  routerContext: sender.address,
                  oldContextVersion: true,
                  userContext: context,
                }),
              ),
            },
          )

          if (expectedToFailForV1) {
            expect(result.transactions).toHaveTransaction({
              from: onRamp.address,
              to: router.address,
              success: false,
              exitCode: 8,
            })
            return
          }

          expect(result.transactions).toHaveTransaction({
            from: onRamp.address,
            to: router.address,
            success: true,
          })

          expect(result.transactions).toHaveTransaction({
            from: router.address,
            to: sender.address,
            op: rt.Router_MessageValidationFailed_V1.PREFIX,
            body(x) {
              if (!x) return false
              const decoded = rt.Router_MessageValidationFailed_V1.fromSlice(x.beginParse())
              return (
                decoded.context.asCell().equals(context ?? Cell.EMPTY) &&
                decoded.error === 12345n &&
                decoded.msg.queryID === 1n &&
                decoded.msg.data.equals(Cell.EMPTY) &&
                decoded.msg.destChainSelector ===
                  ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 &&
                decoded.msg.receiver.asCell().equals(EVM_CC_ADDRESS.asCell()) &&
                decoded.msg.tokenAmounts.length === 0 &&
                decoded.msg.feeToken!.equals(WRAPPED_NATIVE)
              )
            },
          })
        })
      })
    })

    afterAll(async () => {
      if (process.env['COVERAGE'] === 'true') {
        await coverage.generateCoverageArtifacts(
          blockchain,
          'router_getFee',
          await contractsCoverageConfig(),
        )
      }
    })
  },
)
