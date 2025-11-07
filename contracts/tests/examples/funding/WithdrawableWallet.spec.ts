import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import * as withdrawableWallet from '../../../wrappers/examples/funding/WithdrawableWallet'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

async function setUpTest(
  initialBalance: bigint,
  reserve: bigint,
): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  wallet: SandboxContract<withdrawableWallet.ContractClient>
  code: Cell
}> {
  let blockchain = await Blockchain.create()
  blockchain.verbosity = {
    print: true,
    blockchainLogs: false,
    vmLogs: 'none',
    debugLogs: false,
  }

  let deployer = await blockchain.treasury('deployer')
  let owner = await blockchain.treasury('owner')
  let recipient = await blockchain.treasury('recipient')

  let code = await withdrawableWallet.ContractClient.code()

  let wallet = blockchain.openContract(
    withdrawableWallet.ContractClient.createFromConfig(
      {
        id: 0,
        ownable: { owner: owner.address, pendingOwner: null },
        reserve: reserve,
      },
      code,
    ),
  )

  const walletDeployResult = await wallet.sendDeploy(deployer.getSender(), initialBalance)

  expect(walletDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: wallet.address,
    deploy: true,
    success: true,
  })

  return {
    blockchain,
    deployer,
    owner,
    recipient,
    wallet,
    code,
  }
}

describe('WithdrawableWallet - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => withdrawableWallet.ContractClient.code(),
    ContractConstructor: withdrawableWallet.ContractClient,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: async (blockchain, owner) => {
      const code = await withdrawableWallet.ContractClient.code()
      const contract = blockchain.openContract(
        withdrawableWallet.ContractClient.createFromConfig(
          {
            id: 0,
            ownable: { owner: owner.address, pendingOwner: null },
            reserve: toNano('1'),
          },
          code,
        ),
      )
      const deployer = await blockchain.treasury('deployer')
      await contract.sendDeploy(deployer.getSender(), toNano('10'))
      return contract
    },
  })
  withdrawableSpec.run()
})

describe('WithdrawableWallet - Unit Tests', () => {
  it('should deploy', async () => {
    await setUpTest(toNano('10'), toNano('1'))
  })
})
