import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import {
  OffRampAccount,
  AskToTransfer,
  ForwardPayloadRemainder,
  OffRampAccount_ForwardNotification,
  OffRampAccount_InMessageForward,
  OffRampAccount_Reply,
} from '../../../wrappers/gen/ccip/OffRampAccount'

describe('OffRampAccount', () => {
  let blockchain: Blockchain
  let pool: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>
  let attacker: SandboxContract<TreasuryContract>
  let allowedWallet: SandboxContract<TreasuryContract>

  let account: SandboxContract<OffRampAccount>

  const owner = () => recipient.address
  const notificationTarget = () => pool.address

  const init = async (via: SandboxContract<TreasuryContract>, queryId = 1n, forwardPayload: Cell | null = null) => {
    return account.sendOffRampAccountInit(via.getSender(), toNano('0.5'), {
      queryId,
      allowedJettonWallet: allowedWallet.address,
      forwardPayload,
    })
  }

  const buildAskToTransfer = (amount: bigint, to: Address) =>
    AskToTransfer.create({
      queryId: 10n,
      jettonAmount: amount,
      transferRecipient: to,
      sendExcessesTo: null,
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
    pool = await blockchain.treasury('pool')
    recipient = await blockchain.treasury('recipient')
    attacker = await blockchain.treasury('attacker')
    allowedWallet = await blockchain.treasury('allowedWallet')

    // A freshly-derived, uninitialized OffRampAccount (allowedJettonWallet is null until init).
    account = blockchain.openContract(
      OffRampAccount.fromStorage({
        owner: owner(),
        notificationTarget: notificationTarget(),
        allowedJettonWallet: null,
      }),
    )
    await account.sendDeploy(recipient.getSender(), toNano('1'))
  })

  it('deploys with owner, notificationTarget and unset allowed wallet', async () => {
    expect((await account.getOwner()).equals(owner())).toBe(true)
    expect((await account.getNotificationTarget()).equals(notificationTarget())).toBe(true)
    expect(await account.getAllowedJettonWallet()).toBeNull()
  })

  it('reports type and version', async () => {
    const [name, version] = await account.getTypeAndVersion()
    expect(name.loadStringTail()).toBe('link.chain.ton.ccip.OffRampAccount')
    expect(version.loadStringTail()).toBe('0.1.0')
  })

  it('initializes only when the sender is the notification target (pool) and replies', async () => {
    const res = await init(pool)
    expect(res.transactions).toHaveTransaction({ from: pool.address, to: account.address, success: true })

    // allowedJettonWallet is now set.
    expect((await account.getAllowedJettonWallet())?.equals(allowedWallet.address)).toBe(true)

    // The account sent OffRampAccount_Reply back to the pool, echoing `forwardPayload`.
    const forwardPayload = beginCell().storeUint(0xed696f9b, 32).endCell()
    const res2 = await init(pool, 7n, forwardPayload)
    expect(res2.transactions).toHaveTransaction({
      from: account.address,
      to: pool.address,
      success: true,
      op: OffRampAccount_Reply.PREFIX,
      body(body) {
        if (!body) return false
        const reply = OffRampAccount_Reply.fromSlice(body.beginParse())
        return reply.queryId === 7n && reply.forwardPayload?.equals(forwardPayload) === true
      },
    })
  })

  it('rejects init from a non-pool sender', async () => {
    const bad = await init(attacker)
    expect(bad.transactions).toHaveTransaction({ to: account.address, success: false })

    // Re-init by recipient (owner) also rejected.
    const badOwner = await init(recipient)
    expect(badOwner.transactions).toHaveTransaction({ to: account.address, success: false })

    // allowedJettonWallet stays unset.
    expect(await account.getAllowedJettonWallet()).toBeNull()
  })

  it('forwards a jetton notification from the allowed wallet to the pool', async () => {
    await init(pool)

    // The allowed wallet sends a Jetton notification to the account.
    const notificationBody = buildNotificationBody(3n, toNano('2'), pool.address)
    const res = await allowedWallet.send({
      to: account.address,
      value: toNano('0.2'),
      bounce: false,
      body: notificationBody,
    })

    // The account forwards an OffRampAccount_ForwardNotification to the pool,
    // carrying the original message metadata + body.
    const expectedSender = allowedWallet.address
    expect(res.transactions).toHaveTransaction({
      from: account.address,
      to: pool.address,
      success: true,
      op: OffRampAccount_ForwardNotification.PREFIX,
      body(body) {
        if (!body) return false
        const fwd = OffRampAccount_ForwardNotification.fromSlice(body.beginParse())
        return (
          fwd.message.senderAddress.equals(expectedSender) &&
          fwd.message.body.equals(notificationBody)
        )
      },
    })
  })

  it('bounces a jetton notification from a non-allowed wallet', async () => {
    await init(pool)

    // A random old wallet (not the allowed one) sends to the account — must bounce.
    const res = await attacker.send({
      to: account.address,
      value: toNano('0.2'),
      bounce: false,
      body: buildNotificationBody(3n, toNano('2'), pool.address),
    })
    expect(res.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('bounces unrecognized messages', async () => {
    await init(pool)

    // An unknown opcode with a non-empty body must bounce.
    const res = await attacker.send({
      to: account.address,
      value: toNano('0.2'),
      bounce: false,
      body: beginCell().storeUint(0xdeadbeef, 32).endCell(),
    })
    expect(res.transactions).toHaveTransaction({ to: account.address, success: false })
  })

  it('lets the owner withdraw by forwarding AskToTransfer, and rejects everyone else', async () => {
    await init(pool)
    const to = recipient.address
    const walletAddress = attacker.address // a stand-in wallet address for the AskToTransfer target

    // Owner can withdraw.
    const ownerRes = await account.sendOffRampAccountWithdraw(recipient.getSender(), toNano('0.5'), {
      queryId: 5n,
      walletAddress,
      ask: buildAskToTransfer(toNano('4'), to),
    })
    expect(ownerRes.transactions).toHaveTransaction({
      from: account.address,
      to: walletAddress,
      success: true,
      op: AskToTransfer.PREFIX,
    })

    // Non-owner (pool, attacker) cannot.
    const badPool = await account.sendOffRampAccountWithdraw(pool.getSender(), toNano('0.5'), {
      queryId: 6n,
      walletAddress,
      ask: buildAskToTransfer(toNano('4'), to),
    })
    expect(badPool.transactions).toHaveTransaction({ to: account.address, success: false })

    const badAtk = await account.sendOffRampAccountWithdraw(attacker.getSender(), toNano('0.5'), {
      queryId: 7n,
      walletAddress,
      ask: buildAskToTransfer(toNano('4'), to),
    })
    expect(badAtk.transactions).toHaveTransaction({ to: account.address, success: false })
  })
})
