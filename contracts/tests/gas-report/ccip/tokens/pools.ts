import { Address, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'

import { generateRandomContractId } from '../../../../src/utils'
import { contractCode } from '../../../../wrappers/codeLoader'
import { createEmptyCursePolicy } from '../../../../wrappers/ccip/Router'
import * as cct from '../../../../wrappers/gen/ccip/cct/JettonMinter'
import * as tp from '../../../../wrappers/gen/ccip/pools/TokenPool'
import * as bmp from '../../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import * as lrp from '../../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import { JettonLockBox } from '../../../../wrappers/gen/ccip/pools/JettonLockBox'
import {
  buildJettonLockBox,
  grantLockBoxOperatorRole,
  initJettonLockBox,
} from '../../../ccip/helpers/lockbox'

export type PoolKind = 'LockRelease' | 'BurnMint'
export const POOL_KINDS: PoolKind[] = ['LockRelease', 'BurnMint']

export interface TokenWithPool {
  kind: PoolKind
  minter: SandboxContract<cct.JettonMinter>
  pool: Address
  lockbox: SandboxContract<JettonLockBox> | null
  // Address the token admin registry expects as initiator of the release transfer (null for mints).
  transferInitiator: Address | null
}

// Deploys a CCT jetton and a token pool of the given kind for it. `mints` are minted before a
// burn-mint pool takes over the minter admin role; a lock-release pool gets `liquidity` in its lockbox.
export async function deployTokenWithPool(opts: {
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  kind: PoolKind
  router: Address
  remoteChainSelector: bigint
  remotePoolAddress: tp.CrossChainAddress
  remoteTokenAddress: tp.CrossChainAddress
  allowedDepositNamespaces?: Set<bigint>
  mints?: { to: Address; amount: bigint }[]
  liquidity?: bigint
}): Promise<TokenWithPool> {
  const { blockchain, deployer, kind } = opts
  const walletCode = await contractCode.ccip.local('ccip.cct.JettonWallet')

  const minter = blockchain.openContract(
    cct.JettonMinter.fromStorage(
      {
        totalSupply: 0n,
        adminAddress: deployer.address,
        nextAdminAddress: null,
        jettonWalletCode: walletCode,
        metadataUri: `gas-report-${kind}-${generateRandomContractId()}`,
      },
      { overrideContractCode: await contractCode.ccip.local('ccip.cct.JettonMinter') },
    ),
  )
  await minter.sendTopUpTons(deployer.getSender(), toNano('0.1'), {})

  const mint = async (to: Address, amount: bigint) => {
    const result = await minter.sendMintNewJettons(deployer.getSender(), toNano('1'), {
      mintRecipient: to,
      tonAmount: toNano('0.3'),
      internalTransferMsg: cct.InternalTransferStep.create({
        jettonAmount: amount,
        transferInitiator: deployer.address,
        sendExcessesTo: deployer.address,
        forwardTonAmount: 0n,
        forwardPayload: beginCell().storeBit(false).endCell().beginParse(),
      }),
    })
    expect(result.transactions).toHaveTransaction({ from: minter.address, success: true })
  }
  for (const { to, amount } of opts.mints ?? []) {
    await mint(to, amount)
  }

  const poolData = tp.TokenPool_Data.create({
    adminConfig: tp.TokenPool_AdminConfig.create({
      ownable: tp.Ownable2Step.create({ owner: deployer.address }),
      dynamicConfig: tp.TokenPool_DynamicConfig.create({
        router: opts.router,
        rateLimitAdmin: deployer.address,
        feeAdmin: deployer.address,
      }),
      allowedDepositNamespaces: opts.allowedDepositNamespaces ?? new Set(),
      jettonClient: tp.JettonClient.create({
        masterAddress: minter.address,
        jettonWalletCode: walletCode,
      }),
    }),
    localPolicy: tp.TokenPool_LocalPolicy.create({
      cursePolicy: createEmptyCursePolicy(deployer.address),
    }),
    tokenDecimals: 9n,
    remoteChainConfigs: new Map(),
    tokenTransferFeeConfigs: new Map(),
  })

  let pool: SandboxContract<lrp.LockReleaseLockboxTokenPool | bmp.BurnMintTokenPool>
  let lockbox: SandboxContract<JettonLockBox> | null = null
  if (kind === 'LockRelease') {
    lockbox = await buildJettonLockBox({
      blockchain,
      minterAddress: minter.address,
      initializer: deployer.address,
      id: generateRandomContractId(),
    })
    pool = blockchain.openContract(
      lrp.LockReleaseLockboxTokenPool.fromStorage(
        { poolData, lockbox: lockbox.address },
        {
          overrideContractCode: await contractCode.ccip.local(
            'ccip.pool.LockReleaseLockboxTokenPool',
          ),
        },
      ),
    )
    await initJettonLockBox({
      deployer,
      lockbox,
      minterAddress: minter.address,
      operator: pool.address,
      resolveWalletAddress: (owner) => minter.getWalletAddress(owner),
    })
    await grantLockBoxOperatorRole({ blockchain, deployer, lockbox, operator: pool.address })
    if (opts.liquidity) await mint(lockbox.address, opts.liquidity)
  } else {
    pool = blockchain.openContract(
      bmp.BurnMintTokenPool.fromStorage(
        { poolData },
        { overrideContractCode: await contractCode.ccip.local('ccip.pool.BurnMintTokenPool') },
      ),
    )
  }

  const deployResult = await pool.sendDeploy(deployer.getSender(), toNano('1'))
  expect(deployResult.transactions).toHaveTransaction({
    to: pool.address,
    deploy: true,
    success: true,
  })

  if (kind === 'BurnMint') {
    await minter.sendChangeMinterAdmin(deployer.getSender(), toNano('0.2'), {
      newAdminAddress: pool.address,
    })
    const claim = await (
      pool as SandboxContract<bmp.BurnMintTokenPool>
    ).sendBurnMintTokenPoolClaimMinterAdmin(deployer.getSender(), toNano('0.2'), {})
    expect(claim.transactions).toHaveTransaction({
      from: pool.address,
      to: minter.address,
      success: true,
    })
  }

  const rateLimit = tp.RateLimiter_Config.create({
    isEnabled: true,
    capacity: toNano('1000000'),
    rate: toNano('1000000'),
  })
  const chainUpdate = await pool.sendTokenPoolApplyChainUpdates(
    deployer.getSender(),
    toNano('0.2'),
    {
      remoteChainSelectorsToRemove: [],
      chainsToAdd: [
        tp.TokenPool_ChainUpdate.create({
          remoteChainSelector: opts.remoteChainSelector,
          remotePoolAddresses: [opts.remotePoolAddress],
          remoteTokenAddress: opts.remoteTokenAddress,
          rateLimitConfigs: tp.TokenPool_RateLimitConfigPair.create({
            outbound: rateLimit,
            inbound: rateLimit,
          }),
        }),
      ],
    },
  )
  expect(chainUpdate.transactions).toHaveTransaction({ to: pool.address, success: true })

  return {
    kind,
    minter,
    pool: pool.address,
    lockbox,
    transferInitiator: lockbox?.address ?? null,
  }
}
