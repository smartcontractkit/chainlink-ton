import { Blockchain, SendMessageResult } from '@ton/sandbox'
import { Address, toNano } from '@ton/core'
import '@ton/test-utils'

import * as of from '../../../../wrappers/gen/ccip/OffRamp'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import * as tr from '../../../../wrappers/gen/ccip/TestReceiver'
import * as deployable from '../../../../wrappers/libraries/Deployable'
import generateMessageID from '../../../../src/offramp/generateMessageID'
import {
  createSignatures,
  getDefaultMetadataHash,
  OffRampTestSetup,
} from '../../../ccip/offramp/OffRamp.Setup'
import * as ocr from '../../../../wrappers/libraries/ocr/MultiOCR3Base'
import { Costs } from '../../../../wrappers/ccip/OffRamp'
import { MerkleHelper } from '../../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { generateMockTonAddress } from '../../../../src/utils'
import { ChainSelectors } from '../../../utils/Selectors'
import { AddressBook, GasReport, gasReportConfig } from '../../utils'
import { createPayload, LANE_MAX_DATA_BYTES } from './config'

const jestConsole = console

describe('CCIP OffRamp Gas Estimation', () => {
  let blockchain: Blockchain
  let report: GasReport
  let setup: OffRampTestSetup
  let book: AddressBook

  beforeEach(() => {
    global.console = require('console')
  })
  afterEach(() => {
    global.console = jestConsole
  })
  afterAll(() => report.finish())

  beforeAll(async () => {
    blockchain = await Blockchain.create({ config: await gasReportConfig() })
    report = new GasReport('messaging-offramp', blockchain)
    setup = await OffRampTestSetup.Init(blockchain)
    await setup.SetupContracts()
    await setup.setupOCRConfigs()
    book = new AddressBook({
      Transmitter: [setup.transmitters[0], 'external'],
      Receiver: [setup.receiver, 'external'],
      OffRamp: [setup.offRamp, 'ccip'],
      Router: [setup.router, 'ccip'],
      FeeQuoter: [setup.feeQuoter, 'ccip'],
    })
  })

  function nameReceiveExecutor(result: SendMessageResult) {
    const executor = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src instanceof Address &&
        tx.inMessage.info.src.equals(setup.offRamp.address) &&
        tx.inMessage.body.beginParse().preloadUint(32) === deployable.opcodes.in.initialize,
    )?.inMessage?.info.dest
    if (!(executor instanceof Address)) throw new Error('ReceiveExecutor not found')
    book.set('ReceiveExecutor', executor, 'ccip')
  }

  it(`should measure commit and execute of a message with ${LANE_MAX_DATA_BYTES} bytes of data`, async () => {
    const message = setup.createTestMessage(
      1n,
      1n,
      setup.receiver.address,
      createPayload(LANE_MAX_DATA_BYTES),
    )
    const root = setup.createMerkleRoot(
      1n,
      1n,
      generateMessageID(message, getDefaultMetadataHash(setup.SOURCE_CHAIN_SELECTOR)),
    )
    book.set('MerkleRoot', setup.merkleRootAddress(root), 'ccip')

    const commit = await report.measure('OffRamp Commit (1 merkle root)', {
      run: () => setup.commitReport([root], Costs.commit(true, false), 1),
      book,
      budget: Costs.commit(true, false) - Costs.merkleRootDeployment,
    })
    expect(commit.result.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.merkleRootAddress(root),
      deploy: true,
      success: true,
    })

    const execute = await report.measure('OffRamp Execute + Max Payload', {
      run: () => setup.executeReport(setup.createExecuteReport([message]), 2),
      book,
      discover: nameReceiveExecutor,
      budget: Costs.executeBudget(false),
    })
    expect(execute.result.transactions).toHaveTransaction({
      from: setup.router.address,
      to: setup.receiver.address,
      op: rt.Receiver_CCIPReceiveV2.PREFIX,
      success: true,
    })
    expect(execute.result.transactions).toHaveTransaction({
      to: setup.offRamp.address,
      op: of.OffRamp_NotifySuccess.PREFIX,
      success: true,
    })
  })

  // Commits are capped at 64 messages per root (OffRamp_Error.TooManyMessagesInReport), so a proof
  // has at most 6 siblings. The last leaf of a full root is the costliest to verify.
  it('should measure execute of a message from a 64-message commit', async () => {
    const first = 2n
    const messages = Array.from({ length: 64 }, (_, i) =>
      setup.createTestMessage(
        first + BigInt(i),
        first + BigInt(i),
        setup.receiver.address,
        createPayload(LANE_MAX_DATA_BYTES),
      ),
    )
    const metadataHash = getDefaultMetadataHash(setup.SOURCE_CHAIN_SELECTOR)
    const tree = new MerkleHelper().createTree(
      messages.map((m) => generateMessageID(m, metadataHash)),
    )
    const root = setup.createMerkleRoot(first, first + 63n, tree.getRoot())
    book.set('MerkleRoot', setup.merkleRootAddress(root), 'ccip')
    await setup.commitReport([root], Costs.commit(true, false), 3)

    const proof = tree.prove([63])
    const executionReport = {
      ...setup.createExecuteReport([messages[63]]),
      proofs: proof.hashes,
      proofFlagBits: new MerkleHelper().packBools(proof.sourceFlags),
    }
    const { result } = await report.measure('OffRamp Execute + Max Payload (64-message commit)', {
      run: () => setup.executeReport(executionReport, 4),
      book,
      discover: nameReceiveExecutor,
      budget: Costs.executeBudget(false),
    })
    expect(result.transactions).toHaveTransaction({
      to: setup.offRamp.address,
      op: of.OffRamp_NotifySuccess.PREFIX,
      success: true,
    })
  })

  it('should measure a commit with price updates', async () => {
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: Array.from({ length: 8 }, () =>
        of.TokenPriceUpdate.create({ sourceToken: generateMockTonAddress(), usdPerToken: 1n }),
      ),
      gasPriceUpdates: [
        of.GasPriceUpdate.create({
          destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        }),
      ],
    })
    // Sent directly: the setup's log assertion cannot decode a multi-cell price list.
    const commitReport = of.CommitReport.create({ priceUpdates, merkleRoots: [] })
    const sequenceBytes = 5
    const signatures = createSignatures(
      setup.signers.slice(0, 2),
      ocr.hashReport(of.CommitReport.toCell(commitReport), {
        configDigest: setup.configDigest,
        padding: 0n,
        sequenceBytes,
      }),
    )
    const { result } = await report.measure('OffRamp Commit + price updates (8 tokens, 1 gas)', {
      run: () =>
        setup.offRamp.sendOffRampCommit(
          setup.transmitters[0].getSender(),
          Costs.commit(false, true),
          {
            reportContext: of.ReportContext.create({
              configDigest: setup.configDigest,
              sequenceBytes: BigInt(sequenceBytes),
            }),
            report: commitReport,
            signatures,
          },
        ),
      book,
      budget: Costs.commit(false, true),
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.feeQuoter.address,
      success: true,
    })
  })

  it('should measure a commit with a root and price updates', async () => {
    const seq = 66n
    const message = setup.createTestMessage(seq, seq, setup.receiver.address)
    const root = setup.createMerkleRoot(
      seq,
      seq,
      generateMessageID(message, getDefaultMetadataHash(setup.SOURCE_CHAIN_SELECTOR)),
    )
    book.set('MerkleRoot', setup.merkleRootAddress(root), 'ccip')
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: Array.from({ length: 8 }, () =>
        of.TokenPriceUpdate.create({ sourceToken: generateMockTonAddress(), usdPerToken: 1n }),
      ),
      gasPriceUpdates: [
        of.GasPriceUpdate.create({
          destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        }),
      ],
    })
    const commitReport = of.CommitReport.create({ priceUpdates, merkleRoots: [root] })
    const sequenceBytes = 6
    const signatures = createSignatures(
      setup.signers.slice(0, 2),
      ocr.hashReport(of.CommitReport.toCell(commitReport), {
        configDigest: setup.configDigest,
        padding: 0n,
        sequenceBytes,
      }),
    )
    const { result } = await report.measure('OffRamp Commit + root + price updates', {
      run: () =>
        setup.offRamp.sendOffRampCommit(
          setup.transmitters[0].getSender(),
          Costs.commit(true, true),
          {
            reportContext: of.ReportContext.create({
              configDigest: setup.configDigest,
              sequenceBytes: BigInt(sequenceBytes),
            }),
            report: commitReport,
            signatures,
          },
        ),
      book,
      budget: Costs.commit(true, true) - Costs.merkleRootDeployment,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.merkleRootAddress(root),
      deploy: true,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.feeQuoter.address,
      success: true,
    })
  })

  it(`should measure execute of a message with ${LANE_MAX_DATA_BYTES} bytes of data rejected by the receiver`, async () => {
    const seq = 67n
    const message = setup.createTestMessage(
      seq,
      seq,
      setup.receiver.address,
      createPayload(LANE_MAX_DATA_BYTES),
    )
    const root = setup.createMerkleRoot(
      seq,
      seq,
      generateMessageID(message, getDefaultMetadataHash(setup.SOURCE_CHAIN_SELECTOR)),
    )
    book.set('MerkleRoot', setup.merkleRootAddress(root), 'ccip')
    await setup.commitReport([root], Costs.commit(true, false), 7)

    const setBehavior = (behavior: tr.TestReceiver_Behavior) =>
      setup.receiver.sendTestReceiverUpdateBehavior(setup.deployer.getSender(), toNano('0.05'), {
        behavior,
      })
    await setBehavior(tr.TestReceiver_Behavior.RejectAll)
    const { result } = await report.measure('OffRamp Execute + Max Payload rejected by receiver', {
      run: () => setup.executeReport(setup.createExecuteReport([message]), 8),
      book,
      discover: nameReceiveExecutor,
      aborts: ['Router->Receiver'],
      budget: Costs.executeBudget(false),
    })
    await setBehavior(tr.TestReceiver_Behavior.Accept)
    expect(result.transactions).toHaveTransaction({
      from: setup.router.address,
      to: setup.offRamp.address,
      op: of.OffRamp_CCIPReceiveBounced.PREFIX,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      to: setup.offRamp.address,
      op: of.OffRamp_NotifyFailure.PREFIX,
      success: true,
    })
  })
})
