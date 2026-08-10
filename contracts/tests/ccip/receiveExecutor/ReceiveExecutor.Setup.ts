import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import { generateRandomContractId } from '../../../src/utils'

import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import EVM_ADDRESS from '../../utils/evmAddress'

export async function setupTestReceiveExecutor(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
  receiveExecutorCode: Cell,
): Promise<SandboxContract<rx.ReceiveExecutor>> {
  const receiveExecutor = blockchain.openContract(
    rx.ReceiveExecutor.fromStorage(
      {
        owner: deployer.address,
        message: of.Any2TVMRampMessage.create({
          header: of.RampMessageHeader.create({
            messageId: generateRandomContractId(),
            sourceChainSelector: 0n,
            destChainSelector: 0n,
            sequenceNumber: 0n,
            nonce: 0n,
          }),
          sender: EVM_ADDRESS,
          data: Cell.EMPTY,
          receiver: deployer.address,
          gasLimit: 0n,
          tokenAmounts: null,
        }),
        root: deployer.address,
        execId: 0n,
      },
      {
        overrideContractCode: receiveExecutorCode,
      },
    ),
  )
  const result = await receiveExecutor.sendDeploy(deployer.getSender(), toNano('0.05'))
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: receiveExecutor.address,
    deploy: true,
    success: true,
  })
  return receiveExecutor
}
