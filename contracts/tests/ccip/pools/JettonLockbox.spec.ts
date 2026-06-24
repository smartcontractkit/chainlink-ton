import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano, Dictionary } from '@ton/core'
import { crc32 } from 'zlib'
import { JettonMinter } from '../../../wrappers/jetton/JettonMinter'
import { JettonWallet } from '../../../wrappers/jetton/JettonWallet'
import * as jetton from '../../../wrappers/jetton/JettonCode'
import {
  AccessControl_Data,
  JettonLockbox,
  JettonLockbox_Init,
  JettonLockbox_Deposit,
  JettonLockbox_Withdraw,
} from '../../../wrappers/gen/ccip/pools/JettonLockbox'
import { ContractClient as AccessControlClient } from '../../../wrappers/lib/access/AccessControl'
import { setupGenBindings } from '../../../wrappers/gen'

const OPERATOR_ROLE_VALUE = BigInt('0x' + crc32('OPERATOR_ROLE').toString(16).padStart(8, '0'))

// Create an empty AccessControl_Data (no roles initialized yet)
function emptyAccessControlData(): AccessControl_Data {
  return {
    $: 'AccessControl_Data',
    // Empty dict: runtime serialization works correctly regardless of type param
    roles: Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()) as any,
  }
}

describe('JettonLockbox', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let operator: SandboxContract<TreasuryContract>
  let unauthorized: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let jettonMinter: SandboxContract<JettonMinter>
  let lockbox: SandboxContract<JettonLockbox>

  let operatorWallet: SandboxContract<JettonWallet>
  let lockboxWallet: SandboxContract<JettonWallet>

  const remoteChainSelector = 91000001n

  beforeAll(async () => {
    setupGenBindings()
  })

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    operator = await blockchain.treasury('operator')
    unauthorized = await blockchain.treasury('unauthorized')
    recipient = await blockchain.treasury('recipient')

    // Deploy jetton minter
    const jettonWalletCode = await jetton.JettonWalletCode()
    const jettonMinterCode = await jetton.JettonMinterCode()

    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          transferAdmin: null,
          walletCode: jettonWalletCode,
          jettonContent: beginCell().storeStringTail('lockbox-test').endCell(),
          totalSupply: 0n,
        },
        jettonMinterCode,
      ),
    )
    await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))

    // Mint jettons to operator
    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('0.5'),
      message: {
        queryId: 1n,
        destination: operator.address,
        tonAmount: toNano('0.1'),
        jettonAmount: toNano('1000'),
        from: deployer.address,
        responseDestination: null,
      },
    })

    // Get operator's jetton wallet
    const operatorWalletAddress = await jettonMinter.getWalletAddress(operator.address)
    operatorWallet = blockchain.openContract(JettonWallet.createFromAddress(operatorWalletAddress))

    // Create lockbox using fromStorage (handles serialization correctly)
    // walletAddress starts as null — will be set via init message
    lockbox = blockchain.openContract(
      JettonLockbox.fromStorage({
        minterAddress: jettonMinter.address,
        walletAddress: null,
        id: 0n,
        rbac: emptyAccessControlData(),
      }),
    )

    // Compute the real jetton wallet address for the lockbox
    const lockboxWalletAddress = await jettonMinter.getWalletAddress(lockbox.address)
    lockboxWallet = blockchain.openContract(JettonWallet.createFromAddress(lockboxWalletAddress))

    // Deploy lockbox with init message (StateInit attached via fromStorage)
    const deployResult = await lockbox.sendJettonLockboxInit(
      deployer.getSender(),
      toNano('10'), // Extra TON for init reply message
      JettonLockbox_Init.create({
          queryId: 100n,
          minterAddress: jettonMinter.address,
          walletAddress: lockboxWalletAddress,
          admin: deployer.address,
        }),
    )
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockbox.address,
      success: true,
    })

    // Grant OPERATOR_ROLE to operator using AccessControl client
    const acClient = blockchain.openContract(AccessControlClient.createFromAddress(lockbox.address))
    await acClient.sendGrantRole(
      deployer.getSender(),
      toNano('0.1'),
      {
        queryId: 1n,
        role: OPERATOR_ROLE_VALUE,
        account: operator.address,
      },
    )
  })

  describe('initialization', () => {
    it('should set token address correctly', async () => {
      const token = await lockbox.getToken()
      expect(token).toEqualAddress(jettonMinter.address)
    })

    it('should set wallet address correctly', async () => {
      const wallet = await lockbox.getWallet()
      expect(wallet).toEqualAddress(lockboxWallet.address)
    })

    it('should return correct type and version', async () => {
      const [type, version] = await lockbox.getTypeAndVersion()
      expect(type.loadStringTail()).toBe('link.chain.ton.ccip.JettonLockbox')
      expect(version.loadStringTail()).toBe('0.1.0')
    })

    it('should recognize supported token', async () => {
      const supported = await lockbox.getIsSupportedToken(jettonMinter.address)
      expect(supported).toBe(true)

      const unsupported = await lockbox.getIsSupportedToken(deployer.address)
      expect(unsupported).toBe(false)
    })

    it('should grant DEFAULT_ADMIN_ROLE to owner', async () => {
      const hasRole = await lockbox.getHasRole(0n, deployer.address)
      expect(hasRole).toBe(true)
    })

    it('should have operator with OPERATOR_ROLE after grant', async () => {
      const hasRole = await lockbox.getHasRole(OPERATOR_ROLE_VALUE, operator.address)
      expect(hasRole).toBe(true)
    })
  })

  describe('deposit', () => {
    it('should accept deposit via jetton transfer → TransferNotificationForRecipient', async () => {
      const amount = toNano('10')
      const queryId = 200n

      // Build deposit payload in forward payload
      const depositPayload = JettonLockbox_Deposit.toCell(JettonLockbox_Deposit.create({
        queryId,
        token: jettonMinter.address,
        remoteChainSelector,
        amount,
      }))

      // Operator transfers jettons TO lockbox via jetton wallet.
      // The jetton flow:
      // 1. Operator sends Transfer to operatorWallet
      // 2. operatorWallet sends InternalTransfer to lockboxWallet
      // 3. lockboxWallet sends TransferNotificationForRecipient to lockbox
      const result = await operatorWallet.sendTransfer(operator.getSender(), {
        value: toNano('0.2'),
        message: {
          queryId: Number(queryId),
          jettonAmount: amount,
          destination: lockbox.address,
          responseDestination: operator.address,
          customPayload: null,
          forwardTonAmount: toNano('0.05'),
          forwardPayload: depositPayload,
        },
      })

      // Verify the jetton transfer chain was initiated
      expect(result.transactions).toHaveTransaction({
        from: operator.address,
        to: operatorWallet.address,
        success: true,
      })

      // Verify TransferNotificationForRecipient was delivered to lockbox
      expect(result.transactions).toHaveTransaction({
        from: lockboxWallet.address,
        to: lockbox.address,
        success: true,
      })
    })
  })

  describe('withdraw', () => {
    it('should reject withdraw from unauthorized caller', async () => {
      const withdrawMsg = JettonLockbox_Withdraw.toCell(JettonLockbox_Withdraw.create({
        queryId: 300n,
        token: jettonMinter.address,
        remoteChainSelector,
        amount: toNano('5'),
        recipientWallet: recipient.address,
      }))

      // Send external withdraw message from unauthorized account
      await blockchain.provider(lockbox.address).external(withdrawMsg)

      // TODO: verify failure due to AccessControl unauthorized error
    })

    it('should send AskToTransfer on authorized withdraw', async () => {
      const withdrawMsg = JettonLockbox_Withdraw.toCell(JettonLockbox_Withdraw.create({
        queryId: 301n,
        token: jettonMinter.address,
        remoteChainSelector,
        amount: toNano('5'),
        recipientWallet: recipient.address,
      }))

      // Operator sends withdraw request via external message (simulating on-chain sender)
      const result = await blockchain.provider(lockbox.address).external(withdrawMsg)

      // TODO: verify AskToTransfer was sent to lockboxWallet
      // TODO: verify Withdraw event emitted
    })
  })

  describe('role management', () => {
    it('should allow admin to grant roles', async () => {
      const newOperator = await blockchain.treasury('newOperator')

      // Use AccessControl client to grant role
      const acClient = blockchain.openContract(AccessControlClient.createFromAddress(lockbox.address))
      await acClient.sendGrantRole(
        deployer.getSender(),
        toNano('0.1'),
        {
          queryId: 2n,
          role: OPERATOR_ROLE_VALUE,
          account: newOperator.address,
        },
      )

      const hasRole = await lockbox.getHasRole(OPERATOR_ROLE_VALUE, newOperator.address)
      expect(hasRole).toBe(true)
    })

    it('should reject role grant from non-admin', async () => {
      const acClient = blockchain.openContract(AccessControlClient.createFromAddress(lockbox.address))
      await acClient.sendGrantRole(
        operator.getSender(), // operator is NOT admin, should fail
        toNano('0.1'),
        {
          queryId: 3n,
          role: OPERATOR_ROLE_VALUE,
          account: recipient.address,
        },
      )

      // Verify recipient does NOT have the role (grant should have failed)
      const hasRole = await lockbox.getHasRole(OPERATOR_ROLE_VALUE, recipient.address)
      expect(hasRole).toBe(false)
    })
  })

  describe('bounce handler', () => {
    it('should send error message to initiator on bounced AskToTransfer', async () => {
      // TODO: simulate AskToTransfer bounce and verify JettonLockbox_WithdrawFailed sent
      // This requires mocking a bouncing jetton wallet or using sandbox capabilities
    })
  })
})
