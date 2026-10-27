import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'

import {
  CctHarnessContract,
  WgramHarnessContract,
  deployCctHarness,
  deployWgramHarness,
} from '../gas-report/harness'

// Smoke test: the harness getters are the single source of truth for the off-chain calibration
// tests, so first prove they deploy and evaluate in a real TVM context (including the
// config-param opcodes GETGASFEE / GETFORWARDFEE / GETSTORAGEFEE used by the pool budgets).
describe('gas calibration harness', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let cct: CctHarnessContract
  let wgram: WgramHarnessContract

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    cct = await deployCctHarness(blockchain, deployer)
    wgram = await deployWgramHarness(blockchain, deployer)
  })

  it('exposes the CCT token + token-pool cost model', async () => {
    const fwdFee = toNano('0.001')

    const values = {
      gasConsumptionJettonTransfer: await cct.getGasConsumptionJettonTransfer(),
      gasConsumptionJettonReceive: await cct.getGasConsumptionJettonReceive(),
      gasConsumptionBurnRequest: await cct.getGasConsumptionBurnRequest(),
      gasConsumptionBurnNotification: await cct.getGasConsumptionBurnNotification(),
      gasConsumptionMint: await cct.getGasConsumptionMint(),
      messageSizeBurnNotificationBits: await cct.getMessageSizeBurnNotificationBits(),
      messageSizeBurnNotificationCells: await cct.getMessageSizeBurnNotificationCells(),
      forwardInitStateOverhead: await cct.getForwardInitStateOverhead(),
      jettonWalletMinStorageFee: await cct.getJettonWalletMinStorageFee(),
      ccipMinValueGasUnits: await cct.getCcipMinValueGasUnits(),
      ccipAdmissionGasUnits: await cct.getCcipAdmissionGasUnits(),
      calculateGasFee: await cct.getCalculateGasFee(10_000n),
    }

    for (const value of Object.values(values)) {
      expect(value).toBeGreaterThan(0n)
    }

    // Config-param opcodes resolved in get-method context.
    expect(values.forwardInitStateOverhead).toBeGreaterThan(0n)
    expect(values.jettonWalletMinStorageFee).toBeGreaterThan(0n)
    expect(values.calculateGasFee).toBeGreaterThan(0n)

    const noForward = await cct.getJettonTransferFee(fwdFee, false, false)
    const withForward = await cct.getJettonTransferFee(fwdFee, true, false)
    // The model adds the strict-check buffer once, at the end.
    expect(withForward).toBe(noForward + fwdFee)

    // Generic = reference doubled; both include the same strict-check/drift margin.
    const margin = await cct.getJettonWalletFeeMargin()
    const multiplier = await cct.getJettonGenericWalletFeeMultiplier()
    const generic = await cct.getJettonTransferFee(fwdFee, true, true)
    expect(generic).toBe((withForward - margin) * multiplier + margin)

    expect(await cct.getCctMintOpBudget(fwdFee)).toBeGreaterThan(fwdFee)
  })

  it('exposes the wGRAM token cost model', async () => {
    const values = {
      gasConsumptionJettonTransfer: await wgram.getGasConsumptionJettonTransfer(),
      gasConsumptionJettonReceive: await wgram.getGasConsumptionJettonReceive(),
      gasConsumptionBurnRequest: await wgram.getGasConsumptionBurnRequest(),
      gasConsumptionBurnNotification: await wgram.getGasConsumptionBurnNotification(),
      messageSizeBurnNotificationBits: await wgram.getMessageSizeBurnNotificationBits(),
      messageSizeBurnNotificationCells: await wgram.getMessageSizeBurnNotificationCells(),
      messageSizeReturnExcessesBits: await wgram.getMessageSizeReturnExcessesBits(),
      messageSizeReturnExcessesCells: await wgram.getMessageSizeReturnExcessesCells(),
      forwardInitStateOverhead: await wgram.getForwardInitStateOverhead(),
      jettonWalletMinStorageFee: await wgram.getJettonWalletMinStorageFee(),
    }

    for (const value of Object.values(values)) {
      expect(value).toBeGreaterThan(0n)
    }
  })
})
