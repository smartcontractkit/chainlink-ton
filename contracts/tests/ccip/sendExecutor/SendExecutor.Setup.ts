import { compile } from '@ton/blueprint'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano } from '@ton/core'

import { generateRandomContractId, ZERO_ADDRESS } from '../../../src/utils'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'

import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import * as dep from '../../../wrappers/libraries/Deployable'

export async function setup(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
): Promise<SandboxContract<dep.ContractClient>> {
  let code = await compile('Deployable')

  let data: dep.DeployableStorage = {
    owner: deployer.address,
    id: dep.builder.data.namespaced.encode({
      namespace: NameSpace.CCIPNamespace.CCIPSendExecutor,
      id: beginCell().storeUint(generateRandomContractId(), 224),
    }),
  }
  let ccipSendExecutor = blockchain.openContract(dep.ContractClient.createFromConfig(data, code))

  return ccipSendExecutor
}

export async function sendDeployOnBlockchain(
  blockchain: Blockchain,
  deployer: SandboxContract<TreasuryContract>,
  deployable: SandboxContract<dep.ContractClient>,
  selfMessage: dep.Message | undefined,
  onRampMock: SandboxContract<TreasuryContract>,
) {
  const initialize: dep.Initialize = {
    stateInit: {
      code: await compile('CCIPSendExecutor'),
      data: sx.builder.data.contractInitData
        .encode({
          onramp: onRampMock.address,
          id: 0n,
        })
        .asCell(),
    },
  }
  let result = selfMessage
    ? await deployable.sendInitializeAndSend(deployer.getSender(), toNano('0.5'), {
        ...initialize,
        selfMessage,
      })
    : await deployable.sendInitialize(deployer.getSender(), toNano('0.5'), initialize)
  expect(result.transactions).toHaveTransaction({
    from: deployer.address,
    to: deployable.address,
    deploy: true,
    success: true,
  })
  if (selfMessage) {
    expect(result.transactions).toHaveTransaction({
      from: deployable.address,
      to: deployable.address,
      body(x) {
        if (!x) return false
        return x.equals(selfMessage.body)
      },
    })
  }
  return {
    sendExecutor: blockchain.openContract(sx.ContractClient.createFromAddress(deployable.address)),
    result,
  }
}
