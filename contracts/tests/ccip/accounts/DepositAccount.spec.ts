import '@ton/test-utils'
import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox'
import {
  Address,
  Cell,
  CommonMessageInfoInternal,
  Message,
  beginCell,
  toNano,
  TransactionActionPhase,
  TransactionComputeVm,
  TransactionDescriptionGeneric,
} from '@ton/core'
import { findTransactionRequired } from '@ton/test-utils'
import * as da from '../../../wrappers/gen/ccip/DepositAccount'
import { TransferNotificationForRecipient } from '../../../wrappers/gen/ccip/pools/TokenPool'
import { contractCode } from '../../../wrappers/codeLoader'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import * as Deployable from '../../../wrappers/libraries/Deployable'
import { generateRandomContractId } from '../../../src/utils'

describe('DepositAccount (default forward hook, off-ramp role)', () => {
  let blockchain: Blockchain
  let proxy: SandboxContract<TreasuryContract> // e.g. pool (or Router)
  let recipient: SandboxContract<TreasuryContract> // owner
  let attacker: SandboxContract<TreasuryContract>
  let notifier: SandboxContract<TreasuryContract> // any jetton wallet (token-agnostic account)
  let token: SandboxContract<TreasuryContract> // minter stand-in for the account's token
  let code: {
    deployable: Cell
    depositAccount: Cell
  }

  const owner = () => recipient.address
  const proxyAddr = () => proxy.address
  const tokenAddr = () => token.address
  const beneficiaries = () => new Set<Address>([recipient.address])

  const init = async (
    via: SandboxContract<TreasuryContract>,
    account: SandboxContract<da.DepositAccount>,
    forwardPayload: Cell | null = null,
  ) => {
    return account.sendDepositAccountInit(via.getSender(), toNano('0.5'), {
      forwardPayload,
    })
  }

  // Creates the undeployed Deployable shell for this account: data = (owner,
  // Namespaced{namespace, id}), code = Deployable.
  const makeDeployableShell = () =>
    blockchain.openContract(
      Deployable.ContractClient.createFromConfig(
        {
          owner: owner(),
          id: Deployable.builder.data.namespaced.encode({
            namespace: NameSpace.CCIPNamespace.DepositAccount,
            id: beginCell().storeAddress(recipient.address),
          }),
        },
        code.deployable,
      ),
    )

  // Deploys the account the way a pool does, with a two-message sequence: `Deployable_Initialize`
  // to the account's deterministic Deployable shell address (namespace `DepositAccount`, owner,
  // id) installs the account's code/data, then `DepositAccount_Init` sent directly by the owner
  // activates it. The two messages are enqueued and processed in order. Returns the opened account
  // at the shell address.
  const deployViaDeployable = async (
    forwardPayload: Cell | null = null,
    via: SandboxContract<TreasuryContract> = recipient,
    deploymentValues = {
      deploy: toNano('0.5'),
      init: toNano('0.1'),
    },
  ) => {
    const deployable = makeDeployableShell()

    // 1. Install the account's code/data at the shell address.
    const deployRes = await deployable.sendInitialize(via.getSender(), deploymentValues.deploy, {
      stateInit: {
        code: code.depositAccount,
        data: da.DepositAccount_Data.toCell(
          da.DepositAccount_Data.create({
            owner: owner(),
            proxy: proxyAddr(),
            token: tokenAddr(),
            beneficiaries: beneficiaries(),
          }),
        ),
      },
    })

    const depositAccount = blockchain.openContract(
      da.DepositAccount.fromAddress(deployable.address),
    )

    // 2. Init the freshly installed account (sent directly by the owner = `via`).
    const res = await depositAccount.sendDepositAccountInit(
      via.getSender(),
      deploymentValues.init,
      {
        forwardPayload,
      },
    )

    return { deployable, depositAccount, deployRes, res }
  }

  const buildAskToTransfer = (amount: bigint, to: Address, requester: Address | null = null) =>
    da.AskToTransfer.create({
      jettonAmount: amount,
      transferRecipient: to,
      sendExcessesTo: requester,
      customPayload: null,
      forwardTonAmount: 0n,
      forwardPayload: da.ForwardPayloadRemainder.fromSlice(Cell.EMPTY.beginParse()),
    })

  // Build a boxed Jetton `TransferNotificationForRecipient` body as a real wallet would send it
  // (the forward payload is boxed as a maybe_ref; here empty — no CCIPSend carried).
  const buildNotificationBody = (queryId: bigint, amount: bigint, to: Address) =>
    TransferNotificationForRecipient.toCell(
      TransferNotificationForRecipient.create({
        queryId,
        jettonAmount: amount,
        transferInitiator: to,
        forwardPayload: beginCell().storeMaybeRef(null).asSlice(),
      }),
    )

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    code = {
      deployable: await contractCode.ccip.local('Deployable'),
      depositAccount: await contractCode.ccip.local('ccip.account.DepositAccount'),
    }
  })

  beforeEach(async () => {
    proxy = await blockchain.treasury('proxy')
    recipient = await blockchain.treasury(`recipient_${generateRandomContractId()}`)
    attacker = await blockchain.treasury('attacker')
    notifier = await blockchain.treasury('notifier')
    token = await blockchain.treasury('token')
  })

  it('deploys with owner and proxy', async () => {
    const { depositAccount } = await deployViaDeployable()
    expect((await depositAccount.getOwner()).equals(owner())).toBe(true)
    expect((await depositAccount.getProxy()).equals(proxyAddr())).toBe(true)
  })

  it('reports type and version', async () => {
    const { depositAccount } = await deployViaDeployable()
    const [name, version] = await depositAccount.getTypeAndVersion()
    expect(name.loadStringTail()).toBe('link.chain.ton.ccip.account.DepositAccount')
    expect(version.loadStringTail()).toBe('0.1.0')
  })

  it('deploys via Deployable_Initialize + DepositAccount_Init and replies to the owner', async () => {
    const forwardPayload = beginCell().storeUint(0xed696f9b, 32).endCell()
    const { depositAccount, deployRes, res } = await deployViaDeployable(forwardPayload)

    // The Deployable shell upgrades into the account (code/data installed).
    expect(deployRes.transactions).toHaveTransaction({
      from: recipient.address,
      to: depositAccount.address,
      op: Deployable.opcodes.in.initialize,
      deploy: true,
      success: true,
    })

    // The owner-sent init is accepted by the installed account.
    expect(res.transactions).toHaveTransaction({
      from: recipient.address,
      to: depositAccount.address,
      op: da.DepositAccount_Init.PREFIX,
      success: true,
    })

    // The account sent DepositAccount_Reply back to the owner, echoing `forwardPayload`.
    expect(res.transactions).toHaveTransaction({
      from: depositAccount.address,
      to: recipient.address,
      success: true,
      op: da.DepositAccount_Reply.PREFIX,
      body(body) {
        if (!body) return false
        const reply = da.DepositAccount_Reply.fromSlice(body.beginParse())
        return (
          reply.token.equals(tokenAddr()) && reply.forwardPayload?.equals(forwardPayload) === true
        )
      },
    })

    // The installed account config matches the deployment's stateInit data.
    expect((await depositAccount.getOwner()).equals(owner())).toBe(true)
    expect((await depositAccount.getProxy()).equals(proxyAddr())).toBe(true)
  })

  it('is idempotent: a retried deploy bounces the Initialize but re-runs the init and replies again', async () => {
    const first = await deployViaDeployable()
    expect(first.res.transactions).toHaveTransaction({
      from: first.depositAccount.address,
      to: recipient.address,
      op: da.DepositAccount_Reply.PREFIX,
      success: true,
    })

    // A second Deployable_Initialize to the already-upgraded account is rejected by the account
    // (opcode mismatch — the Deployable shell no longer exists at that address).
    const second = await deployViaDeployable()
    expect(second.deployRes.transactions).toHaveTransaction({
      from: recipient.address,
      to: second.depositAccount.address,
      op: Deployable.opcodes.in.initialize,
      success: false,
    })
    // The init still succeeds and re-confirms the account (fresh reply).
    expect(second.res.transactions).toHaveTransaction({
      from: second.depositAccount.address,
      to: recipient.address,
      success: true,
      op: da.DepositAccount_Reply.PREFIX,
    })
  })

  it('rejects a Deployable_Initialize from a non-owner', async () => {
    // The attacker's message is the first to reach the shell, so the Deployable shell itself
    // rejects it (NotOwner) before the depositAccount is ever installed.
    const deployable = makeDeployableShell()
    const res = await deployable.sendInitialize(attacker.getSender(), toNano('0.1'), {
      stateInit: { code: Cell.EMPTY, data: Cell.EMPTY },
    })
    expect(res.transactions).toHaveTransaction({
      from: attacker.address,
      to: deployable.address,
      success: false,
    })
  })

  it('accepts plain TON transfers (empty body)', async () => {
    const { depositAccount } = await deployViaDeployable()

    // An empty body is the "accept TONs" case: the account takes the coins without forwarding
    // anything to the proxy.
    const res = await attacker.send({
      to: depositAccount.address,
      value: toNano('0.2'),
      bounce: false,
      body: Cell.EMPTY,
    })
    expect(res.transactions).toHaveTransaction({
      to: depositAccount.address,
      success: true,
    })
    expect(res.transactions).not.toHaveTransaction({
      from: depositAccount.address,
      to: proxy.address,
      op: da.DepositAccount_ForwardNotification.PREFIX,
    })
  })

  it('accepts init from the owner and rejects init from anyone else', async () => {
    // The init is sent directly by the owner in the new deployment flow, so the owner's init is
    // accepted; anyone else is rejected (OnlyOwner).
    const { depositAccount } = await deployViaDeployable()

    const good = await init(recipient, depositAccount)
    expect(good.transactions).toHaveTransaction({ to: depositAccount.address, success: true })

    const bad = await init(attacker, depositAccount)
    expect(bad.transactions).toHaveTransaction({ to: depositAccount.address, success: false })
  })

  it("low init message value can't drain balance", async () => {
    const MIN_GRAM_TO_RESERVE = toNano('0.05')
    const MIN_GRAM_TO_INIT = toNano('0.01')
    const { depositAccount, res } = await deployViaDeployable(null, recipient, {
      deploy: MIN_GRAM_TO_RESERVE,
      init: MIN_GRAM_TO_INIT,
    })

    // Below the minimum, the account replies with a failure message instead of reserving.
    expect(res.transactions).toHaveTransaction({
      from: depositAccount.address,
      to: recipient.address,
      success: true,
      op: da.DepositAccount_NotEnoughValue.PREFIX,
    })
    expect(res.transactions).not.toHaveTransaction({
      from: depositAccount.address,
      to: recipient.address,
      op: da.DepositAccount_Reply.PREFIX,
    })

    // The failure reply only carries the init message's remaining value (never the account
    // balance), so the deploy funds can't be drained.
    const balance = (await blockchain.getContract(depositAccount.address)).balance
    expect(balance).toBeGreaterThanOrEqual(MIN_GRAM_TO_INIT)
  })

  it('init below MIN_GRAM_TO_INIT + MIN_GRAM_TO_RESERVE replies DepositAccount_NotEnoughValue instead of reserving', async () => {
    const MIN_GRAM_TO_RESERVE = toNano('0.05')
    const MIN_GRAM_TO_INIT = toNano('0.01')

    // Deploy with an init message below the minimum: the value check in `_onInit` catches it.
    // The account's balance at init time is (deploy value - deploy gas) + init value, which stays
    // below MIN_GRAM_TO_RESERVE + MIN_GRAM_TO_INIT.
    const initValue = MIN_GRAM_TO_INIT - 1n
    const deployValue = MIN_GRAM_TO_RESERVE
    const forwardPayload = beginCell().storeUint(0xdeadbeef, 32).endCell()
    const { depositAccount, res } = await deployViaDeployable(forwardPayload, recipient, {
      deploy: deployValue,
      init: initValue,
    })

    // The init transaction completes successfully
    expect(res.transactions).toHaveTransaction({
      from: recipient.address,
      to: depositAccount.address,
      op: da.DepositAccount_Init.PREFIX,
      success: true,
    })

    // The account replies to the owner with DepositAccount_NotEnoughValue, echoing the
    // init's forwardPayload for correlation.
    expect(res.transactions).toHaveTransaction({
      from: depositAccount.address,
      to: recipient.address,
      success: true,
      op: da.DepositAccount_NotEnoughValue.PREFIX,
      body(body) {
        if (!body) return false
        const reply = da.DepositAccount_NotEnoughValue.fromSlice(body.beginParse())
        return reply.forwardPayload?.equals(forwardPayload) === true
      },
    })

    // No success reply is sent and nothing is reserved.
    expect(res.transactions).not.toHaveTransaction({
      from: depositAccount.address,
      to: recipient.address,
      op: da.DepositAccount_Reply.PREFIX,
    })
    const balance = (await blockchain.getContract(depositAccount.address)).balance
    expect(balance).toBeLessThan(MIN_GRAM_TO_RESERVE)
  })

  it('forwards a jetton notification from any wallet to the proxy', async () => {
    const { depositAccount } = await deployViaDeployable()

    // Any wallet (token-agnostic account) sends a Jetton notification to the account.
    const notificationBody = buildNotificationBody(3n, toNano('2'), proxy.address)
    const res = await notifier.send({
      to: depositAccount.address,
      value: toNano('0.2'),
      bounce: false,
      body: notificationBody,
    })

    // The account forwards a DepositAccount_ForwardNotification to the proxy,
    // carrying the original message metadata + body (including the original senderAddress).
    const expectedSender = notifier.address
    expect(res.transactions).toHaveTransaction({
      from: depositAccount.address,
      to: proxy.address,
      success: true,
      op: da.DepositAccount_ForwardNotification.PREFIX,
      body(body) {
        if (!body) return false
        const fwd = da.DepositAccount_ForwardNotification.fromSlice(body.beginParse())
        return (
          fwd.message.senderAddress.equals(expectedSender) &&
          fwd.message.body.equals(notificationBody)
        )
      },
    })
  })

  it('forwards a jetton notification even from a non-account wallet sender (auth lives in the pool)', async () => {
    const { depositAccount } = await deployViaDeployable()

    // The account does not gate on a trusted wallet: any sender is forwarded, and the pool (proxy)
    // is responsible for verifying `senderAddress` against the expected wallet before finalizing.
    const notificationBody = buildNotificationBody(3n, toNano('2'), proxy.address)
    const res = await attacker.send({
      to: depositAccount.address,
      value: toNano('0.2'),
      bounce: false,
      body: notificationBody,
    })
    expect(res.transactions).toHaveTransaction({
      from: depositAccount.address,
      to: proxy.address,
      success: true,
      op: da.DepositAccount_ForwardNotification.PREFIX,
    })
  })

  it('bounces unrecognized messages (only jetton notifications are forwarded)', async () => {
    const { depositAccount } = await deployViaDeployable()

    // Unknown opcodes are not forwarded: the account only accepts jetton transfer notifications
    // (besides control messages), everything else bounces.
    const res = await attacker.send({
      to: depositAccount.address,
      value: toNano('0.2'),
      bounce: false,
      body: beginCell().storeUint(0xdeadbeef, 32).endCell(),
    })
    expect(res.transactions).toHaveTransaction({
      to: depositAccount.address,
      success: false,
    })
    expect(res.transactions).not.toHaveTransaction({
      from: depositAccount.address,
      to: proxy.address,
      op: da.DepositAccount_ForwardNotification.PREFIX,
    })
  })

  it('lets a beneficiary withdraw by forwarding AskToTransfer, and rejects everyone else', async () => {
    const { depositAccount } = await deployViaDeployable()
    const to = recipient.address
    const walletAddress = attacker.address // a stand-in wallet address for the AskToTransfer target

    // The beneficiary (owner) can withdraw.
    const ownerRes = await depositAccount.sendDepositAccountWithdraw(
      recipient.getSender(),
      toNano('0.5'),
      {
        walletAddress,
        ask: buildAskToTransfer(toNano('4'), to, recipient.address),
      },
    )
    expect(ownerRes.transactions).toHaveTransaction({
      from: depositAccount.address,
      to: walletAddress,
      success: true,
      op: da.AskToTransfer.PREFIX,
    })

    // Non-beneficiary (proxy, attacker) cannot.
    const badProxy = await depositAccount.sendDepositAccountWithdraw(
      proxy.getSender(),
      toNano('0.5'),
      {
        walletAddress,
        ask: buildAskToTransfer(toNano('4'), to, proxy.address),
      },
    )
    expect(badProxy.transactions).toHaveTransaction({ to: depositAccount.address, success: false })

    const badAtk = await depositAccount.sendDepositAccountWithdraw(
      attacker.getSender(),
      toNano('0.5'),
      {
        walletAddress,
        ask: buildAskToTransfer(toNano('4'), to, attacker.address),
      },
    )
    expect(badAtk.transactions).toHaveTransaction({ to: depositAccount.address, success: false })

    // A beneficiary must set `ask.sendExcessesTo` to themselves, else the withdraw is rejected.
    const badExcess = await depositAccount.sendDepositAccountWithdraw(
      recipient.getSender(),
      toNano('0.5'),
      {
        walletAddress,
        ask: buildAskToTransfer(toNano('4'), to, proxy.address), // sendExcessesTo != requester
      },
    )
    expect(badExcess.transactions).toHaveTransaction({ to: depositAccount.address, success: false })
  })
})
