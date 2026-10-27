import { Blockchain } from '@ton/sandbox'
import { Address, Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import * as of from '../../../../wrappers/gen/ccip/OffRamp'
import { Costs } from '../../../../wrappers/ccip/OffRamp'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import * as tp from '../../../../wrappers/gen/ccip/pools/TokenPool'
import generateMessageID from '../../../../src/offramp/generateMessageID'
import {
  getDefaultMetadataHash,
  OffRampWithTokenPoolTestSetup,
} from '../../../ccip/offramp/OffRamp.Setup'
import { AddressBook, GasReport, gasReportConfig } from '../../utils'
import { createPayload, LANE_MAX_DATA_BYTES } from '../messaging/config'
import { deployTokenWithPool, POOL_KINDS, TokenWithPool } from './pools'

const jestConsole = console

describe('CCIP OffRamp Token Transfer Gas Estimation', () => {
  let blockchain: Blockchain
  let report: GasReport
  let setup: OffRampWithTokenPoolTestSetup
  // Messages must be committed with contiguous sequence numbers; OCR report sequences only need to be unique.
  let seqNr = 1n
  let reportSequence = 1

  beforeEach(() => {
    global.console = require('console')
  })
  afterEach(() => {
    global.console = jestConsole
  })
  afterAll(() => report.finish())

  beforeAll(async () => {
    blockchain = await Blockchain.create({ config: await gasReportConfig() })
    report = new GasReport('tokens-offramp', blockchain)
    setup = await OffRampWithTokenPoolTestSetup.Init(blockchain)
    await setup.SetupContracts()
    await setup.setupOCRConfigs()
  })

  async function deployRegisteredToken(kind: (typeof POOL_KINDS)[number]) {
    const token = await deployTokenWithPool({
      blockchain,
      deployer: setup.deployer,
      kind,
      router: setup.router.address,
      remoteChainSelector: setup.SOURCE_CHAIN_SELECTOR,
      remotePoolAddress: setup.sourcePoolAddress,
      remoteTokenAddress: setup.destTokenAddress,
      liquidity: setup.DEFAULT_TOKEN_AMOUNT * 100n,
    })
    await setup.setupTokenRegistry(token.minter.address, token.pool, token.transferInitiator)
    return token
  }

  async function addressBook(token: TokenWithPool) {
    const receiverAccount = setup.receiverDepositAccount(
      setup.receiver.address,
      token.minter.address,
    )
    const wallet = (owner: Address) => token.minter.getWalletAddress(owner)
    const book = new AddressBook({
      Transmitter: [setup.transmitters[0], 'external'],
      Receiver: [setup.receiver, 'external'],
      OffRamp: [setup.offRamp, 'ccip'],
      Router: [setup.router, 'ccip'],
      FeeQuoter: [setup.feeQuoter, 'ccip'],
      ReceiverAccount: [receiverAccount, 'ccip'],
      TokenAdminRegistry: [setup.registry, 'registry'],
      TokenAdminRegistryEntry: [setup.tokenRegistryAddress(token.minter.address), 'registry'],
      [`${token.kind}Pool`]: [token.pool, 'token'],
      Minter: [token.minter, 'token'],
      ReceiverAccountWallet: [await wallet(receiverAccount), 'token'],
      PoolWallet: [await wallet(token.pool), 'token'],
    })
    if (token.lockbox) {
      book
        .set('LockBox', token.lockbox, 'token')
        .set('LockBoxWallet', await wallet(token.lockbox.address), 'token')
    }
    return book
  }

  async function commitAndExecute(
    label: string,
    token: TokenWithPool,
    book: AddressBook,
    opts: { data?: Cell; gasLimit?: bigint; aborts?: string[] } = {},
  ) {
    const message = setup.createTestMessageWithToken({
      token: token.minter.address,
      sequenceNumber: seqNr,
      messageId: seqNr,
      sourcePoolAddress: setup.sourcePoolAddress,
      data: opts.data,
    })
    if (opts.gasLimit !== undefined) message.gasLimit = opts.gasLimit
    seqNr++

    const root = setup.createMerkleRoot(
      message.header.sequenceNumber,
      message.header.sequenceNumber,
      generateMessageID(message, getDefaultMetadataHash(setup.SOURCE_CHAIN_SELECTOR)),
    )
    await setup.commitReport([root], Costs.commit(true, false), reportSequence++)

    book
      .set('MerkleRoot', setup.merkleRootAddress(root), 'ccip')
      .set('ReceiveExecutor', setup.receiveExecutorAddress(message), 'ccip')

    const { result } = await report.measure(label, {
      run: () => setup.executeReport(setup.createExecuteReport([message]), reportSequence++),
      book,
      aborts: opts.aborts,
      budget: Costs.executeBudget(true),
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.router.address,
      to: token.pool,
      op: tp.TokenPool_ReleaseOrMintDelivered.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      to: setup.offRamp.address,
      op: of.OffRamp_NotifySuccess.PREFIX,
      success: true,
    })
    return result
  }

  describe.each(POOL_KINDS)('%s pool', (kind) => {
    let token: TokenWithPool
    let book: AddressBook

    beforeAll(async () => {
      token = await deployRegisteredToken(kind)
      book = await addressBook(token)
    })

    // The Router initializes the receiver's deposit account on every transfer; once it exists the
    // initialize message fails and bounces.
    const existingAccount = { aborts: ['Router->ReceiverAccount'] }

    it('should measure first token transfer to a receiver (deploys its deposit account)', async () => {
      const result = await commitAndExecute(
        `${kind}: Execute Token Transfer (new receiver account)`,
        token,
        book,
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiverDepositAccount(setup.receiver.address, token.minter.address),
        deploy: true,
        success: true,
      })
    })

    it('should measure token transfer to an existing receiver account', async () => {
      await commitAndExecute(`${kind}: Execute Token Transfer`, token, book, existingAccount)
    })

    it('should measure token transfer without receiver execution (gasLimit 0)', async () => {
      const result = await commitAndExecute(
        `${kind}: Execute Token Transfer (gasLimit 0)`,
        token,
        book,
        { gasLimit: 0n, ...existingAccount },
      )
      expect(result.transactions).not.toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
      })
    })

    it(`should measure token transfer with ${LANE_MAX_DATA_BYTES} bytes of data`, async () => {
      const result = await commitAndExecute(
        `${kind}: Execute Token Transfer + Max Payload`,
        token,
        book,
        { data: createPayload(LANE_MAX_DATA_BYTES), ...existingAccount },
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        op: rt.Receiver_CCIPReceiveV2.PREFIX,
        success: true,
      })
    })
  })
})
