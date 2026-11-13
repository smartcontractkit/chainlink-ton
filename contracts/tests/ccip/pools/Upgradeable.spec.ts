import '@ton/test-utils'
import { Address, Cell, Message, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import { createEmptyCursePolicy } from '../../../wrappers/ccip/Router'
import { contractCode } from '../../../wrappers/codeLoader'
import {
  BurnMintTokenPool,
  JettonClient,
  Ownable2Step,
  TokenPool_AdminConfig,
  TokenPool_Data,
  TokenPool_DynamicConfig,
  TokenPool_LocalPolicy,
  Upgradeable_Upgrade,
} from '../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import { LockReleaseLockboxTokenPool } from '../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import {
  AccessControl_Data,
  AccessControl_RoleData,
  JettonLockBox,
} from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { UpgradeTarget } from '../../../wrappers/gen/test/UpgradeTarget'

function makePoolData(owner: Address): TokenPool_Data {
  return TokenPool_Data.create({
    adminConfig: TokenPool_AdminConfig.create({
      ownable: Ownable2Step.create({ owner, pendingOwner: null }),
      dynamicConfig: TokenPool_DynamicConfig.create({
        router: owner,
        rateLimitAdmin: null,
        feeAdmin: null,
      }),
      allowedDepositNamespaces: new Set(),
      jettonClient: JettonClient.create({
        masterAddress: owner,
        jettonWalletCode: Cell.EMPTY,
      }),
      allowedFinalityConfig: 0n,
      advancedPoolHooks: null,
    }),
    localPolicy: TokenPool_LocalPolicy.create({
      cursePolicy: createEmptyCursePolicy(owner),
    }),
    tokenDecimals: 9n,
    remoteChainConfigs: new Map(),
    tokenTransferFeeConfigs: new Map(),
  })
}

function makeLockBoxAccessControl(admin: Address): AccessControl_Data {
  return AccessControl_Data.create({
    roles: new Map([
      [
        0n,
        AccessControl_RoleData.create({
          adminRole: 0n,
          membersLen: 1n,
          hasRole: new Map([[admin, true]]),
        }),
      ],
    ]),
  })
}

function findUpgradeEvent(result: { transactions: any[] }, contract: Address) {
  const tx = result.transactions.find(
    (candidate) =>
      candidate.inMessage?.info.type === 'internal' &&
      candidate.inMessage.info.dest.equals(contract),
  )
  const event = tx?.outMessages.values().find((msg: Message) => msg.info.type === 'external-out')
  return event ? upgradeable.builder.event.upgraded.load(event.body.beginParse()) : undefined
}

async function activeState(blockchain: Blockchain, address: Address) {
  const state = (await blockchain.getContract(address)).accountState
  if (state?.type !== 'active' || !state.state.code || !state.state.data) {
    throw new Error(`${address} is not active`)
  }
  return {
    code: state.state.code,
    data: state.state.data,
  }
}

describe('Upgradeable token pools and lockbox', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let nonOwner: SandboxContract<TreasuryContract>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = 1
    owner = await blockchain.treasury('owner')
    nonOwner = await blockchain.treasury('nonOwner')
  })

  describe('BurnMintTokenPool', () => {
    let pool: SandboxContract<BurnMintTokenPool>
    let targetCode: Cell

    beforeEach(async () => {
      const code = await contractCode.ccip.local('ccip.pool.BurnMintTokenPool')
      targetCode = await contractCode.ccip.local('UpgradeTarget')
      pool = blockchain.openContract(
        BurnMintTokenPool.fromStorage(
          { poolData: makePoolData(owner.address) },
          { overrideContractCode: code },
        ),
      )
      const deployed = await pool.sendDeploy(owner.getSender(), toNano('1'))
      expect(deployed.transactions).toHaveTransaction({
        from: owner.address,
        to: pool.address,
        deploy: true,
        success: true,
      })
    })

    it('rejects an upgrade from a non-owner', async () => {
      const result = await pool.sendUpgradeableUpgrade(nonOwner.getSender(), toNano('0.1'), {
        queryId: 1n,
        code: targetCode,
      })

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: pool.address,
        success: false,
        exitCode: BurnMintTokenPool.Errors['Ownable2Step_Error.OnlyCallableByOwner'],
      })
    })

    it('upgrades and migrates the pool storage when the owner requests it', async () => {
      const before = await activeState(blockchain, pool.address)
      const result = await pool.sendUpgradeableUpgrade(owner.getSender(), toNano('0.1'), {
        queryId: 2n,
        code: targetCode,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: pool.address,
        op: Upgradeable_Upgrade.PREFIX,
        success: true,
      })

      const event = findUpgradeEvent(result, pool.address)
      expect(event?.version).toBe('2.0.0')
      expect(event?.code).toEqualCell(targetCode)
      expect(event?.codeHash).toBe(BigInt('0x' + targetCode.hash().toString('hex')))

      const after = await activeState(blockchain, pool.address)
      expect(after.code).toEqualCell(targetCode)

      const upgraded = blockchain.openContract(UpgradeTarget.fromAddress(pool.address))
      expect(await upgraded.getPreviousStorage()).toEqualCell(before.data)
    })
  })

  describe('LockReleaseLockboxTokenPool', () => {
    let pool: SandboxContract<LockReleaseLockboxTokenPool>
    let targetCode: Cell

    beforeEach(async () => {
      const code = await contractCode.ccip.local('ccip.pool.LockReleaseLockboxTokenPool')
      targetCode = await contractCode.ccip.local('UpgradeTarget')
      pool = blockchain.openContract(
        LockReleaseLockboxTokenPool.fromStorage(
          { poolData: makePoolData(owner.address), lockbox: owner.address },
          { overrideContractCode: code },
        ),
      )
      const deployed = await pool.sendDeploy(owner.getSender(), toNano('1'))
      expect(deployed.transactions).toHaveTransaction({
        from: owner.address,
        to: pool.address,
        deploy: true,
        success: true,
      })
    })

    it('rejects an upgrade from a non-owner', async () => {
      const result = await pool.sendUpgradeableUpgrade(nonOwner.getSender(), toNano('0.1'), {
        queryId: 1n,
        code: targetCode,
      })

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: pool.address,
        success: false,
        exitCode: LockReleaseLockboxTokenPool.Errors['Ownable2Step_Error.OnlyCallableByOwner'],
      })
    })

    it('upgrades and migrates the pool storage when the owner requests it', async () => {
      const before = await activeState(blockchain, pool.address)
      const result = await pool.sendUpgradeableUpgrade(owner.getSender(), toNano('0.1'), {
        queryId: 2n,
        code: targetCode,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: pool.address,
        op: Upgradeable_Upgrade.PREFIX,
        success: true,
      })

      const event = findUpgradeEvent(result, pool.address)
      expect(event?.version).toBe('2.0.0')
      expect(event?.code).toEqualCell(targetCode)

      const after = await activeState(blockchain, pool.address)
      expect(after.code).toEqualCell(targetCode)

      const upgraded = blockchain.openContract(UpgradeTarget.fromAddress(pool.address))
      expect(await upgraded.getPreviousStorage()).toEqualCell(before.data)
    })
  })

  describe('JettonLockBox', () => {
    let lockbox: SandboxContract<JettonLockBox>
    let targetCode: Cell

    beforeEach(async () => {
      const code = await contractCode.ccip.local('ccip.pool.JettonLockBox')
      targetCode = await contractCode.ccip.local('UpgradeTarget')
      lockbox = blockchain.openContract(
        JettonLockBox.fromStorage(
          {
            id: 1n,
            minterAddress: owner.address,
            walletAddress: null,
            initializer: owner.address,
            rbac: makeLockBoxAccessControl(owner.address),
          },
          { overrideContractCode: code },
        ),
      )
      const deployed = await lockbox.sendDeploy(owner.getSender(), toNano('1'))
      expect(deployed.transactions).toHaveTransaction({
        from: owner.address,
        to: lockbox.address,
        deploy: true,
        success: true,
      })
    })

    it('rejects an upgrade from a non-admin', async () => {
      const result = await lockbox.sendUpgradeableUpgrade(nonOwner.getSender(), toNano('0.1'), {
        queryId: 1n,
        code: targetCode,
      })

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: lockbox.address,
        success: false,
        exitCode: JettonLockBox.Errors['AccessControl_Error.UnauthorizedAccount'],
      })
    })

    it('upgrades the lockbox when an admin requests it', async () => {
      const before = await activeState(blockchain, lockbox.address)
      const result = await lockbox.sendUpgradeableUpgrade(owner.getSender(), toNano('0.1'), {
        queryId: 2n,
        code: targetCode,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: lockbox.address,
        op: Upgradeable_Upgrade.PREFIX,
        success: true,
      })

      const event = findUpgradeEvent(result, lockbox.address)
      expect(event?.version).toBe('2.0.0')
      expect(event?.code).toEqualCell(targetCode)

      const after = await activeState(blockchain, lockbox.address)
      expect(after.code).toEqualCell(targetCode)

      const upgraded = blockchain.openContract(UpgradeTarget.fromAddress(lockbox.address))
      expect(await upgraded.getPreviousStorage()).toEqualCell(before.data)
    })
  })
})
