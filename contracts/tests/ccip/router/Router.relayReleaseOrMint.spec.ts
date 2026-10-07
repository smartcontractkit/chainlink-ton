import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'

import * as coverage from '../../coverage/coverage'
import { contractCode } from '../../../wrappers/codeLoader'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as deposit from '../../../wrappers/gen/ccip/DepositAccount'
import * as dep from '../../../wrappers/libraries/Deployable'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import EVM_ADDRESS from '../../utils/evmAddress'
import { ChainSelectors } from '../../utils/Selectors'
import { setup, contractsCoverageConfig } from './Router.Setup'

const relayValue = toNano('1')

// Router_Error.DepositAccountInitFailed follows SenderIsNotDepositAccount in the enum. It is only
// reported as an exit code, never thrown, so the generated Errors map omits it.
const DEPOSIT_ACCOUNT_INIT_FAILED = rt.Router.Errors['Router_Error.SenderIsNotDepositAccount'] + 1

describe('Router.relayReleaseOrMint', () => {
  let blockchain: Blockchain
  let receiver: SandboxContract<TreasuryContract>
  let attacker: SandboxContract<TreasuryContract>
  let tokenPool: SandboxContract<TreasuryContract>
  let executor: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>
  let deployableCode: Cell
  let token: Address
  let otherToken: Address

  const sourceChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
    offRamp = await blockchain.treasury('offRamp')
    deployableCode = await contractCode.ccip.local('Deployable')
  })

  beforeEach(async () => {
    ;({ receiver, router } = await setup(blockchain, { feeQuoter, onRamp, offRamp }))
    attacker = await blockchain.treasury('attacker')
    tokenPool = await blockchain.treasury('tokenPool')
    executor = await blockchain.treasury('receiveExecutor')
    token = (await blockchain.treasury('jettonMaster')).address
    otherToken = (await blockchain.treasury('otherJettonMaster')).address
  })

  // Router.receiverDepositAccount: Deployable namespace DepositAccount, owner = Router,
  // id = (receiver, token).
  const receiverAccountFor = (user: Address = receiver.address, jetton: Address = token) =>
    NameSpace.deriveAddress(
      router.address,
      NameSpace.CCIPNamespace.DepositAccount,
      beginCell().storeAddress(user).storeAddress(jetton),
      deployableCode,
    )

  const relayOf = (queryID: bigint, jetton: Address = token) =>
    rt.Router_RelayReleaseOrMint.create({
      queryID,
      sourceChainSelector,
      tokenPool: tokenPool.address,
      request: rt.TokenPool_ReleaseOrMintInV1.create({
        transfer: rt.TokenPool_Transfer.create({
          id: queryID,
          details: rt.TokenPool_TransferDetails.create({
            originalSender: EVM_ADDRESS,
            remoteChainSelector: sourceChainSelector,
            receiver: receiver.address,
            amount: 1000n,
            localToken: jetton,
          }),
        }),
        sourcePoolAddress: EVM_ADDRESS,
        sourcePoolData: null,
        offchainTokenData: null,
      }),
      requestedFinalityConfig: 0n,
      replyTo: executor.address,
    })

  const relay = (relayMsg: rt.Router_RelayReleaseOrMint, via = offRamp) =>
    router.sendRouterRelayReleaseOrMint(via.getSender(), relayValue, relayMsg)

  const expectRelayedToPool = (
    result: Awaited<ReturnType<typeof relay>>,
    queryID: bigint,
    account: Address,
  ) =>
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: tokenPool.address,
      op: rt.TokenPool_ReleaseOrMint.PREFIX,
      body(body) {
        if (!body) return false
        const msg = rt.TokenPool_ReleaseOrMint.fromSlice(body.beginParse())
        return (
          msg.queryId === queryID &&
          msg.receiverAccount?.equals(account) === true &&
          msg.replyTo?.equals(executor.address) === true
        )
      },
    })

  describe('receiver deposit account deployment', () => {
    it('exposes the derived account address via the depositAccountAddress getter', async () => {
      const getterAddress = await router.getDepositAccountAddress(receiver.address, token)
      expect(getterAddress.equals(receiverAccountFor())).toBe(true)
    })

    it('gives the same receiver a different deposit account per token', async () => {
      const forToken = await router.getDepositAccountAddress(receiver.address, token)
      const forOtherToken = await router.getDepositAccountAddress(receiver.address, otherToken)
      expect(forToken.equals(forOtherToken)).toBe(false)
    })

    it('deploys the receiver account, then relays ReleaseOrMint with it as receiverAccount', async () => {
      const account = receiverAccountFor()
      const relayMsg = relayOf(1n)
      const result = await relay(relayMsg)

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: account,
        op: dep.opcodes.in.initialize,
        deploy: true,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: account,
        op: deposit.DepositAccount_Init.PREFIX,
        success: true,
      })
      // The account echoes the relay back so the Router can resume it.
      expect(result.transactions).toHaveTransaction({
        from: account,
        to: router.address,
        op: deposit.DepositAccount_Reply.PREFIX,
        success: true,
        body(body) {
          if (!body) return false
          const reply = deposit.DepositAccount_Reply.fromSlice(body.beginParse())
          return (
            reply.forwardPayload?.equals(rt.Router_RelayReleaseOrMint.toCell(relayMsg)) === true
          )
        },
      })
      expectRelayedToPool(result, 1n, account)
    })

    it('initializes the account with the Router as owner, the receiver as proxy and sole beneficiary', async () => {
      await relay(relayOf(2n))

      const account = blockchain.openContract(
        deposit.DepositAccount.fromAddress(receiverAccountFor()),
      )
      expect((await account.getOwner()).equals(router.address)).toBe(true)
      expect((await account.getProxy()).equals(receiver.address)).toBe(true)
      expect((await account.getToken()).equals(token)).toBe(true)
      const beneficiaries = [...(await account.getBeneficiaries()).keys()]
      expect(beneficiaries).toHaveLength(1)
      expect(beneficiaries[0].equals(receiver.address)).toBe(true)
    })

    it('reuses an already deployed account: the retried Initialize bounce is ignored', async () => {
      await relay(relayOf(3n))
      const result = await relay(relayOf(4n))

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiverAccountFor(),
        op: dep.opcodes.in.initialize,
        success: false,
      })
      expect(result.transactions).toHaveTransaction({
        from: receiverAccountFor(),
        to: router.address,
        inMessageBounced: true,
        success: true,
      })
      expect(result.transactions).not.toHaveTransaction({
        from: router.address,
        to: offRamp.address,
        op: rt.Router_TokenPoolReleaseOrMintFailed.PREFIX,
      })
      expectRelayedToPool(result, 4n, receiverAccountFor())
    })

    it('deploys a separate account for each token of the same receiver', async () => {
      await relay(relayOf(5n))
      const result = await relay(relayOf(6n, otherToken))
      const otherAccount = receiverAccountFor(receiver.address, otherToken)

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: otherAccount,
        op: dep.opcodes.in.initialize,
        deploy: true,
        success: true,
      })
      expectRelayedToPool(result, 6n, otherAccount)

      const account = blockchain.openContract(deposit.DepositAccount.fromAddress(otherAccount))
      expect((await account.getToken()).equals(otherToken)).toBe(true)
    })
  })

  describe('resuming the relay', () => {
    it('rejects a spoofed DepositAccount_Reply carrying a relay', async () => {
      const result = await router.sendDepositAccountReply(attacker.getSender(), toNano('0.5'), {
        forwardPayload: rt.Router_RelayReleaseOrMint.toCell(relayOf(10n)),
      })
      expect(result.transactions).toHaveTransaction({
        from: attacker.address,
        to: router.address,
        success: false,
        exitCode: rt.Router.Errors['Router_Error.SenderIsNotDepositAccount'],
      })
      expect(result.transactions).not.toHaveTransaction({
        to: tokenPool.address,
        op: rt.TokenPool_ReleaseOrMint.PREFIX,
      })
    })

    it("rejects a reply from the receiver's account of a different token than the relayed one", async () => {
      await relay(relayOf(11n))

      // The genuine (receiver, token) account replies with a relay for (receiver, otherToken).
      const result = await router.sendDepositAccountReply(
        blockchain.sender(receiverAccountFor()),
        toNano('0.5'),
        { forwardPayload: rt.Router_RelayReleaseOrMint.toCell(relayOf(12n, otherToken)) },
      )
      expect(result.transactions).toHaveTransaction({
        to: router.address,
        success: false,
        exitCode: rt.Router.Errors['Router_Error.SenderIsNotDepositAccount'],
      })
      expect(result.transactions).not.toHaveTransaction({
        to: tokenPool.address,
        op: rt.TokenPool_ReleaseOrMint.PREFIX,
      })
    })

    it('fails the relay back to the OffRamp when the receiver account reports NotEnoughValue', async () => {
      const result = await router.sendDepositAccountNotEnoughValue(
        blockchain.sender(receiverAccountFor()),
        toNano('0.5'),
        { forwardPayload: rt.Router_RelayReleaseOrMint.toCell(relayOf(13n)) },
      )
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: offRamp.address,
        op: rt.Router_TokenPoolReleaseOrMintFailed.PREFIX,
        body(body) {
          if (!body) return false
          const failed = rt.Router_TokenPoolReleaseOrMintFailed.fromSlice(body.beginParse())
          return (
            failed.queryID === 13n &&
            failed.tokenPool.equals(tokenPool.address) &&
            failed.replyTo.equals(executor.address) &&
            failed.exitCode === BigInt(DEPOSIT_ACCOUNT_INIT_FAILED)
          )
        },
      })
      expect(result.transactions).not.toHaveTransaction({
        to: tokenPool.address,
        op: rt.TokenPool_ReleaseOrMint.PREFIX,
      })
    })

    it('rejects a NotEnoughValue for a relay that does not come from the receiver account', async () => {
      const result = await router.sendDepositAccountNotEnoughValue(
        attacker.getSender(),
        toNano('0.5'),
        { forwardPayload: rt.Router_RelayReleaseOrMint.toCell(relayOf(14n)) },
      )
      expect(result.transactions).toHaveTransaction({
        from: attacker.address,
        to: router.address,
        success: false,
        exitCode: rt.Router.Errors['Router_Error.SenderIsNotDepositAccount'],
      })
      expect(result.transactions).not.toHaveTransaction({
        to: offRamp.address,
        op: rt.Router_TokenPoolReleaseOrMintFailed.PREFIX,
      })
    })
  })

  describe('token transfer delivery', () => {
    const delivered = (selector: bigint = sourceChainSelector) =>
      rt.TokenPool_DeliveredTransfer.create({
        remoteChainSelector: selector,
        localToken: token,
        receiver: receiver.address,
        amount: 1000n,
      })

    it('relays the OffRamp delivery confirmation to the pool', async () => {
      const result = await router.sendRouterTokenTransferDelivered(
        offRamp.getSender(),
        toNano('0.1'),
        { queryId: 20n, tokenPool: tokenPool.address, transfer: delivered() },
      )
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: tokenPool.address,
        op: rt.TokenPool_ReleaseOrMintDelivered.PREFIX,
        body(body) {
          if (!body) return false
          const msg = rt.TokenPool_ReleaseOrMintDelivered.fromSlice(body.beginParse())
          return (
            msg.queryId === 20n &&
            msg.transfer.amount === 1000n &&
            msg.transfer.localToken.equals(token) &&
            msg.transfer.receiver.equals(receiver.address) &&
            msg.transfer.remoteChainSelector === sourceChainSelector
          )
        },
      })
    })

    it('rejects a delivery confirmation that does not come from the OffRamp', async () => {
      const result = await router.sendRouterTokenTransferDelivered(
        attacker.getSender(),
        toNano('0.1'),
        { queryId: 21n, tokenPool: tokenPool.address, transfer: delivered() },
      )
      expect(result.transactions).toHaveTransaction({
        from: attacker.address,
        to: router.address,
        success: false,
        exitCode: rt.Router.Errors['Router_Error.SenderIsNotOffRamp'],
      })
      expect(result.transactions).not.toHaveTransaction({ to: tokenPool.address })
    })

    it('rejects a delivery confirmation for a source chain without an OffRamp', async () => {
      const result = await router.sendRouterTokenTransferDelivered(
        offRamp.getSender(),
        toNano('0.1'),
        {
          queryId: 22n,
          tokenPool: tokenPool.address,
          transfer: delivered(sourceChainSelector + 1n),
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: router.address,
        success: false,
        exitCode: rt.Router.Errors['Router_Error.SourceChainNotEnabled'],
      })
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_relayReleaseOrMint',
        await contractsCoverageConfig(),
      )
    }
  })
})
