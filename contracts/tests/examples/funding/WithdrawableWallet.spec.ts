import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { WithdrawableWallet } from '../../../wrappers/examples/funding/WithdrawableWallet'
import { newWithdrawableSpec } from '../../lib/funding/WithdrawableSpec'
import * as withdrawable from '../../../wrappers/libraries/funding/Withdrawable'
import * as ownable2step from '../../../wrappers/libraries/access/Ownable2Step'

async function setUpTest(
  initialBalance: bigint,
  reserve: bigint,
): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  wallet: SandboxContract<WithdrawableWallet>
  code: Cell
}> {
  let blockchain = await Blockchain.create()
  blockchain.verbosity = {
    print: true,
    blockchainLogs: false,
    vmLogs: 'none',
    debugLogs: true,
  }

  let deployer = await blockchain.treasury('deployer')
  let owner = await blockchain.treasury('owner')
  let recipient = await blockchain.treasury('recipient')

  let code = await WithdrawableWallet.code()

  let wallet = blockchain.openContract(
    WithdrawableWallet.createFromConfig(
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
  const withdrawableSpec = newWithdrawableSpec(
    {
      getCode: () => WithdrawableWallet.code(),
      ContractConstructor: WithdrawableWallet,
      withdrawValue: toNano('0.05'),
      reserve: toNano('1'),
    },
    async (blockchain, owner) => {
      const code = await WithdrawableWallet.code()
      const contract = blockchain.openContract(
        WithdrawableWallet.createFromConfig(
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
  )
  withdrawableSpec.run()
})

describe('WithdrawableWallet - Unit Tests', () => {
  it('should deploy', async () => {
    await setUpTest(toNano('10'), toNano('1'))
  })
})
