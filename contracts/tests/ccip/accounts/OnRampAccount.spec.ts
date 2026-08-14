import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import {
  OnRampAccount,
  AskToTransfer,
  ForwardPayloadRemainder,
  DepositAccount_WithdrawFailed,
} from '../../../wrappers/gen/ccip/OnRampAccount'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import * as jetton from '../../../wrappers/jetton/JettonCode'

describe('OnRampAccount (generic DepositAccount with CCIPSend hook)', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let user: SandboxContract<TreasuryContract>
  let router: SandboxContract<TreasuryContract>
  let attacker: SandboxContract<TreasuryContract>

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonWalletCode: Cell

  let account: SandboxContract<OnRampAccount>

  const owner = () => user.address
  const proxy = () => router.address
  const beneficiaries = () =>
    new Map<Address, boolean>([
      [user.address, true],
      [router.address, true],
    ])

  // A canonical CCIPSend-shaped boxed message (op 0x31768d95 = Router_CCIPSend) carried in a deposit.
  const ccipSendCell = () =>
    beginCell().storeUint(0x31768d95, 32).storeUint(1234n, 64).storeBit(1).endCell()

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

  // Deposit `amount` jettons from `from` to the account. With `forwardPayload` set, the deposit
  // carries a CCIPSend which the account forwards to the Router (proxy).
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
        proxy: proxy(),
        beneficiaries: beneficiaries(),
        allowedJettonWallet: null,
      }),
    )
    await account.sendDeploy(deployer.getSender(), toNano('1'))
  })

  // The account's own jetton wallet is the single source of authentic deposit notifications.
  const accountWallet = async () => jettonMinter.getWalletAddress(account.address)

  const initAccount = async (via: SandboxContract<TreasuryContract>, queryId = 1n) => {
    return account.sendDepositAccountInit(via.getSender(), toNano('0.5'), {
      queryId,
      allowedJettonWallet: await accountWallet(),
      forwardPayload: null,
    })
  }

  const buildAskToTransfer = (amount: bigint, recipient: Address, requester: Address) =>
    AskToTransfer.create({
      queryId: 10n,
      jettonAmount: amount,
      transferRecipient: recipient,
      sendExcessesTo: requester,
      customPayload: null,
      forwardTonAmount: 0n,
      forwardPayload: ForwardPayloadRemainder.fromSlice(beginCell().endCell().beginParse()),
    })

  it('deploys with owner and proxy (Router) and is not yet initialized', async () => {
    expect((await account.getOwner()).equals(owner())).toBe(true)
    expect((await account.getProxy()).equals(proxy())).toBe(true)
    expect(await account.getAllowedJettonWallet()).toBeNull()
  })

  it('initializes only from owner or proxy and authenticates the account wallet', async () => {
    const res = await initAccount(user)
    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: account.address,
      success: true,
    })

    const expected = await accountWallet()
    expect((await account.getAllowedJettonWallet())?.equals(expected)).toBe(true)

    // Attacker can't init.
    const bad = await initAccount(attacker, 2n)
    expect(bad.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('holds deposit-only jettons in its wallet when no forward payload is attached', async () => {
    await initAccount(user)
    const acctWallet = await walletOf(account.address)
    await mintTo(user.address, toNano('5'))

    // Plain transfer into the account (no forward payload): custody lands in the account wallet.
    const deposit = await depositToAccount(user, toNano('5'))
    expect(deposit.transactions).toHaveTransaction({ to: acctWallet.address, success: true })
    expect(await acctWallet.getJettonBalance()).toEqual(toNano('5'))
  })

  it('forwards the CCIPSend message to the Router (proxy) without moving jettons', async () => {
    await initAccount(user)
    const acctWallet = await walletOf(account.address)
    await mintTo(user.address, toNano('5'))

    // Transfer carrying a CCIPSend in its forward payload.
    const deposit = await depositToAccount(user, toNano('5'), ccipSendCell())

    // The account sends the boxed CCIPSend (op 0x31768d95) directly to the Router.
    expect(deposit.transactions).toHaveTransaction({
      from: account.address,
      to: router.address,
      success: true,
      op: 0x31768d95,
    })

    // Jettons are NOT forwarded — they stay in the account's wallet.
    expect(await acctWallet.getJettonBalance()).toEqual(toNano('5'))
  })

  it('bounces a deposit notification from a non-account wallet', async () => {
    await initAccount(user)

    // Notify from a wallet that is NOT the account's own wallet (not the allowedJettonWallet).
    const res = await user.send({
      to: account.address,
      value: toNano('0.5'),
      bounce: false,
      body: beginCell()
        .storeUint(0x7362d09c, 32) // TransferNotificationForRecipient
        .storeUint(5n, 64)
        .storeCoins(toNano('1'))
        .storeAddress(user.address)
        .storeMaybeRef(ccipSendCell())
        .endCell(),
    })
    expect(res.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('lets the owner and Router (both beneficiaries) withdraw, and rejects everyone else', async () => {
    await initAccount(user)
    const acctWallet = await walletOf(account.address)
    await mintTo(acctWallet.address, toNano('5'))
    const to = router.address

    // Owner (user) can withdraw.
    const ownerRes = await account.sendDepositAccountWithdraw(user.getSender(), toNano('0.5'), {
      queryId: 6n,
      walletAddress: acctWallet.address,
      ask: buildAskToTransfer(toNano('5'), to, user.address),
    })
    expect(ownerRes.transactions).toHaveTransaction({
      from: account.address,
      to: acctWallet.address,
      op: AskToTransfer.PREFIX,
    })

    // Router (proxy / beneficiary) can withdraw.
    const benRes = await account.sendDepositAccountWithdraw(router.getSender(), toNano('0.5'), {
      queryId: 7n,
      walletAddress: acctWallet.address,
      ask: buildAskToTransfer(toNano('5'), to, router.address),
    })
    expect(benRes.transactions).toHaveTransaction({
      from: account.address,
      to: acctWallet.address,
      op: AskToTransfer.PREFIX,
    })

    // Attacker (non-beneficiary) cannot.
    const atkRes = await account.sendDepositAccountWithdraw(attacker.getSender(), toNano('0.5'), {
      queryId: 8n,
      walletAddress: acctWallet.address,
      ask: buildAskToTransfer(toNano('5'), to, attacker.address),
    })
    expect(atkRes.transactions).toHaveTransaction({ to: account.address, success: false })

    // A beneficiary must set `ask.sendExcessesTo` to themselves; otherwise the withdraw is rejected.
    const badBen = await account.sendDepositAccountWithdraw(user.getSender(), toNano('0.5'), {
      queryId: 9n,
      walletAddress: acctWallet.address,
      ask: buildAskToTransfer(toNano('1'), to, router.address), // sendExcessesTo != requester
    })
    expect(badBen.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('notifies the requester (sendExcessesTo) when a withdraw AskToTransfer bounces', async () => {
    await initAccount(user)
    const acctWallet = await walletOf(account.address)
    await mintTo(acctWallet.address, toNano('1'))
    const to = user.address // recipient

    // Request a transfer of MORE than the wallet holds — the real jetton wallet will bounce the
    // AskToTransfer back, which the account surfaces to the requester (sendExcessesTo) and NOT to
    // the owner (unless the requester is the owner).
    const res = await account.sendDepositAccountWithdraw(router.getSender(), toNano('0.5'), {
      queryId: 88n,
      walletAddress: acctWallet.address,
      ask: buildAskToTransfer(toNano('100'), to, router.address),
    })

    // The AskToTransfer reached the account's wallet and bounced back (insufficient balance).
    expect(res.transactions).toHaveTransaction({
      from: account.address,
      to: acctWallet.address,
      op: AskToTransfer.PREFIX,
    })
    expect(res.transactions).toHaveTransaction({
      to: account.address,
      inMessageBounced: true,
      success: true,
    })

    // The failure notification goes to the requester (router, the sendExcessesTo), NOT to the owner
    // (user). The notification's queryId is the bounced AskToTransfer's (buildAskToTransfer => 10n).
    expect(res.transactions).toHaveTransaction({
      from: account.address,
      to: router.address,
      success: true,
      op: DepositAccount_WithdrawFailed.PREFIX,
      body(body) {
        if (!body) return false
        const wf = DepositAccount_WithdrawFailed.fromSlice(body.beginParse())
        return wf.queryId === 10n && wf.ask.sendExcessesTo?.equals(router.address) === true
      },
    })
  })
})
