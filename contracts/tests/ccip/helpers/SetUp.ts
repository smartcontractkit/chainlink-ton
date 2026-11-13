import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, contractAddress, toNano } from '@ton/core'

import { ChainSelectors } from '../../utils/Selectors'
import { contractCode } from '../../../wrappers/codeLoader'
import { generateRandomContractId, LINK_TOKEN, NATIVE_GRAM } from '../../../src/utils'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'

// The 1.6.x FeeQuoter stored the same fields without the storage layout prefix.
// Strip it so the legacy code cell parses the fixture it actually shipped with.
const legacyStorageCell = (storage: fq.FeeQuoter_Storage_V1_7_0): Cell => {
  const s = fq.FeeQuoter_Storage_V1_7_0.toCell(storage).beginParse()
  s.skip(32)
  return beginCell().storeSlice(s).endCell()
}

export const setupTestFeeQuoter = async (
  deployer: SandboxContract<TreasuryContract>,
  blockchain: Blockchain,
  code?: Cell,
): Promise<SandboxContract<fq.FeeQuoter>> => {
  const isLegacy = code !== undefined
  code ??= await contractCode.ccip.local('FeeQuoter')

  const storage = fq.FeeQuoter_Storage_V1_7_0.create({
    id: generateRandomContractId(),
    ownable: fq.Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
    allowedPriceUpdaters: new Set(),
    maxFeeJuelsPerMsg: 1000000n,
    linkToken: LINK_TOKEN,
    tokenPriceStalenessThreshold: 1000n,
    usdPerToken: new Map([
      [
        NATIVE_GRAM,
        fq.TimestampedPrice.create({
          value: 123n,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }),
      ],
      [
        LINK_TOKEN,
        fq.TimestampedPrice.create({
          value: 123n,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }),
      ],
    ]),
    premiumMultiplierWeiPerEth: new Map(),
    destChainConfigs: new Map(),
  })

  const init = {
    code,
    data: isLegacy ? legacyStorageCell(storage) : fq.FeeQuoter_Storage_V1_7_0.toCell(storage),
  }
  const feeQuoter = blockchain.openContract(fq.FeeQuoter.fromAddress(contractAddress(0, init)))

  let result = await deployer.send({
    to: feeQuoter.address,
    value: toNano('0.05'),
    init,
    body: beginCell().endCell(),
  })
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: feeQuoter.address,
    deploy: true,
    success: true,
  })

  result = await feeQuoter.sendFeeQuoterUpdateDestChainConfigs(deployer.getSender(), toNano('1'), {
    updates: [
      fq.FeeQuoter_UpdateDestChainConfig.create({
        destChainSelector: BigInt(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001),
        destChainConfig: fq.FeeQuoterDestChainConfig.create({
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
    add: new Map([[NATIVE_GRAM, fq.FeeToken.create({ premiumMultiplierWeiPerEth: 1n })]]),
    remove: [],
  })
  expect(result.transactions).toHaveTransaction({ to: feeQuoter.address, success: true })

  result = await feeQuoter.sendFeeQuoterUpdatePrices(deployer.getSender(), toNano('1'), {
    updates: fq.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [
        fq.GasPriceUpdate.create({
          destChainSelector: BigInt(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001),
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        }),
      ],
    }),
    sendExcessesTo: deployer.address,
  })
  expect(result.transactions).toHaveTransaction({ to: feeQuoter.address, success: true })

  return feeQuoter
}
