import { Dictionary, beginCell, toNano, Cell, Address } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { assertLog } from '../../Logs'
import { LogTypes } from '../../../wrappers/ccip/Logs'
import { generateRandomContractId, LINK_TOKEN, WRAPPED_NATIVE } from '../../../src/utils'
import * as Decimals from '../../lib/pricing/Decimals'
import { ContractCoverageConfig } from '../../coverage/coverage'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'

import { contractCode } from '../../../wrappers/codeLoader'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as sendExecutor from '../../../wrappers/ccip/CCIPSendExecutor'
import { ChainFamilySelectors, ChainSelectors } from '../../utils/Selectors'

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
  ([TOverrides] extends [{ feeQuoter: SandboxContract<infer _FeeQuoter> }]
    ? {}
    : { feeQuoter: SandboxContract<fq.FeeQuoter> }) &
  ([TOverrides] extends [{ onRamp: SandboxContract<infer _OnRamp> }]
    ? {}
    : { onRamp: SandboxContract<or.OnRamp> }) &
  ([TOverrides] extends [{ offRamp: SandboxContract<infer _OffRamp> }]
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
  let merkleRootCodeRaw = await contractCode.ccip.local('MerkleRoot')

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
  const routerCode = await contractCode.ccip.local('Router')
  const data = rt.Storage.create({
    id: generateRandomContractId(),
    ownable: rt.Ownable2Step.create({
      owner: deployer.address,
      pendingOwner: null,
    }),
    wrappedNative: WRAPPED_NATIVE,
    onRamps: new Map(),
    offRamps: new Map(),
    rmnRemote: rt.RMNRemote.create({
      admin: rt.Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
      cursedSubjects: rt.CursedSubjects.create({ data: new Set() }),
      forwardUpdates: new Set(),
    }),
    tokenRegistryDeployment: rt.Router_TokenRegistryDeployment.create({
      deployableCode: await contractCode.ccip.local('Deployable'),
      tokenRegistryCode: await contractCode.ccip.local('TokenRegistry'),
    }),
  })
  const router = blockchain.openContract(
    rt.Router.fromStorage(data, { overrideContractCode: routerCode }),
  )
  const result = await router.sendDeploy(deployer.getSender(), toNano('1'))
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
  const code = await contractCode.ccip.local('FeeQuoter')
  const data = fq.Storage.create({
    id: generateRandomContractId(),
    ownable: fq.Ownable2Step.create({
      owner: deployer.address,
    }),
    allowedPriceUpdaters: new Set(),
    maxFeeJuelsPerMsg: 100000000n,
    linkToken: LINK_TOKEN,
    tokenPriceStalenessThreshold: 1000n,
    usdPerToken: new Map(),
    premiumMultiplierWeiPerEth: new Map(),
    destChainConfigs: new Map(),
  })

  const feeQuoter = blockchain.openContract(
    fq.FeeQuoter.fromStorage(data, { overrideContractCode: code }),
  )

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
    const addPriceUpdaterResult = await feeQuoter.sendFeeQuoterAddPriceUpdater(
      deployer.getSender(),
      toNano('1'),
      { priceUpdater: deployer.address },
    )
    expect(addPriceUpdaterResult.transactions).toHaveTransaction({
      to: feeQuoter.address,
      success: true,
    })

    const result = await feeQuoter.sendFeeQuoterUpdatePrices(deployer.getSender(), toNano('1'), {
      updates: fq.PriceUpdates.create({
        gasPriceUpdates: [],
        tokenPriceUpdates: [
          fq.TokenPriceUpdate.create({
            sourceToken: WRAPPED_NATIVE,
            usdPerToken: Decimals.TESTING_VALUES.tokenPrice.eth,
          }),
          fq.TokenPriceUpdate.create({
            sourceToken: LINK_TOKEN,
            usdPerToken: Decimals.TESTING_VALUES.tokenPrice.link,
          }),
        ],
      }),
      sendExcessesTo: null,
    })
    expect(result.transactions).toHaveTransaction({
      to: feeQuoter.address,
      success: true,
    })
  }

  {
    const result = await feeQuoter.sendFeeQuoterUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('1'),
      {
        updates: [
          fq.FeeQuoter_UpdateDestChainConfig.create({
            destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            destChainConfig: fq.FeeQuoterDestChainConfig.create({
              isEnabled: true,
              maxNumberOfTokensPerMsg: 1n,
              maxDataBytes: 100n,
              maxPerMsgGasLimit: 100n,
              destGasOverhead: 0n,
              destGasPerPayloadByteBase: 0n,
              destGasPerPayloadByteHigh: 0n,
              destGasPerPayloadByteThreshold: 0n,
              destDataAvailabilityOverheadGas: 0n,
              destGasPerDataAvailabilityByte: 0n,
              destDataAvailabilityMultiplierBps: 0n,
              chainFamilySelector: ChainFamilySelectors.evm,
              defaultTokenFeeUsdCents: 0n,
              defaultTokenDestGasOverhead: 0n,
              defaultTxGasLimit: 1n,
              gasMultiplierWeiPerEth: 0n,
              gasPriceStalenessThreshold: 0n,
              networkFeeUsdCents: 0n,
            }),
          }),
        ],
      },
    )
    expect(result.transactions).toHaveTransaction({
      to: feeQuoter.address,
      success: true,
    })
  }

  {
    const result = await feeQuoter.sendFeeQuoterUpdateFeeTokens(deployer.getSender(), toNano('1'), {
      add: new Map([[WRAPPED_NATIVE, fq.FeeToken.create({ premiumMultiplierWeiPerEth: 1n })]]),
      remove: [],
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
  const data = or.OnRamp_Storage.create({
    id: generateRandomContractId(),
    ownable: or.Ownable2Step.create({
      owner: deployer.address,
    }),
    chainSelector: CHAINSEL_TON,
    config: or.OnRamp_DynamicConfig.create({
      feeQuoter,
      feeAggregator: deployer.address,
      allowlistAdmin: deployer.address,
      reserve: toNano('10'),
    }),
    destChainConfigs: new Map(),
    executor: or.ExecutorDeployment.create({
      deployableCode: await contractCode.ccip.local('Deployable'),
      executorCode: await contractCode.ccip.local('CCIPSendExecutor'),
    }),
  })

  const onRamp = blockchain.openContract(or.OnRamp.fromStorage(data))

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

    const result = await onRamp.sendOnRampUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('1'),
      {
        updates: [
          or.OnRampUpdateDestChainConfig.create({
            destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            router: config.router,
            allowlistEnabled: config.allowlistEnabled,
          }),
        ],
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onRamp.address,
      deploy: false,
      success: true,
    })
    assertLog(result.transactions, onRamp.address, LogTypes.DestChainSelectorAdded, {
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    })
    assertLog(result.transactions, onRamp.address, LogTypes.DestChainConfigUpdated, {
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      destChainConfig: config,
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
  const data = of.Storage.create({
    id: generateRandomContractId(),
    ownable: of.Ownable2Step.create({
      owner: deployer.address,
      pendingOwner: null,
    }),
    chainSelector: CHAINSEL_TON,
    deployables: of.OffRamp_Deployables.create({
      deployer: await contractCode.ccip.local('Deployable'),
      merkleRootCode: await contractCode.ccip.local('MerkleRoot'),
      receiveExecutorCode: await contractCode.ccip.local('ReceiveExecutor'),
      rmnRouter: router,
    }),
    feeQuoter,
    permissionlessExecutionThresholdSeconds: 0n,
    latestPriceSequenceNumber: 0n,
    ocr3Base: of.OCR3Base.create({
      chainId: 1n,
      commit: null,
      execute: null,
    }),
    cursedSubjects: of.CursedSubjects.create({
      data: new Set(),
    }),
    sourceChainConfigs: new Map(),
  })

  const offRamp = blockchain.openContract(of.OffRamp.fromStorage(data))

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

    const result = await offRamp.sendOffRampUpdateSourceChainConfigs(
      deployer.getSender(),
      toNano('1'),
      of.OffRamp_UpdateSourceChainConfigs.create({
        configs: [
          of.SourceChainConfigUpdate.create({
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            config: of.SourceChainConfig.create({
              router: config.router,
              isEnabled: true,
              minSeqNr: 0n,
              isRMNVerificationDisabled: false,
              onRamp: CrossChainAddressCodec.FromBuffer(EVM_ADDRESS),
            }),
          }),
        ],
      }),
    )
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
  const result = await router.sendRouterApplyRampUpdates(deployer.getSender(), toNano('1'), {
    queryId: 0n,
    onRampUpdates: rt.OnRamps.create({
      destChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
      onRamp,
    }),
    offRampAdds: rt.OffRamps.create({
      sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
      offRamp,
    }),
  })
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: router.address,
    success: true,
  })

  assertLog(result.transactions, router.address, LogTypes.OnRampSet, {
    destChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
    onRamp: onRamp,
  })
}
export async function deployRouterContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  codeOverride?: Cell,
) {
  const code = codeOverride ?? (await contractCode.ccip.local('Router'))
  const data = rt.Storage.create({
    id: generateRandomContractId(),
    ownable: rt.Ownable2Step.create({
      owner: owner.address,
    }),
    wrappedNative: WRAPPED_NATIVE,
    onRamps: new Map(),
    offRamps: new Map(),
    rmnRemote: rt.RMNRemote.create({
      admin: rt.Ownable2Step.create({ owner: owner.address, pendingOwner: null }),
      cursedSubjects: rt.CursedSubjects.create({ data: new Set() }),
      forwardUpdates: new Set(),
    }),
    tokenRegistryDeployment: rt.Router_TokenRegistryDeployment.create({
      deployableCode: await contractCode.ccip.local('Deployable'),
      tokenRegistryCode: await contractCode.ccip.local('TokenRegistry'),
    }),
  })

  // TODO: use deployable to make deterministic?
  const contract = blockchain.openContract(
    rt.Router.fromStorage(data, { overrideContractCode: code }),
  )
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('1'))
  return contract
}

// unit192 where 64 first bits are chain selector
export function genExecID(opts: {
  sourceChainSelector: bigint // 64 bits
  messageID: bigint // 128 bits
}): bigint {
  return (opts.sourceChainSelector << (192n - 64n)) | (opts.messageID >> 64n)
}

export const CHAINSEL_TON = 13879075125137744094n
// TODO migrate to Slice
export const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes

export async function contractsCoverageConfig(): Promise<ContractCoverageConfig[]> {
  return [
    {
      code: await contractCode.ccip.local('Router'),
      name: 'router',
    },
    {
      code: await contractCode.ccip.local('FeeQuoter'),
      name: 'feequoter',
    },
    {
      code: await contractCode.ccip.local('OnRamp'),
      name: 'onramp',
    },
    {
      code: await sendExecutor.ContractClient.code(),
      name: 'send_executor',
    },
  ]
}
