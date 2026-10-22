import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Dictionary, beginCell, toNano } from '@ton/core'

import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { WGRAM_MINT_OPCODE } from '../../../wrappers/wgram'
import { createEmptyCursePolicy } from '../../../wrappers/ccip/Router'
import {
  Ownable2Step,
  TokenPool,
  TokenPool_Data,
  TokenPool_AdminConfig,
  TokenPool_DynamicConfig,
  TokenPool_LocalPolicy,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import {
  JettonClient,
  LockReleaseLockboxTokenPool,
} from '../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import { JettonLockBox, AccessControl_Data } from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { ContractClient as AccessControlClient } from '../../../wrappers/lib/access/AccessControl'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployCctHarness } from '../harness'
import {
  assertWalletFeeCoversHop,
  runTokenPoolGasCalibration,
  walletHopByInternalTransfer,
} from './gas'

function emptyAccessControlData(): AccessControl_Data {
  return {
    $: 'AccessControl_Data',
    roles: Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()) as any,
  }
}

// LockRelease↔wGRAM: locks into a lockbox, releases from it. wGRAM wallets cost more than the CCT
// reference the pool budget is calibrated to, so the buffered transfer budget is exercised on real
// lock and release hops.
runTokenPoolGasCalibration({
  name: 'LockRelease↔wGRAM',
  setup: async (blockchain: Blockchain, deployer: SandboxContract<TreasuryContract>) => {
    const walletCode = await contractCode.ccip.local('wgram.JettonWallet')
    const minterCode = await contractCode.ccip.local('wgram.JettonMinter')

    const jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: null,
          transferAdmin: null,
          walletCode,
          jettonContent: beginCell().storeStringTail('wgram.pool.gas').endCell(),
          totalSupply: 0n,
        },
        minterCode,
      ),
    )
    await jettonMinter.sendTopUpTons(deployer.getSender(), toNano('0.01'))

    const jettonLockBox = blockchain.openContract(
      JettonLockBox.fromStorage(
        {
          id: 1n,
          minterAddress: jettonMinter.address,
          walletAddress: null,
          initializer: deployer.address,
          rbac: emptyAccessControlData(),
        },
        { overrideContractCode: await contractCode.ccip.local('ccip.pool.JettonLockBox') },
      ),
    )
    await jettonLockBox.sendDeploy(deployer.getSender(), toNano('3'))
    await jettonLockBox.sendJettonLockBoxInit(deployer.getSender(), toNano('0.2'), {
      queryId: 1n,
      minterAddress: jettonMinter.address,
      walletAddress: await jettonMinter.getWalletAddress(jettonLockBox.address),
      admin: deployer.address,
    })

    const lockReleasePool = blockchain.openContract(
      LockReleaseLockboxTokenPool.fromStorage(
        {
          poolData: TokenPool_Data.create({
            adminConfig: TokenPool_AdminConfig.create({
              ownable: Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
              dynamicConfig: TokenPool_DynamicConfig.create({
                router: deployer.address,
                rateLimitAdmin: null,
                feeAdmin: null,
                allowedDepositNamespaces: new Set(),
              }),
              jettonClient: JettonClient.create({
                masterAddress: jettonMinter.address,
                jettonWalletCode: walletCode,
              }),
              allowedFinalityConfig: 0n,
              advancedPoolHooks: null,
            }),
            localPolicy: TokenPool_LocalPolicy.create({
              cursePolicy: createEmptyCursePolicy(deployer.address),
            }),
            tokenDecimals: 9n,
            remoteChainConfigs: new Map(),
            tokenTransferFeeConfigs: new Map(),
          }),
          lockbox: jettonLockBox.address,
        },
        {
          overrideContractCode: await contractCode.ccip.local(
            'ccip.pool.LockReleaseLockboxTokenPool',
          ),
        },
      ),
    )
    await lockReleasePool.sendDeploy(deployer.getSender(), toNano('5'))

    const { crc32 } = require('zlib')
    const OPERATOR_ROLE = BigInt('0x' + crc32('OPERATOR_ROLE').toString(16).padStart(8, '0'))
    const acClient = blockchain.openContract(
      AccessControlClient.createFromAddress(jettonLockBox.address),
    )
    await acClient.sendGrantRole(deployer.getSender(), toNano('0.1'), {
      queryId: 0n,
      role: OPERATOR_ROLE,
      account: lockReleasePool.address,
    })

    // wGRAM is GRAM-backed: the mint value must cover the hosted backing plus transfer budget.
    const mintWgram = (destination: Address, jettonAmount: bigint) =>
      jettonMinter.sendMint(deployer.getSender(), {
        value: jettonAmount + toNano('1.3'),
        mintOpcode: WGRAM_MINT_OPCODE,
        message: {
          queryId: 0n,
          destination,
          tonAmount: toNano('1'),
          jettonAmount,
          from: null,
          responseDestination: deployer.address,
          forwardTonAmount: 0n,
        },
      })

    await mintWgram(deployer.address, toNano('10'))

    const harness = await deployCctHarness(blockchain, deployer)

    return {
      pool: blockchain.openContract(TokenPool.fromAddress(lockReleasePool.address)),
      localToken: jettonMinter.address,
      getWalletAddress: (owner: Address) => jettonMinter.getWalletAddress(owner),
      readBudget: async () => ({
        admissionGasUnits: Number(await harness.getCcipAdmissionGasUnits()),
        minValueGasUnits: Number(await harness.getCcipMinValueGasUnits()),
      }),
      // Fund lockbox custody so the release withdraw can transfer to the recipient account.
      fundForRelease: () => mintWgram(jettonLockBox.address, toNano('5')).then(() => undefined),
      assertTokenBudget: async (_kind, result) => {
        // Both lock (pool wallet → lockbox wallet) and release (lockbox wallet → account wallet)
        // hops are funded from the generic (doubled) fee model.
        await assertWalletFeeCoversHop(harness, walletHopByInternalTransfer(result), true)
      },
    }
  },
})
