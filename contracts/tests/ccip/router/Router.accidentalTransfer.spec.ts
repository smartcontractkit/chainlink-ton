import '@ton/test-utils'
import { Address, beginCell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { contractCode } from '../../../wrappers/codeLoader'
import { JettonMinter } from '../../../wrappers/jetton/JettonMinter'
import { JettonWallet } from '../../../wrappers/jetton/JettonWallet'
import * as rt from '../../../wrappers/gen/ccip/Router'
import { setup } from './Router.Setup'

describe('Router - accidental jetton transfers', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let user: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let jettonMinter: SandboxContract<JettonMinter>
  let walletOf: (owner: Address) => Promise<SandboxContract<JettonWallet>>

  const MINTED = toNano('10')

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    ;({ deployer, router } = await setup(blockchain))
    user = await blockchain.treasury('user')

    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          transferAdmin: null,
          walletCode: await contractCode.jetton('JettonWallet'),
          jettonContent: beginCell().storeStringTail('test').endCell(),
          totalSupply: 0n,
        },
        await contractCode.jetton('JettonMinter'),
      ),
    )
    await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))
    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: user.address,
        tonAmount: toNano('0.05'),
        jettonAmount: MINTED,
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    walletOf = async (owner: Address) =>
      blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(owner)),
      )
  })

  it('returns jettons accidentally sent to the Router to the transfer initiator', async () => {
    const userWallet = await walletOf(user.address)
    const routerWallet = await walletOf(router.address)
    const amount = toNano('3')

    const result = await userWallet.sendTransfer(user.getSender(), {
      value: toNano('0.5'),
      message: {
        queryId: 1,
        jettonAmount: amount,
        destination: router.address,
        responseDestination: user.address,
        customPayload: null,
        forwardTonAmount: toNano('0.1'),
        forwardPayload: null,
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: routerWallet.address,
      to: router.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: routerWallet.address,
      success: true,
    })
    expect(await routerWallet.getJettonBalance()).toEqual(0n)
    expect(await userWallet.getJettonBalance()).toEqual(MINTED)
  })
})
