import { compile } from '@ton/blueprint'
import { Dictionary, beginCell, toNano, Cell, Address } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { assertLog } from '../../Logs'
import { LogTypes } from '../../../wrappers/ccip/Logs'
import { generateRandomContractId, LINK_TOKEN, WRAPPED_NATIVE } from '../../../src/utils'
import * as Decimals from '../../lib/pricing/Decimals'
import { ContractCoverageConfig } from '../../coverage/coverage'

import * as fq from '../../../wrappers/ccip/FeeQuoter'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as of from '../../../wrappers/ccip/OffRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as sendExecutor from '../../../wrappers/ccip/CCIPSendExecutor'
import { loadContractCode } from '../../../wrappers/codeLoader'

type RouterSetupOptionsCommon = {
  deployer?: SandboxContract<TreasuryContract>
  sender?: SandboxContract<TreasuryContract>
  receiver?: SandboxContract<TreasuryContract>
  router?: SandboxContract<rt.Router>
  skipRouterOnRampConfig?: boolean
}
type RouterSetupOverrides = Partial<{
  feeQuoter: SandboxContract<fq.FeeQuoter> | SandboxContract<TreasuryContract>
  onRamp: SandboxContract<or.OnRamp> | SandboxContract<TreasuryContract>
  offRamp: SandboxContract<of.OffRamp> | SandboxContract<TreasuryContract>
}>

type RouterSetupOptions<TOverrides extends RouterSetupOverrides> = RouterSetupOptionsCommon &
  TOverrides

type RouterSetupResultBase = {
  deployer: SandboxContract<TreasuryContract>
  sender: SandboxContract<TreasuryContract>
  receiver: SandboxContract<TreasuryContract>
  router: SandboxContract<rt.Router>
}

type RouterSetupResultFor<TOverrides extends RouterSetupOverrides> = RouterSetupResultBase &
  ([TOverrides] extends [{ feeQuoter: SandboxContract<any> }]
    ? {}
    : { feeQuoter: SandboxContract<fq.FeeQuoter> }) &
  ([TOverrides] extends [{ onRamp: SandboxContract<any> }]
    ? {}
    : { onRamp: SandboxContract<or.OnRamp> }) &
  ([TOverrides] extends [{ offRamp: SandboxContract<any> }]
    ? {}
    : { offRamp: SandboxContract<of.OffRamp> })

export async function setup<TOverrides extends RouterSetupOverrides = {}>(
  blockchain: Blockchain,
  options?: RouterSetupOptions<TOverrides>,
): Promise<RouterSetupResultFor<TOverrides>> {
  const opts = (options ?? {}) as RouterSetupOptions<TOverrides>

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

  const deployer = opts.deployer ?? (await blockchain.treasury('deployer'))
  const sender = opts.sender ?? (await blockchain.treasury('sender'))
  const receiver = opts.receiver ?? (await blockchain.treasury('receiver'))
  let merkleRootCodeRaw = await compile('MerkleRoot')

  // Populate the emulator library code
  // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
  const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
  const libs = beginCell().storeDictDirect(_libs).endCell()
  blockchain.libs = libs
  const router = opts.router ?? (await deployRouterInstance(blockchain, deployer))
  const feeQuoter = opts.feeQuoter ?? (await deployFeeQuoterInstance(blockchain, deployer))
  const onRamp =
    opts.onRamp ??
    (await deployOnRampInstance(blockchain, deployer, router.address, feeQuoter.address))

  const offRamp =
    opts.offRamp ??
    (await deployOffRampInstance(blockchain, deployer, router.address, feeQuoter.address))

  if (!opts.skipRouterOnRampConfig) {
    await configureRouterWithOnRamp(router, deployer, onRamp.address, offRamp.address)
  }

  const result: RouterSetupResultBase & {
    feeQuoter?: SandboxContract<fq.FeeQuoter>
    onRamp?: SandboxContract<or.OnRamp>
    offRamp?: SandboxContract<of.OffRamp>
  } = {
    deployer,
    sender,
    receiver,
    router,
  }

  if (!opts.feeQuoter) {
    result.feeQuoter = feeQuoter as SandboxContract<fq.FeeQuoter>
  }

  if (!opts.onRamp) {
    result.onRamp = onRamp as SandboxContract<or.OnRamp>
  }

  if (!opts.offRamp) {
    result.offRamp = offRamp as SandboxContract<of.OffRamp>
  }

  return result as RouterSetupResultFor<TOverrides>
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
    wrappedNative: WRAPPED_NATIVE,
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
    linkToken: LINK_TOKEN,
    tokenPriceStalenessThreshold: 1000,
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
            { token: WRAPPED_NATIVE, price: Decimals.TESTING_VALUES.tokenPrice.eth },
            { token: LINK_TOKEN, price: Decimals.TESTING_VALUES.tokenPrice.link },
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
        add: new Map([[WRAPPED_NATIVE, { premiumMultiplierWeiPerEth: 1n }]]),
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
  router: Address,
  feeQuoter: Address,
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
      feeQuoter,
      feeAggregator: deployer.address,
      allowlistAdmin: deployer.address,
      reserve: toNano('10'),
    },
    destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
    executor: {
      deployableCode: await loadContractCode('Deployable'),
      executorCode: await compile('CCIPSendExecutor'),
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
      router,
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

async function deployOffRampInstance(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
  router: Address,
  feeQuoter: Address,
) {
  const code = await compile('OffRamp')
  const data: of.OffRampStorage = {
    id: generateRandomContractId(),
    ownable: {
      owner: deployer.address,
      pendingOwner: null,
    },
    chainSelector: CHAINSEL_TON,
    deployables: {
      deployerCode: await loadContractCode('Deployable'),
      merkleRootCode: await compile('MerkleRoot'),
      receiveExecutorCode: await compile('ReceiveExecutor'),
    },
    feeQuoter,
    router,
    permissionlessExecutionThresholdSeconds: 0,
    latestPriceSequenceNumber: 0n,
  }

  const offRamp = blockchain.openContract(of.OffRamp.createFromConfig(data, code))

  {
    const result = await offRamp.sendDeploy(deployer.getSender(), toNano('1'))
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      deploy: true,
      success: true,
    })
  }

  {
    const config = {
      router,
      sequenceNumber: 0n,
      allowlistEnabled: false,
    }

    const result = await offRamp.sendUpdateSourceChainConfigs(deployer.getSender(), {
      value: toNano('1'),
      configs: [
        {
          sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
          config: {
            router: config.router,
            isEnabled: true,
            minSeqNr: 0n,
            isRMNVerificationDisabled: false,
            onRamp: EVM_ADDRESS,
          },
        },
      ],
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      deploy: false,
      success: true,
    })
  }

  return offRamp
}

async function configureRouterWithOnRamp(
  router: SandboxContract<rt.Router>,
  deployer: SandboxContract<TreasuryContract>,
  onRamp: Address,
  offRamp: Address,
) {
  const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
    value: toNano('1'),
    data: {
      queryID: BigInt(0),
      onRamps: {
        destChainSelectors: [CHAINSEL_EVM_TEST_90000001],
        onRamp: onRamp,
      },
      offRampAdds: {
        sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001],
        offRamp: offRamp,
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
    onRamp: onRamp,
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
    wrappedNative: WRAPPED_NATIVE,
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
export const CHAIN_FAMILY_SELECTOR_SVM = 0x1e10bdc4
export const CHAIN_FAMILY_SELECTOR_APTOS = 0xac77ffec
export const CHAIN_FAMILY_SELECTOR_SUI = 0xc4e05953

// unit192 where 64 first bits are chain selector
export function genExecID(opts: {
  sourceChainSelector: bigint // 64 bits
  messageID: bigint // 128 bits
}): bigint {
  return (opts.sourceChainSelector << (192n - 64n)) | (opts.messageID >> 64n)
}

export const CHAINSEL_TON = 13879075125137744094n
export const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes

export async function contractsCoverageConfig(): Promise<ContractCoverageConfig[]> {
  return [
    {
      code: await rt.Router.code(),
      name: 'router',
    },
    {
      code: await fq.FeeQuoter.code(),
      name: 'feequoter',
    },
    {
      code: await or.OnRamp.code(),
      name: 'onramp',
    },
    {
      code: await sendExecutor.ContractClient.code(),
      name: 'send_executor',
    },
  ]
}
