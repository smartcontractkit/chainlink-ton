import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell, Dictionary, Message, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'
import { Router, RouterStorage } from '../../wrappers/ccip/Router'
import { OnRamp, OnRampStorage } from '../../wrappers/ccip/OnRamp'
import {
  createTimestampedPriceValue,
  FeeQuoter,
  FeeQuoterStorage,
  TimestampedPrice,
} from '../../wrappers/ccip/FeeQuoter'
import '@ton/test-utils'
import { ZERO_ADDRESS } from '../../utils/Utils'
import { assertLog } from '../Logs'
import { LogTypes } from '../../wrappers/ccip/Logs'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_TON = 13879075125137744094n

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let router: SandboxContract<Router>
  let feeQuoter: SandboxContract<FeeQuoter>
  let onRamp: SandboxContract<OnRamp>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')

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
    let data: RouterStorage = {
      ownable: {
        owner: deployer.address,
      },
      onRamp: ZERO_ADDRESS,
    }
    router = blockchain.openContract(Router.createFromConfig(data, routerCode))

    // setup fee quoter
    {
      let code = await compile('FeeQuoter')

      let data: FeeQuoterStorage = {
        ownable: {
          owner: deployer.address,
        },
        maxFeeJuelsPerMsg: 1000000n,
        linkToken: ZERO_ADDRESS,
        tokenPriceStalenessThreshold: 1000n,
        usdPerToken: Dictionary.empty(Dictionary.Keys.Address(), createTimestampedPriceValue()),
        premiumMultiplierWeiPerEth: Dictionary.empty(
          Dictionary.Keys.Address(),
          Dictionary.Values.BigUint(64),
        ),
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64)),
      }
      // HACK: pre-insert token data
      data.usdPerToken.set(ZERO_ADDRESS, {
        value: 123n,
        timestamp: BigInt(Date.now()),
      } as TimestampedPrice)
      feeQuoter = blockchain.openContract(FeeQuoter.createFromConfig(data, code))

      let result = await feeQuoter.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: feeQuoter.address,
        deploy: true,
        success: true,
      })

      // add config for EVM destination
      result = await feeQuoter.sendUpdateDestChainConfig(deployer.getSender(), {
        value: toNano('1'),
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        config: {
          // minimal valid config
          isEnabled: true,
          maxNumberOfTokensPerMsg: 0, // TODO:
          maxDataBytes: 100,
          maxPerMsgGasLimit: 100,
          destGasOverhead: 0,
          destGasPerPayloadByteBase: 0,
          destGasPerPayloadByteHigh: 0,
          destGasPerPayloadByteThreshold: 0,
          destDataAvailabilityOverheadGas: 0,
          destGasPerDataAvailabilityByte: 0,
          destDataAvailabilityMultiplierBps: 0,
          chainFamilySelector: 0,
          enforceOutOfOrder: true,
          defaultTokenFeeUsdCents: 0,
          defaultTokenDestGasOverhead: 0,
          defaultTxGasLimit: 1,
          gasMultiplierWeiPerEth: 0n,
          gasPriceStalenessThreshold: 0,
          networkFeeUsdCents: 0,
        },
      })
      expect(result.transactions).toHaveTransaction({
        to: feeQuoter.address,
        success: true,
      })
      // configure the feeToken
      result = await feeQuoter.sendUpdateFeeTokens(deployer.getSender(), {
        value: toNano('1'),
        add: [{ token: ZERO_ADDRESS, premiumMultiplier: 1n }],
        remove: [],
      })
      expect(result.transactions).toHaveTransaction({
        to: feeQuoter.address,
        success: true,
      })
      // TODO: call UpdatePrices so there's a price available and the timestamp isn't zero
    }
    // setup onramp
    {
      let code = await compile('OnRamp')
      let data: OnRampStorage = {
        ownable: {
          owner: deployer.address,
        },
        router: router.address,
        chainSelector: CHAINSEL_TON,
        config: {
          feeQuoter: feeQuoter.address,
          feeAggregator: deployer.address,
          allowlistAdmin: deployer.address,
        },
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
      }
      // TODO: use deployable to make deterministic?
      onRamp = blockchain.openContract(OnRamp.createFromConfig(data, code))

      let result = await onRamp.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onRamp.address,
        deploy: true,
        success: true,
      })

      // add config for EVM destination
      result = await onRamp.sendUpdateDestChainConfigs(deployer.getSender(), {
        value: toNano('1'),
        destChainConfigs: [
          {
            destChainSelector: CHAINSEL_EVM_TEST_90000001,
            router: Buffer.alloc(64),
            allowlistEnabled: false,
          },
        ],
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onRamp.address,
        deploy: false,
        success: true,
      })
    }
  })

  it('onramp', async () => {
    // Configure onRamp on router
    let result = await router.sendSetRamp(deployer.getSender(), {
      value: toNano('1'),
      queryID: 0,
      destChainSelector: CHAINSEL_EVM_TEST_90000001,
      onRamp: onRamp.address,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      deploy: true, // TRUE the first time around
      success: true,
    })

    // router.ccipSend
    result = await router.sendCcipSend(deployer.getSender(), {
      value: toNano('1'),
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST_90000001,
      receiver: Buffer.alloc(64),
      data: Cell.EMPTY,
      tokenAmounts: Cell.EMPTY,
      feeToken: ZERO_ADDRESS,
      extraArgs: Cell.EMPTY,
    })

    // we called the router
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
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
    // assert message went to feeQuoter
    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: feeQuoter.address,
      deploy: false,
      success: true,
    })

    // destChainConfig -> feeQuoter -> onRamp
    expect(result.transactions).toHaveTransaction({
      from: feeQuoter.address,
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
        sender: deployer.address,
      },
    })
  })
})
