import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import { crc32 } from 'zlib'

import { errorCode, facilityId } from '../../../wrappers/utils'
import { generateMockTonAddress } from '../../../src/utils'

import * as typeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import {
  FACILITY_NAME,
  CONTRACT_VERSION,
  FACILITY_ID,
  ERROR_CODE,
} from '../../../wrappers/ccip/MerkleRoot'
import * as mr from '../../../wrappers/gen/ccip/MerkleRoot'
import { contractCode } from '../../../wrappers/codeLoader'
import { ChainSelectors } from '../../utils/Selectors'
import EVM_ADDRESS from '../../utils/evmAddress'
import { findTransaction, flattenTransaction } from '@ton/test-utils'
import { sendMessageAsync, captureAccountChanges } from '../../utils/sendInternalMessage'

interface MerkleRootStorageOverrides {
  root?: bigint
  timestamp?: bigint
  minMsgNr?: bigint
  maxMsgNr?: bigint
  messageStates?: bigint
  deliveredMessageCount?: bigint
}

async function deployMerkleRootContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  overrides: MerkleRootStorageOverrides = {},
) {
  const code = await contractCode.ccip.local('MerkleRoot')
  let data = mr.MerkleRoot_Storage.create({
    root: overrides.root ?? 0n,
    owner: owner.address,
    timestamp: overrides.timestamp ?? BigInt(Math.floor(Date.now() / 1000)),
    minMsgNr: overrides.minMsgNr ?? 0n,
    maxMsgNr: overrides.maxMsgNr ?? 5n,
    messageStates: overrides.messageStates ?? 0n,
    deliveredMessageCount: overrides.deliveredMessageCount ?? 0n,
  })

  const contract = blockchain.openContract(
    mr.MerkleRoot.fromStorage(data, { overrideContractCode: code }),
  )
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('1'))
  return contract
}

describe('MerkleRoot - TypeAndVersion Tests', () => {
  const currentVersionSpec = typeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: CONTRACT_VERSION,
    deployContract: deployMerkleRootContract,
  })
  currentVersionSpec.run([
    {
      code: 'MerkleRoot',
      name: 'merkleroot',
    },
  ])
})

describe('MerkleRoot - Unit Tests', () => {
  let blockchain: Blockchain
  let merkleRoot: SandboxContract<mr.MerkleRoot>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    merkleRoot = await deployMerkleRootContract(blockchain, await blockchain.treasury('owner'))
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await merkleRoot.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(FACILITY_ID))

    const [typeSlice] = await merkleRoot.getTypeAndVersion()
    expect(typeSlice.loadStringTail()).toBe(FACILITY_NAME)
    expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await merkleRoot.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ERROR_CODE))

    expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
  })
})

describe('MerkleRoot - Message Handling', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let nonOwner: SandboxContract<TreasuryContract>

  const SOURCE_CHAIN_SELECTOR = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001
  const DEST_CHAIN_SELECTOR = ChainSelectors.testnet.ton
  const METADATA_HASH = 0xabcdefn
  const ROOT = 0x1234n
  const NOW = 10_000n
  const THRESHOLD_SEC = 3600n

  // Encode a message state (2 bits) into the `messageStates` uint128 storage word.
  const encodeState = (seqNum: bigint, state: bigint, minMsgNr = 0n): bigint =>
    state << ((seqNum - minMsgNr) * 2n)

  const buildMessage = (
    sequenceNumber: bigint,
    receiver = generateMockTonAddress(),
  ): mr.Any2TVMRampMessage =>
    mr.Any2TVMRampMessage.create({
      header: mr.RampMessageHeader.create({
        messageId: sequenceNumber,
        sourceChainSelector: SOURCE_CHAIN_SELECTOR,
        destChainSelector: DEST_CHAIN_SELECTOR,
        sequenceNumber,
        nonce: 0n,
      }),
      sender: EVM_ADDRESS,
      data: Cell.EMPTY,
      receiver,
      gasLimit: toNano('0.03'),
      tokenAmounts: null,
    })

  const buildGasOverride = (): mr.GasOverride =>
    mr.GasOverride.create({
      receiverExecutionGasLimit: toNano('0.05'),
      tokenGasOverrides: [],
    })

  const loadStorage = async (address: mr.MerkleRoot['address']): Promise<mr.MerkleRoot_Storage> => {
    const contract = await blockchain.getContract(address)
    const accountState = contract.accountState
    if (accountState?.type !== 'active') throw new Error('MerkleRoot not active')
    const data = accountState.state.data
    if (!data) throw new Error('MerkleRoot storage missing')
    return mr.MerkleRoot_Storage.fromSlice(data.beginParse())
  }

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = Number(NOW)
    owner = await blockchain.treasury('owner')
    nonOwner = await blockchain.treasury('nonOwner')
  })

  beforeEach(async () => {
    // Fresh blockchain per test so each MerkleRoot deploy gets a unique address.
    blockchain = await Blockchain.create()
    blockchain.now = Number(NOW)
    owner = await blockchain.treasury('owner')
    nonOwner = await blockchain.treasury('nonOwner')
  })

  describe('MerkleRoot_Validate', () => {
    it('should forward OffRamp_ExecuteValidated to owner on happy path (DON)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const message = buildMessage(1n)
      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message,
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        gasOverride: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: merkleRoot.address,
        to: owner.address,
        success: true,
        op: mr.OffRamp_ExecuteValidated.PREFIX,
        body(x) {
          if (!x) return false
          const decoded = mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse())
          return (
            decoded.root === ROOT &&
            decoded.metadataHash === METADATA_HASH &&
            decoded.gasOverride === null &&
            decoded.executionState === mr.ExecutionState.Untouched &&
            decoded.message.header.sequenceNumber === 1n
          )
        },
      })

      const storage = await loadStorage(merkleRoot.address)
      expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.InProgress, 1n))
    })

    it('should reject MerkleRoot_Validate from non-owner (NotOwner)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootValidate(nonOwner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        gasOverride: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.NotOwner'],
      })
    })

    it('should reject MerkleRoot_Validate when message was already executed (SkippedAlreadyExecutedMessage)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Success, 1n),
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        gasOverride: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.SkippedAlreadyExecutedMessage'],
      })
    })

    it('should reject DON re-execution when state is Failure (AlreadyExecuted)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Failure, 1n),
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        gasOverride: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.AlreadyExecuted'],
      })
    })

    it('should reject manual execution when commit is fresh and state is Untouched (ManualExecutionNotYetEnabled)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        gasOverride: buildGasOverride(),
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.ManualExecutionNotYetEnabled'],
      })
    })

    it('should allow manual execution when commit is old and state is Untouched', async () => {
      // timestamp is much older than blockchain.now, so the commit is past the threshold
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        timestamp: NOW - THRESHOLD_SEC - 1n,
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        gasOverride: buildGasOverride(),
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: merkleRoot.address,
        to: owner.address,
        success: true,
        op: mr.OffRamp_ExecuteValidated.PREFIX,
        body(x) {
          if (!x) return false
          const decoded = mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse())
          return (
            decoded.gasOverride !== null && decoded.executionState === mr.ExecutionState.Untouched
          )
        },
      })
    })

    it('should allow manual execution when state is Failure even if commit is fresh', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        root: ROOT,
        timestamp: NOW,
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Failure, 1n),
      })

      const result = await merkleRoot.sendMerkleRootValidate(owner.getSender(), toNano('0.5'), {
        message: buildMessage(1n),
        permissionlessExecutionThresholdSeconds: THRESHOLD_SEC,
        metadataHash: METADATA_HASH,
        gasOverride: buildGasOverride(),
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: merkleRoot.address,
        to: owner.address,
        success: true,
        op: mr.OffRamp_ExecuteValidated.PREFIX,
        body(x) {
          if (!x) return false
          const decoded = mr.OffRamp_ExecuteValidated.fromSlice(x.beginParse())
          return decoded.executionState === mr.ExecutionState.Failure
        },
      })
    })
  })

  describe('MerkleRoot_MarkState', () => {
    it('should mark seq as Success and increment deliveredMessageCount', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        seqNum: 1n,
        state: mr.ExecutionState.Success,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      const storage = await loadStorage(merkleRoot.address)
      expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Success, 1n))
      expect(storage.deliveredMessageCount).toBe(1n)
    })

    it('should mark seq as Failure without incrementing deliveredMessageCount', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        seqNum: 1n,
        state: mr.ExecutionState.Failure,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })

      const storage = await loadStorage(merkleRoot.address)
      expect(storage.messageStates).toBe(encodeState(1n, mr.ExecutionState.Failure, 1n))
      expect(storage.deliveredMessageCount).toBe(0n)
    })

    it('should reject MerkleRoot_MarkState from non-owner (NotOwner)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(nonOwner.getSender(), toNano('0.1'), {
        seqNum: 1n,
        state: mr.ExecutionState.Success,
      })

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.NotOwner'],
      })
    })

    it('should reject transitioning away from Success (InvalidState)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
        messageStates: encodeState(1n, mr.ExecutionState.Success, 1n),
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        seqNum: 1n,
        state: mr.ExecutionState.Failure,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.InvalidState'],
      })
    })

    it('should reject marking a non-final state like InProgress (InvalidState)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        seqNum: 1n,
        state: mr.ExecutionState.InProgress,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.InvalidState'],
      })
    })

    it('should reject seqNum out of bounds (SeqNumOutOfBounds)', async () => {
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 3n,
      })

      const result = await merkleRoot.sendMerkleRootMarkState(owner.getSender(), toNano('0.1'), {
        seqNum: 42n,
        state: mr.ExecutionState.Success,
      })

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.SeqNumOutOfBounds'],
      })
    })

    it('should freeze the contract and return the balance to owner when all messages are delivered', async () => {
      // Single-message range so a single Success finalizes the root.
      const merkleRoot = await deployMerkleRootContract(blockchain, owner, {
        minMsgNr: 1n,
        maxMsgNr: 1n,
        messageStates: encodeState(1n, mr.ExecutionState.InProgress, 1n),
      })

      const body = mr.MerkleRoot.createCellOfMerkleRootMarkState({
        seqNum: 1n,
        state: mr.ExecutionState.Success,
      })

      const txs = await sendMessageAsync(blockchain, owner.address, {
        to: merkleRoot.address,
        value: toNano('0.1'),
        body,
      })

      const { transactions, accountSnapshots } = await captureAccountChanges(blockchain, txs, [
        merkleRoot.address,
      ])

      expect(transactions).toHaveTransaction({
        from: owner.address,
        to: merkleRoot.address,
        success: true,
        op: mr.MerkleRoot_MarkState.PREFIX,
      })

      const markStateSuccessTX = findTransaction(transactions, {
        from: owner.address,
        to: merkleRoot.address,
        success: true,
      })
      if (!markStateSuccessTX) throw new Error('MerkleRoot_MarkState transaction not found')
      const snap = accountSnapshots.get(markStateSuccessTX.lt)
      if (!snap) throw new Error('Account snapshot not found for MerkleRoot_MarkState transaction')

      // Freeze-return: merkleRoot sends its entire balance (CARRY_ALL_BALANCE) to owner.
      const freezeTX = findTransaction(transactions, {
        from: merkleRoot.address,
        to: owner.address,
      })
      if (!freezeTX) throw new Error('Freeze return transaction not found')
      const returnedValue = flattenTransaction(freezeTX).value
      if (returnedValue == undefined)
        throw new Error('Returned value not found in freeze transaction')

      expect(snap.before.balance).toBeGreaterThan(0n)
      expect(returnedValue).toBeGreaterThan(snap.before.balance)
      expect(snap.after.balance).toEqual(0n)
      // Returned value covers merkleRoot's pre-tx reserve plus most of the trigger value, minus fees.
      expect(returnedValue).toBeGreaterThan(snap.before.balance)
    })
  })
})
