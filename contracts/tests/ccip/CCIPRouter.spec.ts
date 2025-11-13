import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox'
import {
  toNano,
  Address,
  Cell,
  Dictionary,
  beginCell,
  Message,
  CommonMessageInfoInternal,
  TransactionDescriptionGeneric,
  Sender,
} from '@ton/core'
import { compile, sleep } from '@ton/blueprint'
import * as rt from '../../wrappers/ccip/Router'
import * as or from '../../wrappers/ccip/OnRamp'
import * as fq from '../../wrappers/ccip/FeeQuoter'
import '@ton/test-utils'
import { assertLog } from '../Logs'
import { LogTypes } from '../../wrappers/ccip/Logs'
import { generateRandomTonAddress, ZERO_ADDRESS } from '../../src/utils'
import { JettonMinterCode, JettonWalletCode } from '../../wrappers/jetton/JettonCode'
import { JettonMinter } from '../../wrappers/jetton/JettonMinter'
import * as jetton from '../../wrappers/jetton/JettonWallet'
import { CellCodec, facilityId } from '../../wrappers/utils'
import { crc32 } from 'zlib'
import * as sendExecutor from '../../wrappers/ccip/CCIPSendExecutor'
import { newWithdrawableSpec } from '../lib/funding/WithdrawableSpec'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'
import * as UpgradeableSpec from '../lib/versioning/UpgradeableSpec'
import * as TypeAndVersionSpec from '../lib/versioning/TypeAndVersionSpec'
import { dump } from '../utils/prettyPrint'
import { getValidatedFee } from '../../src/ccipSend/fee'
import { sendGetValidatedFee } from './helpers/GetValidatedFee'
import * as ownable2StepSpec from '../../tests/lib/access/Ownable2StepSpec'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_EVM_TEST_90000002 = 5548718428018410741n
const CHAIN_FAMILY_SELECTOR_EVM = 0x2812d52c
const CHAIN_FAMILY_SELECTOR_SVM = 0x1e10bdc4
const CHAIN_FAMILY_SELECTOR_APTOS = 0xac77ffec
const CHAIN_FAMILY_SELECTOR_SUI = 0xc4e05953

const CHAINSEL_TON = 13879075125137744094n
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000001',
)

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes

describe('rt.Router - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: rt.Router.type(),
    version: rt.Router.version(),
    deployContract: deployRouterContract,
  })
  currentVersionSpec.run()
})

describe('Router - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('Router'),
    ContractConstructor: rt.Router,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: deployRouterContract,
  })
  withdrawableSpec.run()
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
    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')
    let deployerCode = await compile('Deployable')
    let merkleRootCodeRaw = await compile('MerkleRoot')

    // Populate the emulator library code
    // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
    const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs
    // Mock UpdatePrices Message handler
    let routerCode = await compile('Router')
    let data: rt.Storage = {
      id: 0n,
      ownable: {
        owner: deployer.address,
        pendingOwner: null,
      },
      wrappedNative: TEST_TOKEN_ADDR,
      onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
      offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
    }
    router = blockchain.openContract(rt.Router.createFromConfig(data, routerCode))
    // Deploy contract
    {
      const result = await router.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        deploy: true,
        success: true,
      })
    }

    // setup fee quoter
    {
      let code = await compile('FeeQuoter')

      let data: fq.FeeQuoterStorage = {
        id: 0,
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        allowedPriceUpdaters: Dictionary.empty(Dictionary.Keys.Address()),
        maxFeeJuelsPerMsg: 1000000n,
        linkToken: ZERO_ADDRESS,
        tokenPriceStalenessThreshold: 1000n,
        usdPerToken: Dictionary.empty(Dictionary.Keys.Address(), fq.createTimestampedPriceValue()),
        premiumMultiplierWeiPerEth: Dictionary.empty(
          Dictionary.Keys.Address(),
          Dictionary.Values.BigUint(64),
        ),
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64)),
      }
      feeQuoter = blockchain.openContract(fq.FeeQuoter.createFromConfig(data, code))

      {
        const result = await feeQuoter.sendDeploy(deployer.getSender(), toNano('1'))
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: feeQuoter.address,
          deploy: true,
          success: true,
        })
      }
      {
        // Allow us to updatePrices
        const addPriceUpdaterResult = await feeQuoter.sendAddPriceUpdater(deployer.getSender(), {
          value: toNano('1'),
          msg: { priceUpdater: deployer.address },
        })
        expect(addPriceUpdaterResult.transactions).toHaveTransaction({
          to: feeQuoter.address,
          success: true,
        })

        const result = await feeQuoter.sendUpdatePrices(deployer.getSender(), {
          value: toNano('1'),
          msg: {
            updates: {
              gasPricesUpdates: [],
              tokenPricesUpdates: [{ token: TEST_TOKEN_ADDR, price: BigInt(123e36) }],
            },
          },
        })
        expect(result.transactions).toHaveTransaction({
          to: feeQuoter.address,
          success: true,
        })
      }

      // add config for EVM destination
      {
        const result = await feeQuoter.sendUpdateDestChainConfigs(deployer.getSender(), {
          value: toNano('1'),
          updates: [
            {
              destChainSelector: CHAINSEL_EVM_TEST_90000001,
              config: {
                // minimal valid config
                isEnabled: true,
                maxNumberOfTokensPerMsg: 1,
                maxDataBytes: 100,
                maxPerMsgGasLimit: 100,
                destGasOverhead: 0,
                destGasPerPayloadByteBase: 0,
                destGasPerPayloadByteHigh: 0,
                destGasPerPayloadByteThreshold: 0,
                destDataAvailabilityOverheadGas: 0,
                destGasPerDataAvailabilityByte: 0,
                destDataAvailabilityMultiplierBps: 0,
                chainFamilySelector: CHAIN_FAMILY_SELECTOR_EVM,
                defaultTokenFeeUsdCents: 0,
                defaultTokenDestGasOverhead: 0,
                defaultTxGasLimit: 1,
                gasMultiplierWeiPerEth: 0n,
                gasPriceStalenessThreshold: 0,
                networkFeeUsdCents: 0,
              },
            },
          ],
        })
        expect(result.transactions).toHaveTransaction({
          to: feeQuoter.address,
          success: true,
        })
      }
      // configure the feeToken
      {
        const result = await feeQuoter.sendUpdateFeeTokens(deployer.getSender(), {
          value: toNano('1'),
          msg: {
            add: new Map([[TEST_TOKEN_ADDR, { premiumMultiplierWeiPerEth: 1n }]]),
            remove: [],
          },
        })
        expect(result.transactions).toHaveTransaction({
          to: feeQuoter.address,
          success: true,
        })
      }
      // TODO: call UpdatePrices so there's a price available and the timestamp isn't zero
    }
    // setup onramp
    {
      let code = await compile('OnRamp')
      let data: or.OnRampStorage = {
        id: 0,
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        chainSelector: CHAINSEL_TON,
        config: {
          feeQuoter: feeQuoter.address,
          feeAggregator: deployer.address,
          allowlistAdmin: deployer.address,
        },
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
        executor: {
          deployableCode: await compile('Deployable'),
          executorCode: await compile('CCIPSendExecutor'),
          currentID: 0n,
        },
      }
      // TODO: use deployable to make deterministic?
      onRamp = blockchain.openContract(or.OnRamp.createFromConfig(data, code))
      {
        const result = await onRamp.sendDeploy(deployer.getSender(), toNano('1'))
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: onRamp.address,
          deploy: true,
          success: true,
        })
      }

      // add config for EVM destination
      {
        const config = {
          router: router.address,
          sequenceNumber: 0n,
          allowlistEnabled: false,
        }

        const result = await onRamp.sendUpdateDestChainConfigs(deployer.getSender(), {
          value: toNano('1'),
          destChainConfigs: [
            {
              destChainSelector: CHAINSEL_EVM_TEST_90000001,
              router: config.router,
              allowlistEnabled: config.allowlistEnabled,
            },
          ],
        })
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: onRamp.address,
          deploy: false,
          success: true,
        })
        assertLog(result.transactions, onRamp.address, LogTypes.DestChainSelectorAdded, {
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
        })
        assertLog(result.transactions, onRamp.address, LogTypes.DestChainConfigUpdated, {
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
          config,
        })
      }
    }

    // Configure onRamp on router
    {
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          onRamps: {
            destChainSelectors: [CHAINSEL_EVM_TEST_90000001],
            onRamp: onRamp.address,
          },
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.OnRampSet, {
        destChainSelectors: [CHAINSEL_EVM_TEST_90000001],
        onRamp: onRamp.address,
      })
    }
  })

  it('update router onramps in batch', async () => {
    {
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          onRamps: {
            destChainSelectors: [CHAINSEL_EVM_TEST_90000001, CHAINSEL_EVM_TEST_90000002],
            onRamp: onRamp.address,
          },
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    {
      let result = await router.getOnRamp(CHAINSEL_EVM_TEST_90000001)
      expect(result).toEqual(onRamp.address)

      result = await router.getOnRamp(CHAINSEL_EVM_TEST_90000002)
      expect(result).toEqual(onRamp.address)
    }

    {
      let result = await router.getOnRamps()
      expect(result).toEqual([
        {
          chainSelector: CHAINSEL_EVM_TEST_90000002,
          address: onRamp.address,
        },
        {
          chainSelector: CHAINSEL_EVM_TEST_90000001,
          address: onRamp.address,
        },
      ])
    }
  })

  it('update router offRamp events emission', async () => {
    const offRampAddress1 = await generateRandomTonAddress()
    {
      // test update method wrapper
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          offRampAdds: {
            sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001, CHAINSEL_EVM_TEST_90000002],
            offRamp: offRampAddress1,
          },
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.OffRampAdded, {
        sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001, CHAINSEL_EVM_TEST_90000002],
        offRampAdded: offRampAddress1,
      })

      // test update method wrapper
      const result2 = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          offRampRemoves: {
            sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001, CHAINSEL_EVM_TEST_90000002],
            offRamp: offRampAddress1,
          },
        },
      })
      expect(result2.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result2.transactions, router.address, LogTypes.OffRampRemoved, {
        sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001, CHAINSEL_EVM_TEST_90000002],
        offRampRemoved: offRampAddress1,
      })
    }
  })

  it('update router offramps in batch with one offRamp address', async () => {
    const offRampAddress1 = await generateRandomTonAddress()
    {
      // test update method wrapper
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          offRampAdds: {
            sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001, CHAINSEL_EVM_TEST_90000002],
            offRamp: offRampAddress1,
          },
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.OffRampAdded, {
        sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001, CHAINSEL_EVM_TEST_90000002],
        offRampAdded: offRampAddress1,
      })
    }

    {
      //test batch getter
      let result = await router.getOffRamps()
      expect(result.sort()).toEqual(
        [
          {
            chainSelector: CHAINSEL_EVM_TEST_90000002,
            address: offRampAddress1,
          },
          {
            chainSelector: CHAINSEL_EVM_TEST_90000001,
            address: offRampAddress1,
          },
        ].sort(),
      )
    }

    {
      // test individual getter
      let result = await router.getOffRamp(CHAINSEL_EVM_TEST_90000001)
      expect(result).toEqual(offRampAddress1)

      result = await router.getOffRamp(CHAINSEL_EVM_TEST_90000002)
      expect(result).toEqual(offRampAddress1)
    }

    {
      //test removing ramps wrapper
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          offRampRemoves: {
            sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001],
            offRamp: offRampAddress1,
          },
        },
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      let getResult = await router.getOffRamps()
      expect(getResult).toEqual([
        {
          chainSelector: CHAINSEL_EVM_TEST_90000002,
          address: offRampAddress1,
        },
      ])
    }

    {
      const offRampAddress2 = await generateRandomTonAddress()
      //test adding and removing on the same call
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          offRampAdds: {
            sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001],
            offRamp: offRampAddress2,
          },
          offRampRemoves: {
            sourceChainSelectors: [CHAINSEL_EVM_TEST_90000002],
            offRamp: offRampAddress1,
          },
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      const getResult = await router.getOffRamps()
      expect(getResult).toEqual([
        {
          chainSelector: CHAINSEL_EVM_TEST_90000001,
          address: offRampAddress2,
        },
      ])
    }
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
              return ccipSendACK.queryID == BigInt(ccipSend.queryID!) && ccipSendACK.messageId != 0n
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
})

async function deployRouterContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
) {
  const code = await rt.Router.code()
  let data: rt.Storage = {
    id: 0n,
    ownable: {
      owner: owner.address,
      pendingOwner: null,
    },
    wrappedNative: TEST_TOKEN_ADDR,
    onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
    offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
  }

  // TODO: use deployable to make deterministic?
  const contract = blockchain.openContract(rt.Router.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await contract.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)
  return contract
}

async function setupJetton(
  blockchain: Blockchain,
  feeQuoter: SandboxContract<fq.FeeQuoter>,
  deployer: SandboxContract<TreasuryContract>,
  user: SandboxContract<TreasuryContract>,
) {
  const jettonDataURI = 'smartcontract.com'

  const defaultContent = beginCell().storeStringTail(jettonDataURI).endCell()

  // get jetton wallet code
  const jettonWalletCode = await JettonWalletCode()

  // deploy jetton minter
  const jettonMinterCode = await JettonMinterCode()
  const jettonMinter = blockchain.openContract(
    JettonMinter.createFromConfig(
      {
        admin: deployer.address,
        walletCode: jettonWalletCode,
        jettonContent: defaultContent,
        totalSupply: 0n,
      },
      jettonMinterCode,
    ),
  )

  const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))

  expect(deployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: jettonMinter.address,
    deploy: true,
  })

  // mint jettons to sender contract address as part of the setup
  const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
    value: toNano('1'),
    message: {
      queryId: 0n,
      destination: user.address,
      tonAmount: toNano('0.05'),
      jettonAmount: toNano('1'),
      from: deployer.address,
      responseDestination: deployer.address,
      forwardTonAmount: 0n,
    },
  })

  expect(mintResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: jettonMinter.address,
    success: true,
    endStatus: 'active',
    outMessagesCount: 1, // mint message
  })

  {
    // TODO sendUpdatePrices to pay fees with LINK
    // const result = await feeQuoter.sendUpdatePrices(deployer.getSender(), {
    //   value: toNano('1'),
    //   gasPrices: [],
    //   tokenPrices: [{ token: jettonMinter.address, price: 1n }],
    // })
    // expect(result.transactions).toHaveTransaction({
    //   to: feeQuoter.address,
    //   success: true,
    // })
  }

  {
    const result = await feeQuoter.sendUpdateTokenTransferFeeConfigs(deployer.getSender(), {
      value: toNano('1'),
      msg: {
        updates: new Map([
          [
            CHAINSEL_EVM_TEST_90000001,
            {
              add: new Map([
                [
                  jettonMinter.address,
                  {
                    isEnabled: true,
                    minFeeUsdCents: 1,
                    maxFeeUsdCents: 100,
                    deciBps: 0,
                    destGasOverhead: 0,
                    destBytesOverhead: 0,
                  },
                ],
              ]),
              remove: [],
            },
          ],
        ]),
      },
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: feeQuoter.address,
      success: true,
    })
  }

  const provideUserWalletFor = async (address: Address) => {
    return blockchain.openContract(
      jetton.JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
    )
  }

  return {
    jettonMinter,
    provideUserWalletFor,
  }
}

export function verifyBodyMessage<T>(
  body: Cell | undefined,
  codec: CellCodec<T>,
  validations: ((message: T) => boolean)[] = [],
): boolean {
  if (!body) {
    console.log('Body is empty')
    return false
  }

  let message: T
  try {
    message = codec.load(body.beginParse())
  } catch (e) {
    console.log('Failed to parse message body:', e)
    return false
  }

  return validations.every((validate) => validate(message))
}

function verifyBodyIsTransferRequest(
  body: Cell | undefined,
  options: {
    transferRequestValidaton?: (request: jetton.AskToTransfer) => boolean
  } = {},
): boolean {
  const { transferRequestValidaton } = options
  const validations = transferRequestValidaton ? [transferRequestValidaton] : []

  return verifyBodyMessage(body, jetton.builder.messages.in.askToTransfer, validations)
}

function verifyBodyIsTransferRequestWithFwdPayload<T>(
  body: Cell | undefined,
  payloadCodec: CellCodec<T>,
  options: {
    transferRequestValidaton?: (request: jetton.AskToTransferWithFwdPayload<T>) => boolean
    fwdPayloadValidation?: (payload: T) => boolean
  } = {},
): boolean {
  const { transferRequestValidaton, fwdPayloadValidation } = options

  const validations = [
    ...(transferRequestValidaton ? [transferRequestValidaton] : []),
    ...(fwdPayloadValidation
      ? [
          (request: jetton.AskToTransferWithFwdPayload<T>) =>
            fwdPayloadValidation(request.forwardPayload),
        ]
      : []),
  ]

  return verifyBodyMessage(
    body,
    jetton.builder.messages.in.askToTransferWithFwdPayload(payloadCodec),
    validations,
  )
}

function verifyBodyIsTransferNotification(
  body: Cell | undefined,
  options: {
    transferNotificationValidaton?: (
      notification: jetton.TransferNotificationForRecipient,
    ) => boolean
  } = {},
): boolean {
  const { transferNotificationValidaton } = options
  const validations = transferNotificationValidaton ? [transferNotificationValidaton] : []

  return verifyBodyMessage(
    body,
    jetton.builder.messages.out.transferNotificationForRecipient,
    validations,
  )
}

function verifyBodyIsTransferNotificationWithFwdPayload<T>(
  body: Cell | undefined,
  payloadCodec: CellCodec<T>,
  options: {
    transferNotificationValidaton?: (
      notification: jetton.TransferNotificationWithFwdPayload<T>,
    ) => boolean
    fwdPayloadValidation?: (payload: T) => boolean
  } = {},
): boolean {
  const { transferNotificationValidaton, fwdPayloadValidation } = options

  const validations = [
    ...(transferNotificationValidaton ? [transferNotificationValidaton] : []),
    ...(fwdPayloadValidation
      ? [
          (notification: jetton.TransferNotificationWithFwdPayload<T>) =>
            fwdPayloadValidation(notification.forwardPayload),
        ]
      : []),
  ]

  return verifyBodyMessage(
    body,
    jetton.builder.messages.out.transferNotificationWithFwdPayload(payloadCodec),
    validations,
  )
}

function verifyBodyIsRouterMessageSent(
  body: Cell | undefined,
  options: {
    validation?: (ack: rt.MessageSent) => boolean
  } = {},
): boolean {
  const { validation } = options
  const validations = validation ? [validation] : []

  return verifyBodyMessage(body, rt.builder.message.in.messageSent, validations)
}

function verifyBodyIsRouterCCIPSendACK(
  body: Cell | undefined,
  options: {
    validation?: (ack: rt.CCIPSendACK) => boolean
  } = {},
): boolean {
  const { validation } = options
  const validations = validation ? [validation] : []

  return verifyBodyMessage(body, rt.builder.message.out.ccipSendACK, validations)
}
