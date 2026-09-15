import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, toNano } from '@ton/core'
import { crc32 } from 'zlib'

import { contractCode } from '../../../wrappers/codeLoader'
import {
  AccessControl_Data,
  JettonLockBox,
  JettonLockBox_Init,
} from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { ContractClient as AccessControlClient } from '../../../wrappers/lib/access/AccessControl'

// Role constants on the JettonLockBox RBAC.
export const OPERATOR_ROLE_VALUE = BigInt(
  '0x' + crc32('OPERATOR_ROLE').toString(16).padStart(8, '0'),
)
export const DEFAULT_ADMIN_ROLE = 0n

// Create an empty AccessControl_Data (no roles initialized yet).
export function emptyAccessControlData(): AccessControl_Data {
  return AccessControl_Data.create({ roles: new Map() })
}

/**
 * Builds (but does not deploy) a JettonLockBox.
 *
 * Kept separate from `initJettonLockBox` so callers can obtain `lockbox.address`
 * before deploying: the LockReleaseLockboxTokenPool keeps the lockbox address in
 * its own storage, so the lockbox address is needed to build the pool — while the
 * pool address is needed to grant OPERATOR_ROLE on the lockbox.
 */
export async function buildJettonLockBox(opts: {
  blockchain: Blockchain
  minterAddress: Address
  id?: bigint
}): Promise<SandboxContract<JettonLockBox>> {
  const code = await contractCode.ccip.local('ccip.pool.JettonLockBox')
  return opts.blockchain.openContract(
    JettonLockBox.fromStorage(
      {
        id: opts.id ?? 0n,
        minterAddress: opts.minterAddress,
        walletAddress: null,
        rbac: emptyAccessControlData(),
      },
      { overrideContractCode: code },
    ),
  )
}

/**
 * Deploys + initializes a JettonLockBox and grants OPERATOR_ROLE to `operator`
 * (normally the pool) so it can deposit/withdraw.
 *
 * The grant must happen *after* init, because the init handler rebuilds the RBAC
 * data (it sets the OPERATOR_ROLE admin on the fly).
 *
 * Returns the lockbox's own jetton wallet address, which is what the pool will
 * be transacting with.
 */
export async function initJettonLockBox(opts: {
  deployer: SandboxContract<TreasuryContract>
  lockbox: SandboxContract<JettonLockBox>
  minterAddress: Address
  operator: Address
  /** Resolve an owner's jetton wallet address from the minter. */
  resolveWalletAddress: (owner: Address) => Promise<Address>
  deployValue?: bigint
  initValue?: bigint
}): Promise<Address> {
  const { deployer, lockbox, minterAddress, operator } = opts

  await lockbox.sendDeploy(deployer.getSender(), opts.deployValue ?? toNano('3'))

  const walletAddress = await opts.resolveWalletAddress(lockbox.address)
  const initResult = await lockbox.sendJettonLockBoxInit(
    deployer.getSender(),
    opts.initValue ?? toNano('0.2'),
    JettonLockBox_Init.create({
      queryId: 1n,
      minterAddress,
      walletAddress,
      admin: deployer.address,
    }),
  )
  expect(initResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: lockbox.address,
    success: true,
  })

  return walletAddress
}

/** Grants OPERATOR_ROLE on the lockbox. Must be called after `initJettonLockBox`. */
export async function grantLockBoxOperatorRole(opts: {
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  lockbox: SandboxContract<JettonLockBox>
  operator: Address
}): Promise<void> {
  const acClient = opts.blockchain.openContract(
    AccessControlClient.createFromAddress(opts.lockbox.address),
  )
  const grantResult = await acClient.sendGrantRole(opts.deployer.getSender(), toNano('0.1'), {
    queryId: 0n,
    role: OPERATOR_ROLE_VALUE,
    account: opts.operator,
  })
  expect(grantResult.transactions).toHaveTransaction({
    from: opts.deployer.address,
    to: opts.lockbox.address,
    success: true,
  })
}
