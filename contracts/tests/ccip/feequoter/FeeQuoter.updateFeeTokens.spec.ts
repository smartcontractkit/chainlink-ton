import '@ton/test-utils'

import { toNano } from '@ton/core'

import { FeeQuoterSetup } from './FeeQuoterSetup'
import { Blockchain } from '@ton/sandbox'
import * as coverage from '../../coverage/coverage'

describe('FeeQuoter UpdateFeeTokens', () => {
  let setup: FeeQuoterSetup
  let blockchain: Blockchain

  beforeAll(async () => {
    blockchain = await Blockchain.create()
  })

  beforeEach(async () => {
    setup = new FeeQuoterSetup(blockchain)
    setup.code = await FeeQuoterSetup.compileContracts()
    await setup.setupAll('updateFeeTokens', blockchain)
  })

  it('should add new fee tokens', async () => {
    const newToken = FeeQuoterSetup.CUSTOM_TOKEN.token
    const premiumMultiplier = BigInt(3e17)

    const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        add: new Map([[newToken, { premiumMultiplierWeiPerEth: premiumMultiplier }]]),
        remove: [],
      },
    })

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the token was added
    const multiplier = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(newToken)
    expect(multiplier).toEqual(premiumMultiplier)
  })

  it('should remove fee tokens', async () => {
    const tokenToRemove = FeeQuoterSetup.SOURCE_FEE_TOKEN.token

    // First verify token exists
    const multiplierBefore = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(tokenToRemove)
    expect(multiplierBefore).toBeGreaterThan(0n)

    // Remove the token
    const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        add: new Map(),
        remove: [tokenToRemove],
      },
    })

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the token was removed - should throw error when trying to get it
    await expect(
      setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(tokenToRemove),
    ).rejects.toThrow()
  })

  it('should add multiple fee tokens at once', async () => {
    const token1 = FeeQuoterSetup.CUSTOM_TOKEN.token
    const token2 = FeeQuoterSetup.CUSTOM_TOKEN_2.token
    const premiumMultiplier1 = BigInt(3e17)
    const premiumMultiplier2 = BigInt(4e17)

    const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        add: new Map([
          [token1, { premiumMultiplierWeiPerEth: premiumMultiplier1 }],
          [token2, { premiumMultiplierWeiPerEth: premiumMultiplier2 }],
        ]),
        remove: [],
      },
    })

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify both tokens were added
    const multiplier1 = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(token1)
    expect(multiplier1).toEqual(premiumMultiplier1)

    const multiplier2 = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(token2)
    expect(multiplier2).toEqual(premiumMultiplier2)
  })

  it('should remove multiple fee tokens at once', async () => {
    const token1 = FeeQuoterSetup.SOURCE_FEE_TOKEN.token
    const token2 = FeeQuoterSetup.NATIVE_TON.token

    // Remove both tokens
    const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        add: new Map(),
        remove: [token1, token2],
      },
    })

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify both tokens were removed
    await expect(setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(token1)).rejects.toThrow()
    await expect(setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(token2)).rejects.toThrow()
  })

  it('should add and remove fee tokens in same transaction', async () => {
    const tokenToRemove = FeeQuoterSetup.SOURCE_FEE_TOKEN.token
    const tokenToAdd = FeeQuoterSetup.CUSTOM_TOKEN.token
    const premiumMultiplier = BigInt(3e17)

    const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        add: new Map([[tokenToAdd, { premiumMultiplierWeiPerEth: premiumMultiplier }]]),
        remove: [tokenToRemove],
      },
    })

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify token was added
    const multiplier = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(tokenToAdd)
    expect(multiplier).toEqual(premiumMultiplier)

    // Verify token was removed
    await expect(
      setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(tokenToRemove),
    ).rejects.toThrow()
  })

  it('should update existing fee token premium multiplier', async () => {
    const token = FeeQuoterSetup.SOURCE_FEE_TOKEN.token
    const newPremiumMultiplier = BigInt(8e17)

    const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(setup.acc.owner.getSender(), {
      value: toNano('1'),
      msg: {
        add: new Map([[token, { premiumMultiplierWeiPerEth: newPremiumMultiplier }]]),
        remove: [],
      },
    })

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: true,
    })

    // Verify the multiplier was updated
    const multiplier = await setup.bind.feeQuoter.getPremiumMultiplierWeiPerEth(token)
    expect(multiplier).toEqual(newPremiumMultiplier)
  })

  it('should only allow owner to update fee tokens', async () => {
    const newToken = FeeQuoterSetup.CUSTOM_TOKEN.token
    const premiumMultiplier = BigInt(3e17)

    // Try with non-owner
    const result = await setup.bind.feeQuoter.sendUpdateFeeTokens(
      setup.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: {
          add: new Map([[newToken, { premiumMultiplierWeiPerEth: premiumMultiplier }]]),
          remove: [],
        },
      },
    )

    expect(result.transactions).toHaveTransaction({
      to: setup.bind.feeQuoter.address,
      success: false,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'feeQuoter_update_fee_tokens_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
      ])
    }
  })
})
