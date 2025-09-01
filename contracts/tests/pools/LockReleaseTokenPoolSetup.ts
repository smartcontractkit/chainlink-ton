import '@ton/test-utils'

import { Address, toNano } from '@ton/core'
import { SandboxContract } from '@ton/sandbox'
import { crc32 } from 'zlib'
import { BaseTokenPoolTest } from './BaseTest'
import { lockReleaseTokenPool } from '../../wrappers/pools'
import { ac } from '../../wrappers/lib/access'
import { callproxy } from '../../wrappers/mcms'
import { JettonClientConfig } from '../../wrappers/examples/jetton'
import { ZERO_ADDRESS } from '../../src/utils'

export type TestContracts = {
  ac: SandboxContract<ac.ContractClient>
  lockReleaseTokenPool: SandboxContract<lockReleaseTokenPool.ContractClient>
}

export class LockReleaseTokenPoolSetup extends BaseTokenPoolTest {
  // Test configuration following Solidity setup
  static readonly DEFAULT_TOKEN_DECIMALS = 18
  static readonly DEST_CHAIN_SELECTOR = 2n
  static readonly SOURCE_CHAIN_SELECTOR = 1n

  // Contract instances
  lockReleaseTokenPool?: SandboxContract<lockReleaseTokenPool.ContractClient>
  lockReleaseTokenPoolWithAllowList?: SandboxContract<lockReleaseTokenPool.ContractClient>

  // Addresses following Solidity test pattern
  allowedOnRamp!: Address
  allowedOffRamp!: Address
  destPoolAddress!: Address
  sourcePoolAddress!: Address
  allowedList: Address[] = []

  constructor() {
    super()
  }

  /**
   * Setup method that replicates the Solidity setUp function
   */
  async setUp(testId: string = 'lock-release-pool-test'): Promise<void> {
    // Run base setup first (equivalent to super.setUp())
    await this.setupBasics(testId)

    // Create addresses (equivalent to Solidity address assignments)
    this.allowedOnRamp = await this.makeAddr('allowedOnRamp') // address(123) equivalent
    this.allowedOffRamp = await this.makeAddr('allowedOffRamp') // address(234) equivalent
    this.destPoolAddress = await this.makeAddr('destPoolAddress') // address(2736782345) equivalent
    this.sourcePoolAddress = await this.makeAddr('sourcePoolAddress') // address(53852352095) equivalent

    // Deal tokens to owner (equivalent to deal(address(s_token), OWNER, type(uint256).max))
    await this.dealTokens(this.acc.owner.address, 10n ** 27n) // Large amount for testing

    // Setup the main LockReleaseTokenPool
    await this.setupLockReleaseTokenPool(testId)
    await this.deployLockReleaseTokenPool()

    // Setup allowList and create pool with allowlist
    await this.setupAllowList()
    await this.setupLockReleaseTokenPoolWithAllowList(testId)
    await this.deployLockReleaseTokenPoolWithAllowList()

    // Apply chain updates (equivalent to s_lockReleaseTokenPool.applyChainUpdates)
    await this.applyChainUpdates()

    // Set rebalancer (equivalent to s_lockReleaseTokenPool.setRebalancer(OWNER))
    await this.setInitialRebalancer()

    // Setup router ramp updates (equivalent to s_sourceRouter.applyRampUpdates)
    await this.setupRouterRamps()
  }

  /**
   * Setup the main LockReleaseTokenPool contract
   */
  async setupLockReleaseTokenPool(testId: string): Promise<void> {
    const contractData = lockReleaseTokenPool.builder.data.contractDataEmpty(
      crc32(`lock-release-pool-${testId}`),
      this.acc.owner.address,
      {
        masterAddress: this.bind.jettonMinter.address,
        jettonWalletCode: this.code.jettonWallet,
      },
      LockReleaseTokenPoolSetup.DEFAULT_TOKEN_DECIMALS,
      ZERO_ADDRESS, // Mock RMN address
      ZERO_ADDRESS, // Mock Router address
    )

    this.bind.lockReleaseTokenPool = this.blockchain.openContract(
      lockReleaseTokenPool.ContractClient.newFrom(contractData, this.code.lockReleaseTokenPool),
    )
  }

  /**
   * Deploy the main LockReleaseTokenPool contract
   */
  async deployLockReleaseTokenPool(): Promise<void> {
    const deployResult = await this.bind.lockReleaseTokenPool.sendDeploy(
      this.acc.deployer.getSender(),
      toNano('1'),
    )

    console.log('deployResult', deployResult.transactions)

    expect(deployResult.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.lockReleaseTokenPool.address,
      deploy: true,
    })

    const topUpResult = await this.bind.lockReleaseTokenPool.sendTopUp(
      this.acc.deployer.getSender(),
      toNano('1'),
      { queryId: 1n },
    )
  }

  /**
   * Setup the allowlist (equivalent to s_allowedList.push operations)
   */
  async setupAllowList(): Promise<void> {
    this.allowedList = [
      await this.makeAddr('randomAddress'), // vm.randomAddress() equivalent
      this.acc.owner.address,
    ]
  }

  /**
   * Setup LockReleaseTokenPool with allowlist
   */
  async setupLockReleaseTokenPoolWithAllowList(testId: string): Promise<void> {
    const contractData = lockReleaseTokenPool.builder.data.contractDataEmpty(
      crc32(`lock-release-pool-allowlist-${testId}`),
      this.acc.owner.address,
      {
        masterAddress: this.bind.jettonMinter.address,
        jettonWalletCode: this.code.jettonWallet,
      },
      LockReleaseTokenPoolSetup.DEFAULT_TOKEN_DECIMALS,
      await this.makeAddr('mockRMN'),
      await this.makeAddr('sourceRouter'),
    )

    this.lockReleaseTokenPoolWithAllowList = this.blockchain.openContract(
      lockReleaseTokenPool.ContractClient.newFrom(contractData, this.code.lockReleaseTokenPool),
    )
  }

  /**
   * Deploy the allowlist LockReleaseTokenPool contract
   */
  async deployLockReleaseTokenPoolWithAllowList(): Promise<void> {
    const deployResult = await this.lockReleaseTokenPoolWithAllowList!.sendTopUp(
      this.acc.deployer.getSender(),
      toNano('0.05'),
      { queryId: 1n },
    )

    expect(deployResult.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.lockReleaseTokenPoolWithAllowList!.address,
      deploy: true,
      success: true,
    })
  }

  /**
   * Apply chain updates to both pools (equivalent to applyChainUpdates calls)
   */
  async applyChainUpdates(): Promise<void> {
    // TODO: Implement chain updates when the wrapper supports it
    // This would be equivalent to:
    // bytes[] memory remotePoolAddresses = new bytes[](1);
    // remotePoolAddresses[0] = abi.encode(s_destPoolAddress);
    // TokenPool.ChainUpdate[] memory chainUpdate = new TokenPool.ChainUpdate[](1);
    // chainUpdate[0] = TokenPool.ChainUpdate({...});
    // s_lockReleaseTokenPool.applyChainUpdates(new uint64[](0), chainUpdate);

    console.warn('Chain updates not yet implemented - waiting for full TokenPool functionality')
  }

  /**
   * Set initial rebalancer (equivalent to s_lockReleaseTokenPool.setRebalancer(OWNER))
   */
  async setInitialRebalancer(): Promise<void> {
    const setRebalancerResult = await this.bind.lockReleaseTokenPool.sendSetRebalancer(
      this.acc.owner.getSender(),
      toNano('0.05'),
      {
        queryId: 1n,
        rebalancer: this.acc.owner.address,
      },
    )

    expect(setRebalancerResult.transactions).toHaveTransaction({
      from: this.acc.owner.address,
      to: this.bind.lockReleaseTokenPool.address,
      success: true,
    })
  }

  /**
   * Setup router ramp updates (equivalent to s_sourceRouter.applyRampUpdates)
   */
  async setupRouterRamps(): Promise<void> {
    // TODO: Implement router ramp updates when Router wrapper is available
    // This would be equivalent to:
    // Router.OnRamp[] memory onRampUpdates = new Router.OnRamp[](1);
    // Router.OffRamp[] memory offRampUpdates = new Router.OffRamp[](1);
    // onRampUpdates[0] = Router.OnRamp({destChainSelector: DEST_CHAIN_SELECTOR, onRamp: s_allowedOnRamp});
    // offRampUpdates[0] = Router.OffRamp({sourceChainSelector: SOURCE_CHAIN_SELECTOR, offRamp: s_allowedOffRamp});
    // s_sourceRouter.applyRampUpdates(onRampUpdates, new Router.OffRamp[](0), offRampUpdates);

    console.warn('Router ramp updates not yet implemented - waiting for Router wrapper')
  }

  /**
   * Get the allowlist LockReleaseTokenPool contract instance
   */
  getLockReleaseTokenPoolWithAllowList(): SandboxContract<lockReleaseTokenPool.ContractClient> {
    if (!this.lockReleaseTokenPoolWithAllowList) {
      throw new Error('LockReleaseTokenPoolWithAllowList not initialized. Call setUp() first.')
    }
    return this.lockReleaseTokenPoolWithAllowList
  }

  /**
   * Get the outbound rate limiter config (helper from base class)
   */
  getOutboundRateLimiterConfig(): any {
    return {
      isEnabled: true,
      capacity: 100n * 10n ** 28n, // 100e28
      rate: 10n ** 15n, // 1e15
    }
  }

  /**
   * Get the inbound rate limiter config (helper from base class)
   */
  getInboundRateLimiterConfig(): any {
    return {
      isEnabled: true,
      capacity: 222n * 10n ** 30n, // 222e30
      rate: 10n ** 18n, // 1e18
    }
  }
}
