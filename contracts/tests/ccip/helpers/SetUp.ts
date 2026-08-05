import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'

import { ChainSelectors } from '../../utils/Selectors'
import { contractCode } from '../../../wrappers/codeLoader'
import { generateRandomContractId, LINK_TOKEN, WRAPPED_NATIVE } from '../../../src/utils'
import {
  FeeQuoter,
  FeeQuoterDestChainConfig,
  FeeQuoter_UpdateDestChainConfig,
  FeeToken,
  Ownable2Step,
  Storage,
  TimestampedPrice,
} from '../../../wrappers/gen/ccip/FeeQuoter'

export const setupTestFeeQuoter = async (
  deployer: SandboxContract<TreasuryContract>,
  blockchain: Blockchain,
  code?: Cell,
): Promise<SandboxContract<FeeQuoter>> => {
  code ??= await contractCode.ccip.local('FeeQuoter')

  const data = Storage.create({
    id: generateRandomContractId(),
    ownable: Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
    allowedPriceUpdaters: new Set(),
    maxFeeJuelsPerMsg: 1000000n,
    linkToken: LINK_TOKEN,
    tokenPriceStalenessThreshold: 1000n,
    usdPerToken: new Map([
      [
        WRAPPED_NATIVE,
        TimestampedPrice.create({ value: 123n, timestamp: BigInt(Math.floor(Date.now() / 1000)) }),
      ],
      [
        LINK_TOKEN,
        TimestampedPrice.create({ value: 123n, timestamp: BigInt(Math.floor(Date.now() / 1000)) }),
      ],
    ]),
    premiumMultiplierWeiPerEth: new Map(),
    destChainConfigs: new Map(),
  })
  const feeQuoter = blockchain.openContract(
    FeeQuoter.fromStorage(data, { overrideContractCode: code }),
  )

  let result = await feeQuoter.sendDeploy(deployer.getSender(), toNano('0.05'))
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: feeQuoter.address,
    deploy: true,
    success: true,
  })

  result = await feeQuoter.sendFeeQuoterUpdateDestChainConfigs(deployer.getSender(), toNano('1'), {
    updates: [
      FeeQuoter_UpdateDestChainConfig.create({
        destChainSelector: BigInt(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001),
        destChainConfig: FeeQuoterDestChainConfig.create({
          isEnabled: true,
          maxNumberOfTokensPerMsg: 0n,
          maxDataBytes: 100n,
          maxPerMsgGasLimit: 100n,
          destGasOverhead: 0n,
          destGasPerPayloadByteBase: 0n,
          destGasPerPayloadByteHigh: 0n,
          destGasPerPayloadByteThreshold: 0n,
          destDataAvailabilityOverheadGas: 0n,
          destGasPerDataAvailabilityByte: 0n,
          destDataAvailabilityMultiplierBps: 0n,
          chainFamilySelector: 0n,
          defaultTokenFeeUsdCents: 0n,
          defaultTokenDestGasOverhead: 0n,
          defaultTxGasLimit: 1n,
          gasMultiplierWeiPerEth: 0n,
          gasPriceStalenessThreshold: 0n,
          networkFeeUsdCents: 0n,
        }),
      }),
    ],
  })
  expect(result.transactions).toHaveTransaction({ to: feeQuoter.address, success: true })

  result = await feeQuoter.sendFeeQuoterUpdateFeeTokens(deployer.getSender(), toNano('1'), {
    add: new Map([[WRAPPED_NATIVE, FeeToken.create({ premiumMultiplierWeiPerEth: 1n })]]),
    remove: [],
  })
  expect(result.transactions).toHaveTransaction({ to: feeQuoter.address, success: true })

  return feeQuoter
}
