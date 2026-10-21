import { Blockchain, SendMessageResult } from '@ton/sandbox'
import { Address, toNano } from '@ton/core'
import '@ton/test-utils'

import * as of from '../../../../wrappers/gen/ccip/OffRamp'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import * as deployable from '../../../../wrappers/libraries/Deployable'
import generateMessageID from '../../../../src/offramp/generateMessageID'
import { getDefaultMetadataHash, OffRampTestSetup } from '../../../ccip/offramp/OffRamp.Setup'
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
      run: () => setup.commitReport([root], toNano('0.5'), 1),
      book,
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
})
