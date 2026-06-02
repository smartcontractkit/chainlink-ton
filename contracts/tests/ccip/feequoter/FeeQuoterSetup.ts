import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano, beginCell, Dictionary, Address } from '@ton/core'

import { generateRandomContractId, WRAPPED_NATIVE } from '../../../src/utils'

import { contractCode } from '../../../wrappers/codeLoader'
import * as feeQuoter from '../../../wrappers/ccip/FeeQuoter'
import * as counter from '../../../wrappers/examples/Counter'
import * as decimals from '../../lib/pricing/Decimals'
import * as rt from '../../../wrappers/ccip/Router'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import { verifyBodyMessage } from '../../utils/verifyMessageBody'
import {
  CHAIN_FAMILY_SELECTOR_SVM,
  CHAIN_FAMILY_SELECTOR_SUI,
  CHAIN_FAMILY_SELECTOR_APTOS,
} from '../../gas-report/constants'

export type TestCode = {
  feeQuoter: Cell
  counter: Cell
}

export type TestAccounts = {
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  priceUpdaterOne: SandboxContract<TreasuryContract>
  externalCaller: SandboxContract<TreasuryContract>
}

export type TestContracts = {
  feeQuoter: SandboxContract<feeQuoter.FeeQuoter>
  counter: SandboxContract<counter.ContractClient>
}

export type Token = {
  token: Address
  price: bigint
}

export class FeeQuoterSetup {
  // Constants translated from Solidity - simplified for TON
  static readonly USD_PER_GAS = 1000000n // 0.001 gwei in wei
  static readonly USD_PER_DATA_AVAILABILITY_GAS = 1000000000n // 1 gwei in wei

  // Ethereum address
  static readonly DEST_ADDRESS = Buffer.from(
    '0000000000000000000000001234567890123456789012345678901234567890',
    'hex',
  ) // 32 bytes

  static readonly MAX_DATA_SIZE = 300
  static readonly MAX_TOKENS_LENGTH = 0 // We don't support token transfers in TON yet
  static readonly MAX_GAS_LIMIT = 4000000

  // OnRamp constants
  static readonly MAX_MSG_FEES_JUELS = BigInt(1_000e18) // 1_000e18
  static readonly DEST_GAS_OVERHEAD = 300000
  static readonly DEST_GAS_PER_PAYLOAD_BYTE_BASE = 16
  static readonly DEST_GAS_PER_PAYLOAD_BYTE_HIGH = 40
  static readonly DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD = 100

  static readonly DEFAULT_TOKEN_FEE_USD_CENTS = 50
  static readonly DEFAULT_TOKEN_BYTES_OVERHEAD = 32
  static readonly DEFAULT_TOKEN_DEST_GAS_OVERHEAD = 90_000

  // Data availability constants
  static readonly DEST_GAS_PER_DATA_AVAILABILITY_BYTE = 16
  static readonly DEST_DATA_AVAILABILITY_OVERHEAD_GAS =
    188 +
    (32 * 31 + 4) * this.DEST_GAS_PER_DATA_AVAILABILITY_BYTE +
    (32 * 34 + 4) * this.DEST_GAS_PER_DATA_AVAILABILITY_BYTE
  static readonly DEST_GAS_DATA_AVAILABILITY_MULTIPLIER_BPS = 6840

  // Chain selectors
  static readonly CHAIN_FAMILY_SELECTOR_EVM = 0x2812d52c
  static readonly CHAIN_FAMILY_SELECTOR_SVM = 0x1e10bdc4
  static readonly CHAIN_FAMILY_SELECTOR_APTOS = 0xac77ffec
  static readonly CHAIN_FAMILY_SELECTOR_SUI = 0xc4e05953

  static readonly DEST_CHAIN_SELECTOR_EVM = 909606746561742123n // EVM test chain (same as CHAINSEL_EVM_TEST_90000001)
  static readonly DEST_CHAIN_SELECTOR_SVM = 16423721717087811551n // SVM test chain
  static readonly DEST_CHAIN_SELECTOR_APTOS = 77777n // Aptos test chain
  static readonly DEST_CHAIN_SELECTOR_SUI = 9762610643973837292n // SUI test chain
  static readonly SOURCE_CHAIN_SELECTOR = 13879075125137744094n // TON test chain

  // Packed gas price (L1 gas price left-shifted + L2 gas price)
  static readonly PACKED_USD_PER_GAS =
    (FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS << 112n) + FeeQuoterSetup.USD_PER_GAS

  static readonly MESSAGE_RECEIVER = beginCell()
    .storeBuffer(Buffer.from('MESSAGE_RECEIVER', 'utf8'))
    .endCell()

  static readonly TWELVE_HOURS = 12 * 60 * 60 // 12 hours in seconds
  static readonly GAS_LIMIT = 200000

  // Native TON
  static readonly NATIVE_TON: Token = {
    token: WRAPPED_NATIVE,
    price: decimals.TESTING_VALUES.tokenPrice.ton,
  }
  // Generate random address from "sLINK"
  static readonly SOURCE_LINK: Token = {
    token: Address.parse(`0:${Buffer.from('sLINK').toString('hex').padStart(64, '0')}`),
    price: decimals.TESTING_VALUES.tokenPrice.link,
  }
  static readonly SOURCE_FEE_TOKEN = FeeQuoterSetup.SOURCE_LINK

  static readonly SOURCE_TOKENS: Token[] = [FeeQuoterSetup.SOURCE_LINK, FeeQuoterSetup.NATIVE_TON]

  static readonly DEST_LINK: Token = {
    token: Address.parse(`0:${Buffer.from('dLINK').toString('hex').padStart(64, '0')}`),
    price: decimals.TESTING_VALUES.tokenPrice.link,
  }
  static readonly DEST_TOKENS: Token[] = [FeeQuoterSetup.DEST_LINK, FeeQuoterSetup.NATIVE_TON]

  //
  static readonly SOURCE_FEE_TOKENS: Token[] = [
    ...FeeQuoterSetup.SOURCE_TOKENS,
    // TODO: add wrapped native when it is implemented
  ]

  static readonly DEST_FEE_TOKENS: Token[] = [
    ...FeeQuoterSetup.DEST_TOKENS,
    // TODO: add wrapped native when it is implemented
  ]

  static readonly CUSTOM_TOKEN: Token = {
    token: Address.parse(`0:${Buffer.from('CUSTOM').toString('hex').padStart(64, '0')}`),
    price: decimals.usdPriceToTokenPrice(0.1, 18),
  }
  static readonly CUSTOM_TOKEN_2: Token = {
    token: Address.parse(`0:${Buffer.from('CUSTOM_2').toString('hex').padStart(64, '0')}`),
    price: decimals.usdPriceToTokenPrice(0.1, 18),
  }

  blockchain: Blockchain
  code: TestCode
  acc: TestAccounts
  bind: TestContracts

  static readonly destChainConfig: feeQuoter.DestChainConfig = {
    // minimal valid config for EVM destination
    isEnabled: true,
    maxNumberOfTokensPerMsg: FeeQuoterSetup.MAX_TOKENS_LENGTH,
    maxDataBytes: FeeQuoterSetup.MAX_DATA_SIZE,
    maxPerMsgGasLimit: FeeQuoterSetup.MAX_GAS_LIMIT,
    destGasOverhead: FeeQuoterSetup.DEST_GAS_OVERHEAD,
    destGasPerPayloadByteBase: FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_BASE,
    destGasPerPayloadByteHigh: FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_HIGH,
    destGasPerPayloadByteThreshold: FeeQuoterSetup.DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD,
    destDataAvailabilityOverheadGas: FeeQuoterSetup.DEST_DATA_AVAILABILITY_OVERHEAD_GAS,
    destGasPerDataAvailabilityByte: FeeQuoterSetup.DEST_GAS_PER_DATA_AVAILABILITY_BYTE,
    destDataAvailabilityMultiplierBps: FeeQuoterSetup.DEST_GAS_DATA_AVAILABILITY_MULTIPLIER_BPS,
    chainFamilySelector: FeeQuoterSetup.CHAIN_FAMILY_SELECTOR_EVM,
    defaultTokenFeeUsdCents: FeeQuoterSetup.DEFAULT_TOKEN_FEE_USD_CENTS,
    defaultTokenDestGasOverhead: FeeQuoterSetup.DEFAULT_TOKEN_DEST_GAS_OVERHEAD,
    defaultTxGasLimit: FeeQuoterSetup.GAS_LIMIT,
    gasMultiplierWeiPerEth: BigInt(5e17),
    gasPriceStalenessThreshold: FeeQuoterSetup.TWELVE_HOURS,
    networkFeeUsdCents: 100,
  }

  constructor(blockchain: Blockchain) {
    this.blockchain = blockchain
    this.code = null as any
    this.acc = null as any
    this.bind = null as any
  }

  static async compileContracts(): Promise<TestCode> {
    return {
      feeQuoter: await feeQuoter.FeeQuoter.code(),
      counter: await contractCode.ccip.local('examples.Counter'),
    }
  }

  /**
   * Initialize the blockchain and setup accounts
   */
  async initializeBlockchain(blockchain: Blockchain): Promise<void> {
    this.blockchain = blockchain
    this.blockchain.now = 1
    this.blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    if (process.env['COVERAGE'] === 'true') {
      this.blockchain.enableCoverage()
      this.blockchain.verbosity.print = false
      this.blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }

    // Set up accounts
    this.acc = {
      deployer: await this.blockchain.treasury('deployer'),
      owner: await this.blockchain.treasury('owner'),
      priceUpdaterOne: await this.blockchain.treasury('priceUpdaterOne'),
      externalCaller: await this.blockchain.treasury('externalCaller'),
    }

    this.bind = {
      feeQuoter: null as any,
      counter: null as any,
    }
  }

  /**
   * Setup the FeeQuoter contract with minimal configuration (following setupTestFeeQuoter pattern)
   */
  async setupFeeQuoterContract(): Promise<void> {
    const data: feeQuoter.FeeQuoterStorage = {
      id: generateRandomContractId(),
      ownable: {
        owner: this.acc.owner.address,
        pendingOwner: null,
      },
      allowedPriceUpdaters: Dictionary.empty(Dictionary.Keys.Address()),
      maxFeeJuelsPerMsg: FeeQuoterSetup.MAX_MSG_FEES_JUELS,
      linkToken: FeeQuoterSetup.SOURCE_LINK.token,
      tokenPriceStalenessThreshold: FeeQuoterSetup.TWELVE_HOURS,
      usdPerToken: Dictionary.empty(
        Dictionary.Keys.Address(),
        feeQuoter.createTimestampedPriceValue(),
      ),
      premiumMultiplierWeiPerEth: Dictionary.empty(
        Dictionary.Keys.Address(),
        Dictionary.Values.BigUint(64),
      ),
      destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64)),
    }

    // Pre-setup token prices for testing (following Solidity setup pattern)
    const currentTime = 1n
    for (const token of [
      ...FeeQuoterSetup.SOURCE_FEE_TOKENS,
      FeeQuoterSetup.CUSTOM_TOKEN,
      FeeQuoterSetup.CUSTOM_TOKEN_2,
    ]) {
      data.usdPerToken.set(token.token, {
        value: token.price,
        timestamp: currentTime,
      })
    }

    this.bind.feeQuoter = this.blockchain.openContract(
      feeQuoter.FeeQuoter.createFromConfig(data, this.code.feeQuoter),
    )
  }

  /**
   * Setup the counter contract (equivalent to mock contracts in Solidity tests)
   */
  async setupCounterContract(): Promise<void> {
    const data: counter.ContractData = {
      id: generateRandomContractId(),
      value: 0,
      ownable: {
        owner: this.bind.feeQuoter.address,
        pendingOwner: null,
      },
    }
    this.bind.counter = this.blockchain.openContract(
      counter.ContractClient.newFrom(data, this.code.counter),
    )
  }

  /**
   * Deploy and initialize the FeeQuoter contract (following setupTestFeeQuoter pattern)
   */
  async deployFeeQuoterContract(): Promise<void> {
    const deployResult = await this.bind.feeQuoter.sendDeploy(
      this.acc.deployer.getSender(),
      toNano('1'),
    )

    expect(deployResult.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.feeQuoter.address,
      deploy: true,
      success: true,
    })

    // Add config for EVM destination (following setupTestFeeQuoter pattern)
    const destConfigResult = await this.bind.feeQuoter.sendUpdateDestChainConfigs(
      this.acc.owner.getSender(),
      {
        value: toNano('1'),
        updates: [
          {
            destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
            config: FeeQuoterSetup.destChainConfig,
          },
          {
            destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SVM,
            config: {
              ...FeeQuoterSetup.destChainConfig,
              chainFamilySelector: CHAIN_FAMILY_SELECTOR_SVM,
            },
          },
          {
            destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_APTOS,
            config: {
              ...FeeQuoterSetup.destChainConfig,
              chainFamilySelector: CHAIN_FAMILY_SELECTOR_APTOS,
            },
          },
          {
            destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_SUI,
            config: {
              ...FeeQuoterSetup.destChainConfig,
              chainFamilySelector: CHAIN_FAMILY_SELECTOR_SUI,
            },
          },
        ],
      },
    )

    expect(destConfigResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    // Configure the feeToken (following setupTestFeeQuoter pattern)
    const feeTokenResult = await this.bind.feeQuoter.sendUpdateFeeTokens(
      this.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          add: new Map([
            [FeeQuoterSetup.SOURCE_FEE_TOKEN.token, { premiumMultiplierWeiPerEth: BigInt(5e17) }], // 0.5x
            [FeeQuoterSetup.NATIVE_TON.token, { premiumMultiplierWeiPerEth: BigInt(2e18) }], // 2.0x
          ]),
          remove: [],
        },
      },
    )
    expect(feeTokenResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    const pricedTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS.concat(FeeQuoterSetup.DEST_FEE_TOKENS)

    const priceUpdates: feeQuoter.PriceUpdates = {
      tokenPricesUpdates: pricedTokens,
      gasPricesUpdates: [
        {
          chainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
          executionGasPrice: FeeQuoterSetup.USD_PER_GAS,
          dataAvailabilityGasPrice: FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        },
      ],
    }

    // Allow us to updatePrices
    const addPriceUpdaterResult = await this.bind.feeQuoter.sendAddPriceUpdater(
      this.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: { priceUpdater: this.acc.owner.address },
      },
    )

    expect(addPriceUpdaterResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    // Send updatePrices transaction
    const updateResult = await this.bind.feeQuoter.sendUpdatePrices(this.acc.owner.getSender(), {
      value: toNano('1'),
      msg: { updates: priceUpdates, sendExcessesTo: this.acc.owner.address },
    })

    expect(updateResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    // Update TokenTransferFeeConfigs
    const transferFeeConfigResult = await this.bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      this.acc.owner.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
              {
                add: new Map([
                  [
                    FeeQuoterSetup.SOURCE_FEE_TOKEN.token,
                    {
                      isEnabled: true,
                      minFeeUsdCents: 1_00, // 1 USD
                      maxFeeUsdCents: 1000_00, // 1,000 USD
                      deciBps: 2_5, // 2.5 bps, or 0.25%
                      destGasOverhead: 100_000,
                      destBytesOverhead: 32,
                    },
                  ],
                  [
                    FeeQuoterSetup.CUSTOM_TOKEN.token,
                    {
                      isEnabled: true,
                      minFeeUsdCents: 2_00, // 2 USD
                      maxFeeUsdCents: 2000_00, // 2,000 USD
                      deciBps: 10_0, // 10 bps, or 0.1%
                      destGasOverhead: 95_000,
                      destBytesOverhead: 200,
                    },
                  ],
                  [
                    FeeQuoterSetup.CUSTOM_TOKEN_2.token,
                    {
                      isEnabled: false,
                      minFeeUsdCents: 2_00, // 2 USD
                      maxFeeUsdCents: 2000_00, // 2,000 USD
                      deciBps: 10_0, // 10 bps, or 0.1%
                      destGasOverhead: 1,
                      destBytesOverhead: 200,
                    },
                  ],
                ]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )
  }

  /**
   * Deploy the counter contract
   */
  async deployCounterContract(): Promise<void> {
    const deployResult = await this.bind.counter.sendInternal(
      this.acc.deployer.getSender(),
      toNano('0.05'),
      Cell.EMPTY,
    )

    expect(deployResult.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.counter.address,
      deploy: true,
      success: true,
    })
  }

  /**
   * Complete setup for all contracts - convenience method
   */
  async setupAll(testId: string, blockchain: Blockchain): Promise<void> {
    await this.initializeBlockchain(blockchain)
    await this.setupFeeQuoterContract()
    await this.deployFeeQuoterContract()
    await this.setupCounterContract()
    await this.deployCounterContract()
  }

  /**
   * Move time forward by a specific period (in seconds)
   */
  warpTime(period: number): void {
    this.blockchain.now = this.blockchain.now!! + period
  }

  /**
   * Helper function to convert USD cents to wei (equivalent to _configUSDCentToWei)
   */
  static configUSDCentToWei(usdCent: number): bigint {
    return BigInt(usdCent) * BigInt(1e16) // usdCent * 1e16
  }

  /**
   * Generate a basic message structure for testing
   */
  generateEmptyMessage({
    tokenAmounts = [],
    feeToken = FeeQuoterSetup.NATIVE_TON.token,
  }: {
    tokenAmounts?: rt.TokenAmount[]
    feeToken?: Address
  }): rt.CCIPSend {
    return {
      destChainSelector: FeeQuoterSetup.DEST_CHAIN_SELECTOR_EVM,
      receiver: FeeQuoterSetup.DEST_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts,
      feeToken,
      extraArgs: this.generateExtraArgs(FeeQuoterSetup.GAS_LIMIT),
    }
  }

  /**
   * Generate a single token message for testing (simplified for TON)
   */
  generateSingleTokenMessage({
    token,
    amount,
    feeToken = FeeQuoterSetup.NATIVE_TON.token,
  }: {
    token: Address
    amount: bigint
    feeToken?: Address
  }): rt.CCIPSend {
    return this.generateEmptyMessage({
      tokenAmounts: [
        {
          token,
          amount,
        },
      ],
      feeToken,
    })
  }

  /**
   * Generate extra args for TON (equivalent to Client._argsToBytes)
   */
  generateExtraArgs(gasLimit: number): Cell {
    return rt.builder.data.extraArgs
      .encode({
        kind: 'generic-v2',
        allowOutOfOrderExecution: true,
        gasLimit: BigInt(gasLimit),
      })
      .endCell()
  }

  /**
   * Requests validateMessage
   */
  async getValidatedFee(msg: rt.CCIPSend): Promise<feeQuoter.MessageValidated> {
    const res = await this.bind.feeQuoter.sendGetValidatedFee(this.acc.externalCaller.getSender(), {
      value: toNano('1'),
      msg: {
        msg,
        context: beginCell().asSlice(),
      },
    })

    // request
    expect(res.transactions).toHaveTransaction({
      from: this.acc.externalCaller.address,
      to: this.bind.feeQuoter.address,
      success: true,
    })
    // response
    expect(res.transactions).toHaveTransaction({
      from: this.bind.feeQuoter.address,
      to: this.acc.externalCaller.address,
      success: true,
    })

    const tx = res.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(this.bind.feeQuoter.address),
    )

    if (!tx || tx.inMessage === undefined || tx.inMessage?.info.type !== 'internal') {
      throw new Error('Failed to find response transaction')
    }
    const resp = tx.inMessage

    const body = resp.body.beginParse()
    const errorCode = body.preloadUint(32)
    if (errorCode !== sx.opcodes.in.messageValidated) {
      if (errorCode === sx.opcodes.in.messageValidationFailed) {
        const failure = sx.builder.message.in.messageValidationFailed.load(resp.body.beginParse())
        throw new Error(
          `Message validation failed with error ${printErrorName(Number(failure.error))}`,
        )
      } else {
        throw new Error(`Unexpected response opcode: ${errorCode}`)
      }
    }
    const messageValidated = feeQuoter.builder.message.out.messageValidated.load(
      resp.body.beginParse(),
    )
    return messageValidated
  }

  async assertGetFeeValidationError(message: rt.CCIPSend, expectedError: number): Promise<void> {
    const result = await this.bind.feeQuoter.sendGetValidatedFee(
      this.acc.externalCaller.getSender(),
      {
        value: toNano('1'),
        msg: { msg: message, context: beginCell().asSlice() },
      },
    )

    // It should return failure due to overflow
    expect(result.transactions).toHaveTransaction({
      from: this.acc.externalCaller.getSender().address,
      to: this.bind.feeQuoter.address,
      success: true,
    })

    try {
      expect(result.transactions).toHaveTransaction({
        from: this.bind.feeQuoter.address,
        op: sx.opcodes.in.messageValidationFailed,
        success: true,
      })
    } catch (error) {
      var success = false
      try {
        expect(result.transactions).toHaveTransaction({
          from: this.bind.feeQuoter.address,
          op: sx.opcodes.in.messageValidated,
          success: true,
        })
        success = true
      } catch (error) {}
      if (success) {
        throw new Error('Expected messageValidationFailed, but got messageValidated')
      }
    }
    try {
      expect(result.transactions).toHaveTransaction({
        from: this.bind.feeQuoter.address,
        op: sx.opcodes.in.messageValidationFailed,
        success: true,
        body(x) {
          return verifyBodyMessage<feeQuoter.MessageValidationFailed>(
            x,
            sx.builder.message.in.messageValidationFailed,
            [
              (msg) => {
                if (msg.error === BigInt(expectedError)) {
                  return true
                }
                throw new Error(`Validation failed with error ${printErrorName(Number(msg.error))}`)
              },
            ],
          )
        },
      })
    } catch (error) {
      throw new Error(
        `Expected error code ${expectedError} (${printErrorName(expectedError)}), but it was got a different error: ${error}`,
      )
    }
  }
}

/**
 * Simplified setup class for fee-related tests (without complex token handling)
 */
export class FeeQuoterFeeSetup extends FeeQuoterSetup {
  constructor(blockchain: Blockchain) {
    super(blockchain)
  }

  async setupAll(testId: string, blockchain: Blockchain): Promise<void> {
    await super.setupAll(testId, blockchain)
    // In TON, we'll focus on native TON fees rather than complex token pricing
  }
}
function printErrorName(error: number): string {
  switch (error) {
    case feeQuoter.errors.UnsupportedChainFamilySelector:
      return 'UnsupportedChainFamilySelector'
    case feeQuoter.errors.GasLimitTooHigh:
      return 'GasLimitTooHigh'
    case feeQuoter.errors.ExtraArgOutOfOrderExecutionMustBeTrue:
      return 'ExtraArgOutOfOrderExecutionMustBeTrue'
    case feeQuoter.errors.InvalidExtraArgsData:
      return 'InvalidExtraArgsData'
    case feeQuoter.errors.UnsupportedNumberOfTokens:
      return 'UnsupportedNumberOfTokens'
    case feeQuoter.errors.InvalidEVMReceiverAddress:
      return 'InvalidEVMReceiverAddress'
    case feeQuoter.errors.Invalid32ByteReceiverAddress:
      return 'Invalid32ByteReceiverAddress'
    case feeQuoter.errors.InvalidSuiReceiverAddress:
      return 'InvalidSuiReceiverAddress'
    case feeQuoter.errors.InvalidSVMReceiverAddress:
      return 'InvalidSVMReceiverAddress'
    case feeQuoter.errors.InvalidTokenReceiver:
      return 'InvalidTokenReceiver'
    case feeQuoter.errors.TooManySuiExtraArgsReceiverObjectIds:
      return 'TooManySuiExtraArgsReceiverObjectIds'
    case feeQuoter.errors.MsgDataTooLarge:
      return 'MsgDataTooLarge'
    case feeQuoter.errors.StaleGasPrice:
      return 'StaleGasPrice'
    case feeQuoter.errors.DestChainNotEnabled:
      return 'DestChainNotEnabled'
    case feeQuoter.errors.FeeTokenNotSupported:
      return 'FeeTokenNotSupported'
    case feeQuoter.errors.InvalidMsgData:
      return 'InvalidMsgData'
    case feeQuoter.errors.TokenNotSupported:
      return 'TokenNotSupported'
    case feeQuoter.errors.UnknownDestChainSelector:
      return 'UnknownDestChainSelector'
    case feeQuoter.errors.InsufficientFee:
      return 'InsufficientFee'
    case feeQuoter.errors.TokenTransfersNotSupported:
      return 'TokenTransfersNotSupported'
    case feeQuoter.errors.UnauthorizedPriceUpdater:
      return 'UnauthorizedPriceUpdater'
    case feeQuoter.errors.ExecutionCostOverflow:
      return 'ExecutionCostOverflow'
    case feeQuoter.errors.PremiumFeeOverflow:
      return 'PremiumFeeOverflow'
    case feeQuoter.errors.DataAvailabilityCostOverflow:
      return 'DataAvailabilityCostOverflow'
    case feeQuoter.errors.FeeCalculationOverflow:
      return 'FeeCalculationOverflow'
    case feeQuoter.errors.TokenPriceTooLow:
      return 'TokenPriceTooLow'
    case feeQuoter.errors.FeeOverflow:
      return 'FeeOverflow'
    case feeQuoter.errors.MessageFeeTooHigh:
      return 'MessageFeeTooHigh'
    default:
      throw new Error(`Unknown error code: ${error.toString()}`)
  }
}
