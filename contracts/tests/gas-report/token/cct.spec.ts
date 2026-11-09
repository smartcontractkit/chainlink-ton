import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'

import * as cct from '../../../wrappers/gen/ccip/cct/JettonMinter'
import * as cctWallet from '../../../wrappers/gen/ccip/cct/JettonWallet'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployCctHarness } from '../harness'
import { runTokenGasCalibration } from './gas'

// CCT mint uses the standard `MintNewJettons` opcode (0x15); the minter requires the sender to be
// its admin, so the fixture mints from the deployer.
const CCT_MINT_OPCODE = 0x00000015

runTokenGasCalibration({
  name: 'CCT',
  setup: async (blockchain: Blockchain, deployer: SandboxContract<TreasuryContract>) => {
    const minterCode = await contractCode.ccip.local('ccip.cct.JettonMinter')
    const walletCode = await contractCode.ccip.local('ccip.cct.JettonWallet')

    const minter = blockchain.openContract(
      cct.JettonMinter.fromStorage(
        cct.MinterStorage.create({
          totalSupply: 0n,
          adminAddress: deployer.address,
          nextAdminAddress: null,
          jettonWalletCode: walletCode,
          metadataUri: 'cct.gas',
        }),
        { overrideContractCode: minterCode },
      ),
    )
    await minter.sendDeploy(deployer.getSender(), toNano('1'))

    const harness = await deployCctHarness(blockchain, deployer)

    return {
      minterAddress: minter.address,
      getWalletAddress: (owner) => minter.getWalletAddress(owner),
      mintOpcode: CCT_MINT_OPCODE,
      sendBurn: (owner, walletAddress, opts) => {
        const wallet = blockchain.openContract(cctWallet.JettonWallet.fromAddress(walletAddress))
        return wallet.sendCCTAskToBurn(owner.getSender(), opts.value, {
          queryId: opts.queryId,
          jettonAmount: opts.jettonAmount,
          sendExcessesTo: opts.responseDestination,
          customPayload: opts.customPayload,
          forwardPayload: null,
        })
      },
      readConstants: async () => ({
        jettonTransfer: Number(await harness.getGasConsumptionJettonTransfer()),
        jettonReceive: Number(await harness.getGasConsumptionJettonReceive()),
        burnRequest: Number(await harness.getGasConsumptionBurnRequest()),
        burnNotification: Number(await harness.getGasConsumptionBurnNotification()),
      }),
      assertBudget: async (measured) => {
        expect(Number(measured.mintMinterGas)).toEqual(
          Number(await harness.getGasConsumptionMint()),
        )
      },
    }
  },
})
