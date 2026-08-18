import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import { generateRandomContractId } from '../../../src/utils'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'

import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import EVM_ADDRESS from '../../utils/evmAddress'

/**
 * Creates a test CCIP message with a single token transfer.
 */
export function createTestMessageWithToken(
  opts: {
    token?: Address
    amount?: bigint
    receiver?: Address
    sourcePoolAddress?: of.CrossChainAddress
    extraData?: Cell
    destGasAmount?: bigint
    data?: Cell
  } = {},
): of.Any2TVMRampMessage {
  return of.Any2TVMRampMessage.create({
    header: of.RampMessageHeader.create({
      messageId: generateRandomContractId(),
      sourceChainSelector: 0n,
      destChainSelector: 0n,
      sequenceNumber: 0n,
      nonce: 0n,
    }),
    sender: EVM_ADDRESS,
    data: opts.data ?? Cell.EMPTY,
    receiver:
      opts.receiver ??
      Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000'),
    gasLimit: 0n,
    tokenAmounts: [
      of.Any2TVMTokenTransfer.create({
        sourcePoolAddress:
          opts.sourcePoolAddress ?? CrossChainAddressCodec.FromBuffer(Buffer.from('source-pool')),
        token:
          opts.token ??
          Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000'),
        destGasAmount: opts.destGasAmount ?? 0n,
        extraData: opts.extraData ?? null,
        amount: opts.amount ?? 1000n,
      }),
    ],
  })
}

export async function setupTestReceiveExecutor(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
  receiveExecutorCode: Cell,
  message?: of.Any2TVMRampMessage,
): Promise<SandboxContract<rx.ReceiveExecutor>> {
  const receiveExecutor = blockchain.openContract(
    rx.ReceiveExecutor.fromStorage(
      {
        owner: deployer.address,
        message:
          message ??
          of.Any2TVMRampMessage.create({
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
