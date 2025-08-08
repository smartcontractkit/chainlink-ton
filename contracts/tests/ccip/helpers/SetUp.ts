import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { ZERO_ADDRESS } from '../../../utils/Utils'
import {
  createTimestampedPriceValue,
  FeeQuoter,
  FeeQuoterStorage,
  TimestampedPrice,
} from '../../../wrappers/ccip/FeeQuoter'
import { compile } from '@ton/blueprint'
import { Dictionary, toNano } from '@ton/core'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n

export const setupTestFeeQuoter = async (
  deployer: SandboxContract<TreasuryContract>,
  blockchain: Blockchain,
) => {
  let code = await compile('FeeQuoter')

  let data: FeeQuoterStorage = {
    ownable: {
      owner: deployer.address,
      pendingOwner: null,
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
  let feeQuoter = blockchain.openContract(FeeQuoter.createFromConfig(data, code))

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

  return feeQuoter
  // TODO: call UpdatePrices so there's a price available and the timestamp isn't zero
}
