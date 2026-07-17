import { Cell, Address, Dictionary, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { generateRandomContractId } from '../../../src/utils'
import * as dict from '../../../src/utils/dict'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import { PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS } from './OffRamp.commitAndExec.spec'
import { ChainSelectors } from '../../utils/Selectors'

export async function deployOffRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  code?: Cell,
  opts?: {
    deployerCode?: Cell
    merkleRootCode?: Cell
    receiveExecutorCode?: Cell
    feeQuoter?: Address
  },
): Promise<SandboxContract<of.OffRamp>> {
  const storage = of.Storage.create({
    id: generateRandomContractId(),
    ownable: of.Ownable2Step.create({
      owner: owner.address,
      pendingOwner: null,
    }),
    deployables: of.OffRamp_Deployables.create({
      rmnRouter: owner.address, // used to determine who can send RMN updates
      deployer: opts?.deployerCode ?? Cell.EMPTY,
      merkleRootCode: opts?.merkleRootCode ?? Cell.EMPTY,
      receiveExecutorCode: opts?.receiveExecutorCode ?? Cell.EMPTY,
    }),
    feeQuoter: opts?.feeQuoter ?? owner.address, // placeholder
    ocr3Base: of.OCR3Base.create({
      chainId: 1n,
      commit: null,
      execute: null,
    }),
    cursedSubjects: of.CursedSubjects.create({
      data: new Set(),
    }),
    chainSelector: ChainSelectors.testnet.ton,
    permissionlessExecutionThresholdSeconds: PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS,
    sourceChainConfigs: new Map(),
    latestPriceSequenceNumber: 0n,
  })

  const offramp = blockchain.openContract(
    of.OffRamp.fromStorage(storage, code ? { overrideContractCode: code } : undefined),
  )

  let result = await offramp.sendDeploy(owner.getSender(), toNano('0.05'))
  expect(result.transactions).toHaveTransaction({
    from: owner.address,
    to: offramp.address,
    deploy: true,
    success: true,
  })
  return offramp
}
