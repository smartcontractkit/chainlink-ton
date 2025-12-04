import { compile } from '@ton/blueprint'
import { Dictionary, beginCell, toNano, Cell, Address } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { generateRandomContractId } from '../../../src/utils'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import { LogTypes } from '../../../wrappers/ccip/Logs'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as Decimals from '../../lib/pricing/Decimals'
import { assertLog } from '../../Logs'

export interface RouterSetupOptions {
  deployer?: SandboxContract<TreasuryContract>
  sender?: SandboxContract<TreasuryContract>
  router?: SandboxContract<rt.Router>
  feeQuoter?: SandboxContract<fq.FeeQuoter>
  onRamp?: SandboxContract<or.OnRamp>
  skipRouterOnRampConfig?: boolean
}

export async function setup(blockchain: Blockchain, options: RouterSetupOptions = {}) {
  blockchain.verbosity = {
    print: true,
    blockchainLogs: false,
    vmLogs: 'none',
    debugLogs: true,
  }
  if (process.env['COVERAGE'] === 'true') {
    blockchain.enableCoverage()
    blockchain.verbosity.vmLogs = 'vm_logs_verbose'
  }

  const deployer = options.deployer ?? (await blockchain.treasury('deployer'))
  const sender = options.sender ?? (await blockchain.treasury('sender'))
  let merkleRootCodeRaw = await compile('MerkleRoot')

  // Populate the emulator library code
  // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
  const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
  const libs = beginCell().storeDictDirect(_libs).endCell()
  blockchain.libs = libs
  const router = options.router ?? (await deployRouterInstance(blockchain, deployer))
  const feeQuoter = options.feeQuoter ?? (await deployFeeQuoterInstance(blockchain, deployer))
  const onRamp =
    options.onRamp ?? (await deployOnRampInstance(blockchain, deployer, router, feeQuoter))

  if (!options.skipRouterOnRampConfig) {
    await configureRouterWithOnRamp(router, deployer, onRamp)
  }

  return { deployer, sender, router, feeQuoter, onRamp }
}

async function deployRouterInstance(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
) {
  const routerCode = await compile('Router')
  const data: rt.Storage = {
    id: generateRandomContractId(),
    ownable: {
      owner: deployer.address,
      pendingOwner: null,
    },
    wrappedNative: TEST_TOKEN_ADDR,
    onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
    offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
  }
  const router = blockchain.openContract(rt.Router.createFromConfig(data, routerCode))
  const result = await router.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: router.address,
    deploy: true,
    success: true,
  })
  return router
}

async function deployFeeQuoterInstance(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
) {
  const code = await compile('FeeQuoter')
  const data: fq.FeeQuoterStorage = {
    id: generateRandomContractId(),
    ownable: {
      owner: deployer.address,
      pendingOwner: null,
    },
    allowedPriceUpdaters: Dictionary.empty(Dictionary.Keys.Address()),
    maxFeeJuelsPerMsg: 100000000n,
    linkToken: TEST_LINK_TOKEN_ADDR,
    tokenPriceStalenessThreshold: 1000n,
    usdPerToken: Dictionary.empty(Dictionary.Keys.Address(), fq.createTimestampedPriceValue()),
    premiumMultiplierWeiPerEth: Dictionary.empty(
      Dictionary.Keys.Address(),
      Dictionary.Values.BigUint(64),
    ),
    destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64)),
  }

  const feeQuoter = blockchain.openContract(fq.FeeQuoter.createFromConfig(data, code))

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
          tokenPricesUpdates: [
            { token: TEST_TOKEN_ADDR, price: Decimals.TESTING_VALUES.tokenPrice.eth },
            { token: TEST_LINK_TOKEN_ADDR, price: Decimals.TESTING_VALUES.tokenPrice.link },
          ],
        },
        sendExcessesTo: null,
      },
    })
    expect(result.transactions).toHaveTransaction({
      to: feeQuoter.address,
      success: true,
    })
  }

  {
    const result = await feeQuoter.sendUpdateDestChainConfigs(deployer.getSender(), {
      value: toNano('1'),
      updates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
          config: {
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

  return feeQuoter
}

async function deployOnRampInstance(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
  router: SandboxContract<rt.Router>,
  feeQuoter: SandboxContract<fq.FeeQuoter>,
) {
  const code = await compile('OnRamp')
  const data: or.OnRampStorage = {
    id: generateRandomContractId(),
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

  const onRamp = blockchain.openContract(or.OnRamp.createFromConfig(data, code))

  {
    const result = await onRamp.sendDeploy(deployer.getSender(), toNano('1'))
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onRamp.address,
      deploy: true,
      success: true,
    })
  }

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

  return onRamp
}

async function configureRouterWithOnRamp(
  router: SandboxContract<rt.Router>,
  deployer: SandboxContract<TreasuryContract>,
  onRamp: SandboxContract<or.OnRamp>,
) {
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
export async function deployRouterContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
) {
  const code = await rt.Router.code()
  let data: rt.Storage = {
    id: generateRandomContractId(),
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
export const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
export const CHAINSEL_EVM_TEST_90000002 = 5548718428018410741n
export const CHAIN_FAMILY_SELECTOR_EVM = 0x2812d52c
const CHAIN_FAMILY_SELECTOR_SVM = 0x1e10bdc4
const CHAIN_FAMILY_SELECTOR_APTOS = 0xac77ffec
const CHAIN_FAMILY_SELECTOR_SUI = 0xc4e05953

export const CHAINSEL_TON = 13879075125137744094n
export const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000001',
)
export const TEST_LINK_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000002',
)
export const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes
