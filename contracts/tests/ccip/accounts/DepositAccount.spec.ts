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
  let code: {
    deployable: Cell
    depositAccount: Cell
  }

  const owner = () => recipient.address
  const proxyAddr = () => proxy.address
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

  // Deploys the account the way a pool does: `Deployable_InitializeAndSend` to the account's
  // deterministic Deployable shell address (namespace `DepositAccount`, owner, id), which
  // upgrades the shell into the account by installing the account's code/data and replaying
  // `DepositAccount_Init` as a self-message. Returns the opened account at the shell address.
  const deployViaDeployable = async (
    forwardPayload: Cell | null = null,
    via: SandboxContract<TreasuryContract> = recipient,
    deploymentValues = {
      deploy: toNano('0.5'),
      init: toNano('0.1'),
    },
  ) => {
    // The Deployable shell: data = (owner, Namespaced{namespace, id}), code = Deployable.
    const deployable = blockchain.openContract(
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

    // Upgrade the shell into the account: the message carries the shell's state init (deploying
    // it), installs the account's code/data, and replays the init as a self-message.
    const res = await deployable.sendInitializeAndSend(via.getSender(), deploymentValues.deploy, {
      stateInit: {
        code: code.depositAccount,
        data: da.DepositAccount_Data.toCell(
          da.DepositAccount_Data.create({
            owner: owner(),
            proxy: proxyAddr(),
            beneficiaries: beneficiaries(),
          }),
        ),
      },
      selfMessage: {
        value: deploymentValues.init,
        body: da.DepositAccount_Init.toCell(da.DepositAccount_Init.create({ forwardPayload })),
      },
    })

    const depositAccount = blockchain.openContract(
      da.DepositAccount.fromAddress(deployable.address),
    )
    return { deployable, depositAccount, res }
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

  it('deploys via Deployable_InitializeAndSend and replies to the owner', async () => {
    const forwardPayload = beginCell().storeUint(0xed696f9b, 32).endCell()
    const { depositAccount, res } = await deployViaDeployable(forwardPayload)

    // The Deployable shell upgrades into the account (code/data installed, init replayed).
    expect(res.transactions).toHaveTransaction({
      from: recipient.address,
      to: depositAccount.address,
      op: da.Deployable_InitializeAndSend.PREFIX,
      deploy: true,
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
        return reply.forwardPayload?.equals(forwardPayload) === true
      },
    })

    // The installed account config matches the deployment's stateInit data.
    expect((await depositAccount.getOwner()).equals(owner())).toBe(true)
    expect((await depositAccount.getProxy()).equals(proxyAddr())).toBe(true)
  })

  it('is idempotent: re-deploying the account re-runs the init and replies again', async () => {
    const first = await deployViaDeployable()
    expect(first.res.transactions).toHaveTransaction({
      from: first.depositAccount.address,
      to: recipient.address,
      op: da.DepositAccount_Reply.PREFIX,
      success: true,
    })

    // A second Deployable_InitializeAndSend to the already-upgraded account is accepted:
    // the account re-installs the same state and re-runs the init (fresh reply).
    const second = await deployViaDeployable()
    expect(second.res.transactions).toHaveTransaction({
      from: recipient.address,
      to: second.depositAccount.address,
      op: da.Deployable_InitializeAndSend.PREFIX,
      success: true,
    })
    expect(second.res.transactions).toHaveTransaction({
      from: second.depositAccount.address,
      to: recipient.address,
      success: true,
      op: da.DepositAccount_Reply.PREFIX,
    })
  })

  it('rejects a Deployable_InitializeAndSend from a non-owner', async () => {
    // The attacker's message is the first to reach the shell, so the Deployable shell itself
    // rejects it (NotOwner) before the depositAccount is ever installed.
    const { deployable } = await deployViaDeployable()
    const res = await deployable.sendInitializeAndSend(attacker.getSender(), toNano('0.1'), {
      stateInit: { code: Cell.EMPTY, data: Cell.EMPTY },
      selfMessage: {
        value: toNano('0.1'),
        body: da.DepositAccount_Init.toCell(
          da.DepositAccount_Init.create({
            forwardPayload: beginCell().storeUint(123n, 32).endCell(),
          }),
        ),
      },
    })
    expect(res.transactions).toHaveTransaction({
      from: attacker.address,
      to: deployable.address,
      success: false,
    })
  })

  it('rejects init from anyone but the depositAccount itself', async () => {
    // The init is replayed as a self-message by Deployable_InitializeAndSend, so a direct
    // init from the owner (or anyone else) is rejected.
    const { depositAccount } = await deployViaDeployable()

    const badOwner = await init(recipient, depositAccount)
    expect(badOwner.transactions).toHaveTransaction({ to: depositAccount.address, success: false })

    const bad = await init(attacker, depositAccount)
    expect(bad.transactions).toHaveTransaction({ to: depositAccount.address, success: false })
  })

  it("low self message value can't drain balance", async () => {
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

    // Deploy with an init self-message below the minimum: the value check in `_onInit` catches it.
    const initValue = MIN_GRAM_TO_INIT - 1n
    const deployValue = MIN_GRAM_TO_RESERVE + initValue
    const forwardPayload = beginCell().storeUint(0xdeadbeef, 32).endCell()
    const { depositAccount, res } = await deployViaDeployable(forwardPayload, recipient, {
      deploy: deployValue,
      init: initValue,
    })

    // The init transaction completes successfully
    expect(res.transactions).toHaveTransaction({
      from: depositAccount.address,
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

  it('forwards unrecognized messages (no bounce at the account)', async () => {
    const { depositAccount } = await deployViaDeployable()

    // Unknown opcodes are forwarded verbatim to the proxy; the account does not bounce them.
    const res = await attacker.send({
      to: depositAccount.address,
      value: toNano('0.2'),
      bounce: false,
      body: beginCell().storeUint(0xdeadbeef, 32).endCell(),
    })
    expect(res.transactions).toHaveTransaction({
      from: depositAccount.address,
      to: proxy.address,
      success: true,
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
