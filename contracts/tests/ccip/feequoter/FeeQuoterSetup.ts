import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano, beginCell, Address } from '@ton/core'

import { generateRandomContractId, WRAPPED_NATIVE } from '../../../src/utils'

import { contractCode } from '../../../wrappers/codeLoader'
import * as feeQuoter from '../../../wrappers/gen/ccip/FeeQuoter'
import * as manualfq from '../../../wrappers/ccip/FeeQuoter'
import * as counter from '../../../wrappers/examples/Counter'
import * as decimals from '../../lib/pricing/Decimals'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as sx from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import { verifyBodyMessage } from '../../utils/verifyMessageBody'
import { ChainFamilySelectors, ChainSelectors } from '../../utils/Selectors'
import { FromBuffer } from '../../../wrappers/ccip/common/CrossChainAddressCodec'

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

  static readonly MAX_DATA_SIZE = 300n
  static readonly MAX_TOKENS_LENGTH = 0n // We don't support token transfers in TON yet
  static readonly MAX_GAS_LIMIT = 4000000n

  // OnRamp constants
  static readonly MAX_MSG_FEES_JUELS = 1_000_000_000_000_000_000_000n // 1_000e18
  static readonly DEST_GAS_OVERHEAD = 300000n
  static readonly DEST_GAS_PER_PAYLOAD_BYTE_BASE = 16n
  static readonly DEST_GAS_PER_PAYLOAD_BYTE_HIGH = 40n
  static readonly DEST_GAS_PER_PAYLOAD_BYTE_THRESHOLD = 100n

  static readonly DEFAULT_TOKEN_FEE_USD_CENTS = 50n
  static readonly DEFAULT_TOKEN_BYTES_OVERHEAD = 32n
  static readonly DEFAULT_TOKEN_DEST_GAS_OVERHEAD = 90_000n

  // Data availability constants
  static readonly DEST_GAS_PER_DATA_AVAILABILITY_BYTE = 16n
  static readonly DEST_DATA_AVAILABILITY_OVERHEAD_GAS =
    188n +
    (32n * 31n + 4n) * this.DEST_GAS_PER_DATA_AVAILABILITY_BYTE +
    (32n * 34n + 4n) * this.DEST_GAS_PER_DATA_AVAILABILITY_BYTE
  static readonly DEST_GAS_DATA_AVAILABILITY_MULTIPLIER_BPS = 6840n

  // Packed gas price (L1 gas price left-shifted + L2 gas price)
  static readonly PACKED_USD_PER_GAS =
    (FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS << 112n) + FeeQuoterSetup.USD_PER_GAS

  static readonly MESSAGE_RECEIVER = beginCell()
    .storeBuffer(Buffer.from('MESSAGE_RECEIVER', 'utf8'))
    .endCell()

  static readonly TWELVE_HOURS = 12n * 60n * 60n // 12 hours in seconds
  static readonly GAS_LIMIT = 200000n

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
  code!: TestCode
  acc!: TestAccounts
  bind!: TestContracts

  static readonly destChainConfig = feeQuoter.FeeQuoterDestChainConfig.create({
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
    chainFamilySelector: ChainFamilySelectors.evm,
    defaultTokenFeeUsdCents: FeeQuoterSetup.DEFAULT_TOKEN_FEE_USD_CENTS,
    defaultTokenDestGasOverhead: FeeQuoterSetup.DEFAULT_TOKEN_DEST_GAS_OVERHEAD,
    defaultTxGasLimit: FeeQuoterSetup.GAS_LIMIT,
    gasMultiplierWeiPerEth: BigInt(5e17),
    gasPriceStalenessThreshold: FeeQuoterSetup.TWELVE_HOURS,
    networkFeeUsdCents: 100n,
  })

  constructor(blockchain: Blockchain) {
    this.blockchain = blockchain
  }

  static async compileContracts(): Promise<TestCode> {
    return {
      feeQuoter: await contractCode.ccip.local('FeeQuoter'),
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
  }

  /**
   * Setup the FeeQuoter contract with minimal configuration (following setupTestFeeQuoter pattern)
   */
  async setupFeeQuoterContract(): Promise<void> {
    const data = feeQuoter.Storage.create({
      id: generateRandomContractId(),
      ownable: feeQuoter.Ownable2Step.create({
        owner: this.acc.owner.address,
      }),
      allowedPriceUpdaters: new Set(),
      maxFeeJuelsPerMsg: FeeQuoterSetup.MAX_MSG_FEES_JUELS,
      linkToken: FeeQuoterSetup.SOURCE_LINK.token,
      tokenPriceStalenessThreshold: FeeQuoterSetup.TWELVE_HOURS,
      usdPerToken: new Map(),
      premiumMultiplierWeiPerEth: new Map(),
      destChainConfigs: new Map(),
    })

    // Pre-setup token prices for testing (following Solidity setup pattern)
    const currentTime = 1n
    for (const token of [
      ...FeeQuoterSetup.SOURCE_FEE_TOKENS,
      FeeQuoterSetup.CUSTOM_TOKEN,
      FeeQuoterSetup.CUSTOM_TOKEN_2,
    ]) {
      data.usdPerToken.set(
        token.token,
        feeQuoter.TimestampedPrice.create({
          value: token.price,
          timestamp: currentTime,
        }),
      )
    }

    const feeQuoterContract = this.blockchain.openContract(
      feeQuoter.FeeQuoter.fromStorage(data, { overrideContractCode: this.code.feeQuoter }),
    )
    // TODO shis is unatural
    this.bind = { feeQuoter: feeQuoterContract } as TestContracts
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
    const destConfigResult = await this.bind.feeQuoter.sendFeeQuoterUpdateDestChainConfigs(
      this.acc.owner.getSender(),
      toNano('1'),
      {
        updates: [
          feeQuoter.FeeQuoter_UpdateDestChainConfig.create({
            destChainSelector: ChainSelectors.testnet.evm,
            destChainConfig: FeeQuoterSetup.destChainConfig,
          }),
          feeQuoter.FeeQuoter_UpdateDestChainConfig.create({
            destChainSelector: ChainSelectors.testnet.solana,
            destChainConfig: feeQuoter.FeeQuoterDestChainConfig.create({
              ...FeeQuoterSetup.destChainConfig,
              chainFamilySelector: ChainFamilySelectors.svm,
            }),
          }),
          feeQuoter.FeeQuoter_UpdateDestChainConfig.create({
            destChainSelector: ChainSelectors.testnet.aptos,
            destChainConfig: feeQuoter.FeeQuoterDestChainConfig.create({
              ...FeeQuoterSetup.destChainConfig,
              chainFamilySelector: ChainFamilySelectors.aptos,
            }),
          }),
          feeQuoter.FeeQuoter_UpdateDestChainConfig.create({
            destChainSelector: ChainSelectors.testnet.sui,
            destChainConfig: feeQuoter.FeeQuoterDestChainConfig.create({
              ...FeeQuoterSetup.destChainConfig,
              chainFamilySelector: ChainFamilySelectors.sui,
            }),
          }),
        ],
      },
    )

    expect(destConfigResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    // Configure the feeToken (following setupTestFeeQuoter pattern)
    const feeTokenResult = await this.bind.feeQuoter.sendFeeQuoterUpdateFeeTokens(
      this.acc.owner.getSender(),
      toNano('1'),
      {
        add: new Map([
          [
            FeeQuoterSetup.SOURCE_FEE_TOKEN.token,
            feeQuoter.FeeToken.create({ premiumMultiplierWeiPerEth: BigInt(5e17) }),
          ],
          [
            FeeQuoterSetup.NATIVE_TON.token,
            feeQuoter.FeeToken.create({ premiumMultiplierWeiPerEth: BigInt(2e18) }),
          ],
        ]),
        remove: [],
      },
    )
    expect(feeTokenResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    const pricedTokens = FeeQuoterSetup.SOURCE_FEE_TOKENS.concat(FeeQuoterSetup.DEST_FEE_TOKENS)

    const priceUpdates = feeQuoter.PriceUpdates.create({
      tokenPriceUpdates: pricedTokens.map(({ token, price }) =>
        feeQuoter.TokenPriceUpdate.create({ sourceToken: token, usdPerToken: price }),
      ),
      gasPriceUpdates: [
        feeQuoter.GasPriceUpdate.create({
          destChainSelector: ChainSelectors.testnet.evm,
          executionGasPrice: FeeQuoterSetup.USD_PER_GAS,
          dataAvailabilityGasPrice: FeeQuoterSetup.USD_PER_DATA_AVAILABILITY_GAS,
        }),
      ],
    })

    // Allow us to updatePrices
    const addPriceUpdaterResult = await this.bind.feeQuoter.sendFeeQuoterAddPriceUpdater(
      this.acc.owner.getSender(),
      toNano('1'),
      {
        priceUpdater: this.acc.owner.address,
      },
    )

    expect(addPriceUpdaterResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    // Send updatePrices transaction
    const updateResult = await this.bind.feeQuoter.sendFeeQuoterUpdatePrices(
      this.acc.owner.getSender(),
      toNano('1'),
      { updates: priceUpdates, sendExcessesTo: this.acc.owner.address },
    )

    expect(updateResult.transactions).toHaveTransaction({
      to: this.bind.feeQuoter.address,
      success: true,
    })

    // Update TokenTransferFeeConfigs
    const transferFeeConfigResult =
      await this.bind.feeQuoter.sendFeeQuoterUpdateTokenTransferFeeConfigs(
        this.acc.owner.getSender(),
        toNano('1'),
        {
          updates: new Map([
            [
              BigInt(ChainSelectors.testnet.evm),
              feeQuoter.UpdateTokenTransferFeeConfig.create({
                add: new Map([
                  [
                    FeeQuoterSetup.SOURCE_FEE_TOKEN.token,
                    feeQuoter.TokenTransferFeeConfig.create({
                      isEnabled: true,
                      minFeeUsdCents: 1_00n,
                      maxFeeUsdCents: 1000_00n,
                      deciBps: 2_5n,
                      destGasOverhead: 100_000n,
                      destBytesOverhead: 32n,
                    }),
                  ],
                  [
                    FeeQuoterSetup.CUSTOM_TOKEN.token,
                    feeQuoter.TokenTransferFeeConfig.create({
                      isEnabled: true,
                      minFeeUsdCents: 2_00n,
                      maxFeeUsdCents: 2000_00n,
                      deciBps: 10_0n,
                      destGasOverhead: 95_000n,
                      destBytesOverhead: 200n,
                    }),
                  ],
                  [
                    FeeQuoterSetup.CUSTOM_TOKEN_2.token,
                    feeQuoter.TokenTransferFeeConfig.create({
                      isEnabled: false,
                      minFeeUsdCents: 2_00n,
                      maxFeeUsdCents: 2000_00n,
                      deciBps: 10_0n,
                      destGasOverhead: 1n,
                      destBytesOverhead: 200n,
                    }),
                  ],
                ]),
                remove: [],
              }),
            ],
          ]),
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
  static configUSDCentToWei(usdCent: bigint): bigint {
    return usdCent * 10000000000000000n // usdCent * 1e16
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
  }): rt.Router_CCIPSend {
    return rt.Router_CCIPSend.create({
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: FromBuffer(FeeQuoterSetup.DEST_ADDRESS),
      data: Cell.EMPTY,
      tokenAmounts,
      feeToken,
      extraArgs: this.generateExtraArgs(FeeQuoterSetup.GAS_LIMIT),
    })
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
  }): rt.Router_CCIPSend {
    return this.generateEmptyMessage({
      tokenAmounts: [
        rt.TokenAmount.create({
          token,
          amount,
        }),
      ],
      feeToken,
    })
  }

  /**
   * Generate extra args for TON (equivalent to Client._argsToBytes)
   */
  generateExtraArgs(gasLimit: bigint): rt.GenericExtraArgsV2 {
    return rt.GenericExtraArgsV2.create({
      allowOutOfOrderExecution: true,
      gasLimit,
    })
  }

  /**
   * Requests validateMessage
   */
  async getValidatedFee(
    msg: rt.Router_CCIPSend,
  ): Promise<sx.FeeQuoter_MessageValidated_RemainingBitsAndRefs> {
    const res = await this.bind.feeQuoter.sendFeeQuoterGetValidatedFeeToFeeQuoter(
      this.acc.externalCaller.getSender(),
      toNano('1'),
      feeQuoter.FeeQuoter_GetValidatedFee.create({ msg, context: beginCell().asSlice() }),
    )

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
    if (errorCode !== sx.FeeQuoter_MessageValidated.PREFIX) {
      if (errorCode === sx.FeeQuoter_MessageValidationFailed.PREFIX) {
        const failure = sx.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs.fromSlice(
          resp.body.beginParse(),
        )
        throw new Error(
          `Message validation failed with error ${printErrorName(Number(failure.error))}`,
        )
      } else {
        throw new Error(`Unexpected response opcode: ${errorCode}`)
      }
    }
    const messageValidated = sx.FeeQuoter_MessageValidated_RemainingBitsAndRefs.fromSlice(
      resp.body.beginParse(),
    )
    return messageValidated
  }

  async assertGetFeeValidationError(
    message: rt.Router_CCIPSend | Cell,
    expectedError: number,
  ): Promise<void> {
    const body =
      message instanceof Cell
        ? message
        : feeQuoter.FeeQuoter_GetValidatedFee_ToFeeQuoter.toCell(
            feeQuoter.FeeQuoter_GetValidatedFee.create({
              msg: message,
              context: beginCell().asSlice(),
            }),
          )
    const result = await this.bind.feeQuoter.send(
      this.acc.externalCaller.getSender(),
      toNano('1'),
      body,
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
        op: sx.FeeQuoter_MessageValidationFailed.PREFIX,
        success: true,
      })
    } catch (error) {
      var success = false
      try {
        expect(result.transactions).toHaveTransaction({
          from: this.bind.feeQuoter.address,
          op: sx.FeeQuoter_MessageValidated.PREFIX,
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
        op: sx.FeeQuoter_MessageValidationFailed.PREFIX,
        success: true,
        body(x) {
          return verifyBodyMessage<manualfq.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs>(
            x,
            manualfq.FeeQuoter_MessageValidationFailed_RemainingBitsAndRefs,
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
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.UnsupportedChainFamilySelector']:
      return 'UnsupportedChainFamilySelector'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.GasLimitTooHigh']:
      return 'GasLimitTooHigh'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.ExtraArgOutOfOrderExecutionMustBeTrue']:
      return 'ExtraArgOutOfOrderExecutionMustBeTrue'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidExtraArgsData']:
      return 'InvalidExtraArgsData'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.UnsupportedNumberOfTokens']:
      return 'UnsupportedNumberOfTokens'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidEVMReceiverAddress']:
      return 'InvalidEVMReceiverAddress'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.Invalid32ByteReceiverAddress']:
      return 'Invalid32ByteReceiverAddress'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidSuiReceiverAddress']:
      return 'InvalidSuiReceiverAddress'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidSVMReceiverAddress']:
      return 'InvalidSVMReceiverAddress'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidTokenReceiver']:
      return 'InvalidTokenReceiver'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.TooManySuiExtraArgsReceiverObjectIds']:
      return 'TooManySuiExtraArgsReceiverObjectIds'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.MsgDataTooLarge']:
      return 'MsgDataTooLarge'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.StaleGasPrice']:
      return 'StaleGasPrice'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.DestChainNotEnabled']:
      return 'DestChainNotEnabled'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.FeeTokenNotSupported']:
      return 'FeeTokenNotSupported'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InvalidMsgData']:
      return 'InvalidMsgData'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.TokenNotSupported']:
      return 'TokenNotSupported'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.UnknownDestChainSelector']:
      return 'UnknownDestChainSelector'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.InsufficientFee']:
      return 'InsufficientFee'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.TokenTransfersNotSupported']:
      return 'TokenTransfersNotSupported'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.UnauthorizedPriceUpdater']:
      return 'UnauthorizedPriceUpdater'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.ExecutionCostOverflow']:
      return 'ExecutionCostOverflow'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.PremiumFeeOverflow']:
      return 'PremiumFeeOverflow'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.DataAvailabilityCostOverflow']:
      return 'DataAvailabilityCostOverflow'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.FeeCalculationOverflow']:
      return 'FeeCalculationOverflow'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.TokenPriceTooLow']:
      return 'TokenPriceTooLow'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.FeeOverflow']:
      return 'FeeOverflow'
    case feeQuoter.FeeQuoter.Errors['FeeQuoter_Error.MessageFeeTooHigh']:
      return 'MessageFeeTooHigh'
    default:
      throw new Error(`Unknown error code: ${error.toString()}`)
  }
}
