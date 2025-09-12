import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano, beginCell, Address } from '@ton/core'
import { compile } from '@ton/blueprint'

import { crc32 } from 'zlib'

import {
  JettonMinter,
  jettonMinterConfigToCell,
  JettonMinterContent,
} from '../../wrappers/jetton/JettonMinter'
import { JettonWallet } from '../../wrappers/jetton/JettonWallet'
import { lockReleaseTokenPool } from '../../wrappers/pools'
import { env } from 'process'
import { readFileSync } from 'fs'

export type TestCode = {
  lockReleaseTokenPool: Cell
  jettonMinter: Cell
  jettonWallet: Cell
}

export type TestAccounts = {
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  stranger: SandboxContract<TreasuryContract>
  ramp: SandboxContract<TreasuryContract>
  allowedSender1: SandboxContract<TreasuryContract>
  allowedSender2: SandboxContract<TreasuryContract>
  rebalancer: SandboxContract<TreasuryContract>
  liquidityProvider: SandboxContract<TreasuryContract>
}

export type TestContracts = {
  lockReleaseTokenPool: SandboxContract<lockReleaseTokenPool.ContractClient>
  jettonMinter: SandboxContract<JettonMinter>
  jettonWallet: SandboxContract<JettonWallet>
}

export class BaseTokenPoolTest {
  // Constants from Solidity BaseTest
  static readonly BLOCK_TIME = 1n
  static readonly TWELVE_HOURS = 60n * 60n * 12n

  // Chain selectors
  static readonly SOURCE_CHAIN_SELECTOR = 1n
  static readonly DEST_CHAIN_SELECTOR = 2n

  // Gas and token defaults
  static readonly GAS_LIMIT = 200_000n
  static readonly DEFAULT_TOKEN_DEST_GAS_OVERHEAD = 90_000n
  static readonly DEFAULT_TOKEN_DECIMALS = 18
  static readonly GAS_FOR_CALL_EXACT_CHECK = 5_000n

  // Rate limiter configs - equivalent to Solidity BaseTest
  static readonly OUTBOUND_RATE_LIMITER_CONFIG = {
    isEnabled: true,
    capacity: 100n * 10n ** 28n, // 100e28
    rate: 10n ** 15n, // 1e15
  }

  static readonly INBOUND_RATE_LIMITER_CONFIG = {
    isEnabled: true,
    capacity: 222n * 10n ** 30n, // 222e30
    rate: 10n ** 18n, // 1e18
  }

  blockchain: Blockchain
  code: TestCode
  acc: TestAccounts
  bind: TestContracts

  constructor() {
    this.blockchain = null as any
    this.code = null as any
    this.acc = null as any
    this.bind = null as any
  }

  static async compileContracts(): Promise<TestCode> {
    return {
      lockReleaseTokenPool: await compile('pools.LockReleaseTokenPool'),
      jettonMinter: await JettonMinterCode(),
      jettonWallet: await JettonWalletCode(),
    }
  }

  /**
   * Initialize the blockchain and setup test accounts
   */
  async initializeBlockchain(): Promise<void> {
    this.blockchain = await Blockchain.create()
    this.blockchain.now = Number(BaseTokenPoolTest.BLOCK_TIME)
    this.blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }

    // Set up accounts following Solidity BaseTest pattern
    this.acc = {
      deployer: await this.blockchain.treasury('deployer'),
      owner: await this.blockchain.treasury('owner'),
      stranger: await this.blockchain.treasury('stranger'),
      ramp: await this.blockchain.treasury('ramp'),
      allowedSender1: await this.blockchain.treasury('allowedSender1'),
      allowedSender2: await this.blockchain.treasury('allowedSender2'),
      rebalancer: await this.blockchain.treasury('rebalancer'),
      liquidityProvider: await this.blockchain.treasury('liquidityProvider'),
    }

    this.bind = {
      lockReleaseTokenPool: null as any,
      jettonMinter: null as any,
      jettonWallet: null as any,
    }
  }

  /**
   * Setup a basic ERC20-like jetton for testing
   */
  async setupJettonMinter(
    testId: string,
    decimals: number = BaseTokenPoolTest.DEFAULT_TOKEN_DECIMALS,
  ): Promise<void> {
    // Create jetton content similar to the working Jetton.spec.ts
    const jettonContent = beginCell().storeStringTail('smartcontract.com').endCell()
    this.bind.jettonMinter = this.blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: this.acc.owner.address,
          walletCode: this.code.jettonWallet,
          jettonContent,
          totalSupply: 0n,
        },
        this.code.jettonMinter,
      ),
    )
  }

  /**
   * Deploy the jetton minter and verify deployment
   */
  async deployJettonMinter(): Promise<void> {
    const deployResult = await this.bind.jettonMinter.sendDeploy(
      this.acc.deployer.getSender(),
      toNano('1'),
    )

    expect(deployResult.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.jettonMinter.address,
      deploy: true,
    })

    // Verify initial state
    const jettonData = await this.bind.jettonMinter.getJettonData()
    expect(jettonData.totalSupply).toEqual(0n) // Initially 0, as set in config
    expect(jettonData.admin).toEqualAddress(this.acc.owner.address)
  }

  /**
   * Setup a mock RMN (Risk Management Network) contract
   */
  async setupMockRMN(testId: string): Promise<void> {
    // TODO: Implement when RMN wrapper is available
    // For now, create a minimal mock that always returns "not cursed"
    console.warn('Mock RMN setup not yet implemented - waiting for RMN wrapper')
  }

  /**
   * Setup a mock Router contract
   */
  async setupMockRouter(testId: string): Promise<void> {
    // TODO: Implement when Router wrapper is available
    console.warn('Mock Router setup not yet implemented - waiting for Router wrapper')
  }

  /**
   * Create rate limiter config data structure
   */
  createRateLimiterConfig(isEnabled: boolean, capacity: bigint, rate: bigint): any {
    return {
      isEnabled,
      capacity,
      rate,
    }
  }

  /**
   * Get default outbound rate limiter config
   */
  getOutboundRateLimiterConfig(): any {
    return BaseTokenPoolTest.OUTBOUND_RATE_LIMITER_CONFIG
  }

  /**
   * Get default inbound rate limiter config
   */
  getInboundRateLimiterConfig(): any {
    return BaseTokenPoolTest.INBOUND_RATE_LIMITER_CONFIG
  }

  /**
   * Create a token price update structure (equivalent to Solidity _getSingleTokenPriceUpdateStruct)
   */
  createSingleTokenPriceUpdate(token: Address, price: bigint): any {
    return {
      tokenPriceUpdates: [
        {
          sourceToken: token,
          usdPerToken: price,
        },
      ],
    }
  }

  /**
   * Generate source token data (equivalent to Solidity _generateSourceTokenData)
   */
  generateSourceTokenData(): any {
    return {
      destGasAmount: BaseTokenPoolTest.DEFAULT_TOKEN_DEST_GAS_OVERHEAD,
    }
  }

  /**
   * Set mock RMN chain curse status
   */
  setMockRMNChainCurse(chainSelector: bigint, isCursed: boolean): void {
    // TODO: Implement when RMN mock is available
    console.warn(`Setting chain ${chainSelector} curse status to ${isCursed} - not yet implemented`)
  }

  /**
   * Warp blockchain time forward by specified seconds
   */
  warpTime(seconds: number): void {
    this.blockchain.now = this.blockchain.now!! + seconds
  }

  /**
   * Complete basic setup for token pool tests
   */
  async setupBasics(testId: string): Promise<void> {
    await this.initializeBlockchain()
    await this.setupJettonMinter(testId)
    await this.deployJettonMinter()
    await this.setupMockRMN(testId)
    await this.setupMockRouter(testId)
  }

  /**
   * Helper to create makeAddr equivalent
   */
  async makeAddr(name: string): Promise<Address> {
    const treasury = await this.blockchain.treasury(name)
    return treasury.address
  }

  /**
   * Helper to deal tokens to an address (mint jettons)
   */
  async dealTokens(to: Address, amount: bigint): Promise<void> {
    // Mint jettons to the specified address
    const mintResult = await this.bind.jettonMinter.sendMint(this.acc.owner.getSender(), {
      value: toNano('0.05'), // TON for gas
      message: {
        queryId: 1n,
        destination: to,
        tonAmount: toNano('0.02'), // TON amount for the recipient
        jettonAmount: amount,
        from: this.acc.owner.address,
        responseDestination: this.acc.owner.address,
        customPayload: null,
        forwardTonAmount: 0n,
      },
    })

    expect(mintResult.transactions).toHaveTransaction({
      from: this.acc.owner.address,
      success: true,
    })
  }
}

const PATH_CONTRACTS_JETTON = env.PATH_CONTRACTS_JETTON

async function JettonMinterCode(): Promise<Cell> {
  const compiledPath = `${PATH_CONTRACTS_JETTON}/JettonMinter.compiled.json`
  const compiled = JSON.parse(readFileSync(compiledPath, 'utf8'))
  const hex = compiled.hex
  if (!hex) {
    throw new Error('Compiled JettonMinter code hex not found in JSON')
  }
  // Remove 0x prefix if present
  const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex
  const boc = Buffer.from(hexStr, 'hex')
  return Cell.fromBoc(boc)[0]
}

async function JettonWalletCode(): Promise<Cell> {
  const compiledPath = `${PATH_CONTRACTS_JETTON}/JettonWallet.compiled.json`
  const compiled = JSON.parse(readFileSync(compiledPath, 'utf8'))
  const hex = compiled.hex
  if (!hex) {
    throw new Error('Compiled JettonWallet code hex not found in JSON')
  }
  // Remove 0x prefix if present
  const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex
  const boc = Buffer.from(hexStr, 'hex')
  return Cell.fromBoc(boc)[0]
}
