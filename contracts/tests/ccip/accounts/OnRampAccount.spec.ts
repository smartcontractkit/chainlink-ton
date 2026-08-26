import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import {
  OnRampAccount,
  AskToTransfer,
  ForwardPayloadRemainder,
} from '../../../wrappers/gen/ccip/OnRampAccount'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import * as jetton from '../../../wrappers/jetton/JettonCode'
import { JettonClient } from '../../../wrappers/gen/ccip/pools/LockReleaseTokenPool'

describe('OnRampAccount', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let user: SandboxContract<TreasuryContract>
  let router: SandboxContract<TreasuryContract>
  let attacker: SandboxContract<TreasuryContract>

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonWalletCode: Cell

  let account: SandboxContract<OnRampAccount>

  const owner = () => user.address
  const beneficiary = () => router.address

  // A canonical CCIPSend-shaped forward payload carried on a deposit (op 0x31768d95 = Router_CCIPSend).
  const ccipSendCell = () =>
    beginCell().storeUint(0x31768d95, 32).storeUint(1234n, 64).storeBit(1).endCell()

  const acctWallet = async () => {
    const addr = await account.getJettonWallet()
    if (!addr) throw new Error('account not initialized')
    return blockchain.openContract(JettonWallet.createFromAddress(addr))
  }

  // Open the jetton wallet owned by the given address.
  const walletOf = async (address: Address) =>
    blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
    )

  // Mint tokens to a user's own wallet so they can send them.
  const mintTo = async (address: Address, amount: bigint) => {
    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: address,
        tonAmount: toNano('0.05'),
        jettonAmount: amount,
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
  }

  // Deposit `amount` jettons from `from` to the account. With `forwardPayload` set, the
  // deposit carries a CCIPSend; without it, it is a plain deposit-only transfer.
  const depositToAccount = async (
    from: SandboxContract<TreasuryContract>,
    amount: bigint,
    forwardPayload?: Cell,
  ) => {
    const wallet = await walletOf(from.address)
    return wallet.sendTransfer(from.getSender(), {
      value: toNano('0.5'),
      message: {
        queryId: 9,
        jettonAmount: amount,
        destination: account.address,
        responseDestination: from.address,
        customPayload: beginCell().storeBit(1).endCell(),
        forwardTonAmount: toNano('0.05'),
        forwardPayload: forwardPayload ?? null,
      },
    })
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    user = await blockchain.treasury('user')
    router = await blockchain.treasury('router')
    attacker = await blockchain.treasury('attacker')

    jettonWalletCode = await jetton.JettonWalletCode()
    const jettonMinterCode = await jetton.JettonMinterCode()

    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          transferAdmin: null,
          walletCode: jettonWalletCode,
          jettonContent: beginCell().storeStringTail('onramp-account-test').endCell(),
          totalSupply: 0n,
        },
        jettonMinterCode,
      ),
    )
    await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))

    account = blockchain.openContract(
      OnRampAccount.fromStorage({
        owner: owner(),
        beneficiary: beneficiary(),
        jettonClient: null,
      }),
    )
    await account.sendDeploy(deployer.getSender(), toNano('1'))
  })

  const initAccount = async (via: SandboxContract<TreasuryContract>, queryId = 1n) => {
    return account.sendOnRampAccountInit(via.getSender(), toNano('0.5'), {
      queryId,
      jettonClient: JettonClient.create({
        masterAddress: jettonMinter.address,
        jettonWalletCode,
      }),
    })
  }

  const buildAskToTransfer = (amount: bigint, recipient: Address) =>
    AskToTransfer.create({
      queryId: 10n,
      jettonAmount: amount,
      transferRecipient: recipient,
      sendExcessesTo: null,
      customPayload: null,
      forwardTonAmount: 0n,
      forwardPayload: ForwardPayloadRemainder.fromSlice(beginCell().endCell().beginParse()),
    })

  it('deploys with owner and beneficiary and is not yet initialized', async () => {
    expect((await account.getOwner()).equals(owner())).toBe(true)
    expect((await account.getBeneficiary()).equals(beneficiary())).toBe(true)
    expect(await account.getJettonWallet()).toBeNull()
  })

  it('initializes only when sender is owner or beneficiary and derives its wallet', async () => {
    const res = await initAccount(user)
    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: account.address,
      success: true,
    })

    const expected = await jettonMinter.getWalletAddress(account.address)
    expect((await account.getJettonWallet())?.equals(expected)).toBe(true)

    // Attacker can't init.
    const bad = await account.sendOnRampAccountInit(attacker.getSender(), toNano('0.5'), {
      queryId: 2n,
      jettonClient: JettonClient.create({ masterAddress: jettonMinter.address, jettonWalletCode }),
    })
    expect(bad.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('holds deposit-only jettons in its wallet when no forward payload is attached', async () => {
    await initAccount(user)
    const wallet = await acctWallet()
    await mintTo(user.address, toNano('5'))

    // Plain transfer into the account (no forward payload): custody lands in the wallet.
    const deposit = await depositToAccount(user, toNano('5'))
    expect(deposit.transactions).toHaveTransaction({ to: wallet.address, success: true })
    expect(await wallet.getJettonBalance()).toEqual(toNano('5'))
  })

  it('forwards jettons and the CCIPSend to the beneficiary when a forward payload is present', async () => {
    await initAccount(user)
    const wallet = await acctWallet()
    const routerWallet = await jettonMinter.getWalletAddress(beneficiary())
    await mintTo(user.address, toNano('5'))

    // Transfer carrying a CCIPSend in its forward payload.
    const deposit = await depositToAccount(user, toNano('5'), ccipSendCell())

    // The account forwards an AskToTransfer (op 0x0f8a7ea5) towards its own wallet,
    // carrying the CCIPSend forward payload to the beneficiary.
    expect(deposit.transactions).toHaveTransaction({
      from: account.address,
      to: wallet.address,
      op: AskToTransfer.PREFIX,
    })
    // The wallet relays the transfer to the beneficiary's wallet.
    expect(deposit.transactions).toHaveTransaction({
      from: wallet.address,
      to: routerWallet,
    })
  })

  it('rejects deposit notifications from a non-account wallet', async () => {
    await initAccount(user)

    // Notify with a transferInitiator that is NOT the account's own wallet. The account only
    // accepts notifications arriving from its own wallet (`onDepositNotification` re-checks).
    const res = await account.sendTransferNotificationForRecipient(
      user.getSender(),
      toNano('0.5'),
      {
        queryId: 5n,
        jettonAmount: toNano('1'),
        transferInitiator: user.address,
        forwardPayload: beginCell().storeRef(ccipSendCell()).endCell().beginParse(),
      },
    )
    expect(res.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('lets the owner and beneficiary withdraw, and rejects everyone else', async () => {
    await initAccount(user)
    const wallet = await acctWallet()
    await mintTo(account.address, toNano('5'))
    const to = router.address

    // Owner can withdraw (routes AskToTransfer to its own wallet).
    const ownerRes = await account.sendOnRampAccountWithdraw(user.getSender(), toNano('0.5'), {
      queryId: 6n,
      walletAddress: wallet.address,
      ask: buildAskToTransfer(toNano('5'), to),
    })
    expect(ownerRes.transactions).toHaveTransaction({
      from: account.address,
      to: wallet.address,
      op: AskToTransfer.PREFIX,
    })

    // Beneficiary can withdraw.
    const benRes = await account.sendOnRampAccountWithdraw(router.getSender(), toNano('0.5'), {
      queryId: 7n,
      walletAddress: wallet.address,
      ask: buildAskToTransfer(toNano('5'), to),
    })
    expect(benRes.transactions).toHaveTransaction({
      from: account.address,
      to: wallet.address,
      op: AskToTransfer.PREFIX,
    })

    // Attacker cannot.
    const atkRes = await account.sendOnRampAccountWithdraw(attacker.getSender(), toNano('0.5'), {
      queryId: 8n,
      walletAddress: wallet.address,
      ask: buildAskToTransfer(toNano('5'), to),
    })
    expect(atkRes.transactions).toHaveTransaction({ to: account.address, success: false })
  })
})
