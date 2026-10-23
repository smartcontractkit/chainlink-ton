import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, toNano } from '@ton/core'

import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { createEmptyCursePolicy } from '../../../wrappers/ccip/Router'
import * as cct from '../../../wrappers/gen/ccip/cct/JettonMinter'
import {
  Ownable2Step,
  TokenPool,
  TokenPool_Data,
  TokenPool_AdminConfig,
  TokenPool_DynamicConfig,
  TokenPool_LocalPolicy,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { JettonClient, BurnMintTokenPool } from '../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployCctHarness } from '../harness'
import {
  assertWalletFeeCoversHop,
  internalTxTo,
  runTokenPoolGasCalibration,
  walletHopByInternalTransfer,
} from './gas'

// BurnMint↔CCT: burns on the source chain, mints on the destination. The pool budget here is the
// CCT mint op budget (mint path) plus the reference transfer budget (custody/recovery).
runTokenPoolGasCalibration({
  name: 'BurnMint↔CCT',
  setup: async (blockchain: Blockchain, deployer: SandboxContract<TreasuryContract>) => {
    const cctWalletCode = await contractCode.ccip.local('ccip.cct.JettonWallet')
    const cctMinterCode = await contractCode.ccip.local('ccip.cct.JettonMinter')
    const burnMintPoolCode = await contractCode.ccip.local('ccip.pool.BurnMintTokenPool')

    const cctMinter = blockchain.openContract(
      cct.JettonMinter.fromStorage(
        cct.MinterStorage.create({
          totalSupply: 0n,
          adminAddress: deployer.address,
          nextAdminAddress: null,
          jettonWalletCode: cctWalletCode,
          metadataUri: 'cct-gas',
        }),
        { overrideContractCode: cctMinterCode },
      ),
    )
    await cctMinter.sendDeploy(deployer.getSender(), toNano('1'))
    const cctMinterRuntime = blockchain.openContract(
      JettonMinter.createFromAddress(cctMinter.address),
    )

    const burnMintPool = blockchain.openContract(
      BurnMintTokenPool.fromStorage(
        {
          poolData: TokenPool_Data.create({
            adminConfig: TokenPool_AdminConfig.create({
              ownable: Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
              dynamicConfig: TokenPool_DynamicConfig.create({
                router: deployer.address,
                rateLimitAdmin: null,
                feeAdmin: null,
              }),
              allowedDepositNamespaces: new Set(),
              jettonClient: JettonClient.create({
                masterAddress: cctMinter.address,
                jettonWalletCode: cctWalletCode,
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
        },
        { overrideContractCode: burnMintPoolCode },
      ),
    )
    await burnMintPool.sendDeploy(deployer.getSender(), toNano('2'))

    // Seed deployer balance before handing minter admin to the pool.
    await cctMinterRuntime.sendMint(deployer.getSender(), {
      value: toNano('1'),
      mintOpcode: 0x00000015,
      message: {
        queryId: 101n,
        destination: deployer.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
    // The pool must own the minter to mint on the release path.
    await cctMinterRuntime.sendChangeAdmin(deployer.getSender(), {
      value: toNano('0.2'),
      message: { queryId: 201n, newAdmin: burnMintPool.address },
    })
    await burnMintPool.sendBurnMintTokenPoolClaimMinterAdmin(deployer.getSender(), toNano('0.2'), {
      queryId: 202n,
    })

    const harness = await deployCctHarness(blockchain, deployer)

    return {
      pool: blockchain.openContract(TokenPool.fromAddress(burnMintPool.address)),
      localToken: cctMinter.address,
      getWalletAddress: (owner: Address) => cctMinterRuntime.getWalletAddress(owner),
      readBudget: async () => ({
        admissionGasUnits: Number(await harness.getCcipAdmissionGasUnits()),
        minValueGasUnits: Number(await harness.getCcipMinValueGasUnits()),
      }),
      assertTokenBudget: async (kind, result) => {
        if (kind === 'lock') {
          // The user funds the inbound wallet hop; the reference fee model must still cover it.
          await assertWalletFeeCoversHop(harness, walletHopByInternalTransfer(result), false)
          return
        }
        // Release: the mint passes through the minter, which keeps nothing (its storage reserve is
        // pre-funded), and the reference fee model covers the minter → account hop.
        const minterTx = internalTxTo(result, cctMinter.address)
        const sent = [...minterTx.outMessages.values()].reduce(
          (sum: bigint, m: any) => sum + m.info.value.coins + m.info.forwardFee,
          0n,
        )
        const retained = minterTx.inMessage.info.value.coins - sent - minterTx.totalFees.coins
        console.table([{ operation: 'minter retained on mint (nTON)', value: retained }])
        expect(retained).toBeGreaterThanOrEqual(0n)
        expect(retained).toBeLessThanOrEqual(toNano('0.0005'))
        await assertWalletFeeCoversHop(harness, walletHopByInternalTransfer(result), false)
      },
    }
  },
})
