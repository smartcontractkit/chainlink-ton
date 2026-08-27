import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import {
  DepositAccount,
  AskToTransfer,
  ForwardPayloadRemainder,
  DepositAccount_ForwardNotification,
  DepositAccount_InMessageForward,
  DepositAccount_Reply,
} from '../../../wrappers/gen/ccip/DepositAccount'

describe('DepositAccount (default forward hook, off-ramp role)', () => {
  let blockchain: Blockchain
  let proxy: SandboxContract<TreasuryContract> // e.g. pool (or Router)
  let recipient: SandboxContract<TreasuryContract> // owner
  let attacker: SandboxContract<TreasuryContract>
  let notifier: SandboxContract<TreasuryContract> // any jetton wallet (token-agnostic account)

  let account: SandboxContract<DepositAccount>

  const owner = () => recipient.address
  const proxyAddr = () => proxy.address
  const beneficiaries = () => new Set<Address>([recipient.address])

  const init = async (
    via: SandboxContract<TreasuryContract>,
    queryId = 1n,
    forwardPayload: Cell | null = null,
  ) => {
    return account.sendDepositAccountInit(via.getSender(), toNano('0.5'), {
      queryId,
      forwardPayload,
    })
  }

  const buildAskToTransfer = (amount: bigint, to: Address, requester: Address | null = null) =>
    AskToTransfer.create({
      queryId: 10n,
      jettonAmount: amount,
      transferRecipient: to,
      sendExcessesTo: requester,
      customPayload: null,
      forwardTonAmount: 0n,
      forwardPayload: ForwardPayloadRemainder.fromSlice(beginCell().endCell().beginParse()),
    })

  // Build a boxed Jetton `TransferNotificationForRecipient`-shaped body carried by a real wallet.
  const buildNotificationBody = (queryId: bigint, amount: bigint, to: Address) =>
    beginCell()
      .storeUint(0x7362d09c, 32) // TransferNotificationForRecipient
      .storeUint(queryId, 64)
      .storeCoins(amount)
      .storeAddress(to)
      .storeMaybeRef(null)
      .endCell()

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    proxy = await blockchain.treasury('proxy')
    recipient = await blockchain.treasury('recipient')
    attacker = await blockchain.treasury('attacker')
    notifier = await blockchain.treasury('notifier')

    // A freshly-derived, uninitialized, token-agnostic DepositAccount.
    account = blockchain.openContract(
      DepositAccount.fromStorage({
        owner: owner(),
        proxy: proxyAddr(),
        beneficiaries: beneficiaries(),
      }),
    )
    await account.sendDeploy(recipient.getSender(), toNano('1'))
  })

  it('deploys with owner and proxy (no wallet gate — token-agnostic)', async () => {
    expect((await account.getOwner()).equals(owner())).toBe(true)
    expect((await account.getProxy()).equals(proxyAddr())).toBe(true)
  })

  it('reports type and version', async () => {
    const [name, version] = await account.getTypeAndVersion()
    expect(name.loadStringTail()).toBe('link.chain.ton.ccip.account.DepositAccount')
    expect(version.loadStringTail()).toBe('0.1.0')
  })

  it('initializes only from owner and replies', async () => {
    const res = await init(recipient)
    expect(res.transactions).toHaveTransaction({
      from: recipient.address,
      to: account.address,
      success: true,
    })

    // The proxy (non-owner) can no longer init — only the owner may.
    const badProxy = await init(proxy)
    expect(badProxy.transactions).toHaveTransaction({ to: account.address, success: false })

    // The account sent DepositAccount_Reply back to the owner, echoing `forwardPayload`.
    const forwardPayload = beginCell().storeUint(0xed696f9b, 32).endCell()
    const res2 = await init(recipient, 7n, forwardPayload)
    expect(res2.transactions).toHaveTransaction({
      from: account.address,
      to: recipient.address,
      success: true,
      op: DepositAccount_Reply.PREFIX,
      body(body) {
        if (!body) return false
        const reply = DepositAccount_Reply.fromSlice(body.beginParse())
        return reply.queryId === 7n && reply.forwardPayload?.equals(forwardPayload) === true
      },
    })
  })

  it('rejects init from a non-owner sender', async () => {
    const bad = await init(attacker)
    expect(bad.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('forwards a jetton notification from any wallet to the proxy', async () => {
    await init(recipient)

    // Any wallet (token-agnostic account) sends a Jetton notification to the account.
    const notificationBody = buildNotificationBody(3n, toNano('2'), proxy.address)
    const res = await notifier.send({
      to: account.address,
      value: toNano('0.2'),
      bounce: false,
      body: notificationBody,
    })

    // The account forwards a DepositAccount_ForwardNotification to the proxy,
    // carrying the original message metadata + body (including the original senderAddress).
    const expectedSender = notifier.address
    expect(res.transactions).toHaveTransaction({
      from: account.address,
      to: proxy.address,
      success: true,
      op: DepositAccount_ForwardNotification.PREFIX,
      body(body) {
        if (!body) return false
        const fwd = DepositAccount_ForwardNotification.fromSlice(body.beginParse())
        return (
          fwd.message.senderAddress.equals(expectedSender) &&
          fwd.message.body.equals(notificationBody)
        )
      },
    })
  })

  it('forwards a jetton notification even from a non-account wallet sender (auth lives in the pool)', async () => {
    await init(recipient)

    // The account does not gate on a trusted wallet: any sender is forwarded, and the pool (proxy)
    // is responsible for verifying `senderAddress` against the expected wallet before finalizing.
    const notificationBody = buildNotificationBody(3n, toNano('2'), proxy.address)
    const res = await attacker.send({
      to: account.address,
      value: toNano('0.2'),
      bounce: false,
      body: notificationBody,
    })
    expect(res.transactions).toHaveTransaction({
      from: account.address,
      to: proxy.address,
      success: true,
      op: DepositAccount_ForwardNotification.PREFIX,
    })
  })

  it('forwards unrecognized messages (no bounce at the account)', async () => {
    await init(recipient)

    // Unknown opcodes are forwarded verbatim to the proxy; the account does not bounce them.
    const res = await attacker.send({
      to: account.address,
      value: toNano('0.2'),
      bounce: false,
      body: beginCell().storeUint(0xdeadbeef, 32).endCell(),
    })
    expect(res.transactions).toHaveTransaction({
      from: account.address,
      to: proxy.address,
      success: true,
      op: DepositAccount_ForwardNotification.PREFIX,
    })
  })

  it('lets a beneficiary withdraw by forwarding AskToTransfer, and rejects everyone else', async () => {
    await init(recipient)
    const to = recipient.address
    const walletAddress = attacker.address // a stand-in wallet address for the AskToTransfer target

    // The beneficiary (owner) can withdraw.
    const ownerRes = await account.sendDepositAccountWithdraw(
      recipient.getSender(),
      toNano('0.5'),
      {
        queryId: 5n,
        walletAddress,
        ask: buildAskToTransfer(toNano('4'), to, recipient.address),
      },
    )
    expect(ownerRes.transactions).toHaveTransaction({
      from: account.address,
      to: walletAddress,
      success: true,
      op: AskToTransfer.PREFIX,
    })

    // Non-beneficiary (proxy, attacker) cannot.
    const badProxy = await account.sendDepositAccountWithdraw(proxy.getSender(), toNano('0.5'), {
      queryId: 6n,
      walletAddress,
      ask: buildAskToTransfer(toNano('4'), to, proxy.address),
    })
    expect(badProxy.transactions).toHaveTransaction({ to: account.address, success: false })

    const badAtk = await account.sendDepositAccountWithdraw(attacker.getSender(), toNano('0.5'), {
      queryId: 7n,
      walletAddress,
      ask: buildAskToTransfer(toNano('4'), to, attacker.address),
    })
    expect(badAtk.transactions).toHaveTransaction({ to: account.address, success: false })

    // A beneficiary must set `ask.sendExcessesTo` to themselves, else the withdraw is rejected.
    const badExcess = await account.sendDepositAccountWithdraw(
      recipient.getSender(),
      toNano('0.5'),
      {
        queryId: 8n,
        walletAddress,
        ask: buildAskToTransfer(toNano('4'), to, proxy.address), // sendExcessesTo != requester
      },
    )
    expect(badExcess.transactions).toHaveTransaction({ to: account.address, success: false })
  })
})
