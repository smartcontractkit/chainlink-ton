import { beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { ContractClient } from '../../../wrappers/data-streams/Verifier'
import { FIXTURE_SET_1 } from './fixtures/fixtureSet1'
import { FIXTURE_SET_2 } from './fixtures/fixtureSet2'

// ============================================================================
// Types
// ============================================================================

export interface FixtureSet {
  CONFIG_DIGEST: string
  FEED_ID: string
  F: number
  NUM_SIGNERS: number
  REPORT_CONTEXT: [string, string, string]
  REPORT_BYTES: string
  SIGNATURE_RS: string[]
  SIGNATURE_SS: string[]
  RAW_VS: string
  SIGNER_ADDRESSES: string[]
}

export interface PayloadComponents {
  context: [string, string, string]
  report: string
  rs: string[]
  ss: string[]
  rawVs: string
}

// ============================================================================
// Fixture access helpers
// ============================================================================

export function getFixtureSet(id: 1 | 2): FixtureSet {
  return id === 1 ? FIXTURE_SET_1 : FIXTURE_SET_2
}

// ============================================================================
// Payload encoding - port of fixture_builder.move::encode_payload
// ============================================================================

/**
 * Build EVM ABI-encoded payload from components.
 * Layout:
 *   [0..32]   context[0]   (configDigest)
 *   [32..64]  context[1]   (epoch/round)
 *   [64..96]  context[2]   (extra hash)
 *   [96..128] reportDataOffset
 *   [128..160] rsOffset
 *   [160..192] ssOffset
 *   [192..224] rawVs (packed, left-aligned)
 *   [reportDataOffset..] uint256(len) + reportData bytes
 *   [rsOffset..]         uint256(count) + count*bytes32
 *   [ssOffset..]         uint256(count) + count*bytes32
 */
export function encodePayload(components: PayloadComponents): Buffer {
  const parts: Buffer[] = []

  // Step 1: Add 3 context words (each 32 bytes)
  for (const ctx of components.context) {
    parts.push(hexToBytes(ctx))
  }

  // Step 2: Calculate offsets
  const staticSize = 7 * 32 // 3 context + 3 offsets + 1 rawVs
  const reportBytes = hexToBytes(components.report)
  const reportDataOffset = staticSize
  const rsOffset = reportDataOffset + 32 + reportBytes.length // +32 for length field
  const ssOffset = rsOffset + 32 + components.rs.length * 32 // +32 for count field

  // Step 3: Add offsets as 32-byte big-endian values
  parts.push(encodeUint256(BigInt(reportDataOffset)))
  parts.push(encodeUint256(BigInt(rsOffset)))
  parts.push(encodeUint256(BigInt(ssOffset)))

  // Step 4: Add rawVs (packed V values, left-aligned in 32 bytes)
  parts.push(packVsToBytes32(components.rawVs, components.rs.length))

  // Step 5: Add report data (uint256 length + raw bytes)
  parts.push(encodeUint256(BigInt(reportBytes.length)))
  parts.push(reportBytes)

  // Step 6: Add R values (uint256 count + array of bytes32)
  parts.push(encodeUint256(BigInt(components.rs.length)))
  for (const r of components.rs) {
    parts.push(hexToBytes(r))
  }

  // Step 7: Add S values (uint256 count + array of bytes32)
  parts.push(encodeUint256(BigInt(components.ss.length)))
  for (const s of components.ss) {
    parts.push(hexToBytes(s))
  }

  return Buffer.concat(parts)
}

/**
 * Pack V values into bytes32 format.
 * The verifier expects V values LEFT-ALIGNED in the rawVs word.
 * V values are extracted from the stored RAW_VS (right-aligned) and re-packed left-aligned.
 */
function packVsToBytes32(rawVsHex: string, numSigners: number): Buffer {
  const rawVsBytes = hexToBytes(rawVsHex)
  const result = Buffer.alloc(32, 0)

  for (let i = 0; i < numSigners; i++) {
    const vByteIndex = 32 - numSigners + i // right-aligned position in RAW_VS
    result[i] = rawVsBytes[vByteIndex] // left-aligned position in encoded payload
  }

  return result
}

// ============================================================================
// Payload generation from fixtures
// ============================================================================

/**
 * Generate PayloadComponents for a fixture set with specified signers.
 */
export function generatePayloadComponents(
  fixtureId: 1 | 2,
  signerAddresses: string[],
): PayloadComponents {
  const fixture = getFixtureSet(fixtureId)

  const rs: string[] = []
  const ss: string[] = []
  const rawVs: number[] = []

  for (const targetAddr of signerAddresses) {
    const index = fixture.SIGNER_ADDRESSES.findIndex(
      (a) => a.toLowerCase() === targetAddr.toLowerCase(),
    )
    if (index === -1) {
      throw new Error(`Signer ${targetAddr} not found in fixture set ${fixtureId}`)
    }

    rs.push(fixture.SIGNATURE_RS[index])
    ss.push(fixture.SIGNATURE_SS[index])

    const rawVsBytes = hexToBytes(fixture.RAW_VS)
    const vByteIndex = 32 - fixture.NUM_SIGNERS + index
    rawVs.push(rawVsBytes[vByteIndex])
  }

  const rawVsBuf = Buffer.alloc(32, 0)
  for (let i = 0; i < rawVs.length; i++) {
    rawVsBuf[32 - rawVs.length + i] = rawVs[i]
  }

  return {
    context: fixture.REPORT_CONTEXT,
    report: fixture.REPORT_BYTES,
    rs,
    ss,
    rawVs: '0x' + rawVsBuf.toString('hex'),
  }
}

/**
 * Generate PayloadComponents using fixture context but custom signer addresses.
 * Looks up signatures across both fixture sets.
 */
export function generatePayloadComponentsCustomSigners(
  contextFixtureId: 1 | 2,
  signerAddresses: string[],
): PayloadComponents {
  const contextFixture = getFixtureSet(contextFixtureId)

  const rs: string[] = []
  const ss: string[] = []
  const rawVs: number[] = []

  for (const targetAddr of signerAddresses) {
    const sig = findSignerSignature(targetAddr)
    if (!sig) {
      throw new Error(`Signer ${targetAddr} not found in any fixture set`)
    }
    rs.push(sig.r)
    ss.push(sig.s)
    rawVs.push(sig.v)
  }

  const rawVsBuf = Buffer.alloc(32, 0)
  for (let i = 0; i < rawVs.length; i++) {
    rawVsBuf[32 - rawVs.length + i] = rawVs[i]
  }

  return {
    context: contextFixture.REPORT_CONTEXT,
    report: contextFixture.REPORT_BYTES,
    rs,
    ss,
    rawVs: '0x' + rawVsBuf.toString('hex'),
  }
}

/**
 * Find a signer's signature data across both fixture sets.
 */
function findSignerSignature(
  targetAddr: string,
): { r: string; s: string; v: number } | null {
  for (const fixtureId of [1, 2] as const) {
    const fixture = getFixtureSet(fixtureId)
    const index = fixture.SIGNER_ADDRESSES.findIndex(
      (a) => a.toLowerCase() === targetAddr.toLowerCase(),
    )
    if (index !== -1) {
      const rawVsBytes = hexToBytes(fixture.RAW_VS)
      const vByteIndex = 32 - fixture.NUM_SIGNERS + index
      return {
        r: fixture.SIGNATURE_RS[index],
        s: fixture.SIGNATURE_SS[index],
        v: rawVsBytes[vByteIndex],
      }
    }
  }
  return null
}

/**
 * Create a signed report payload for testing.
 */
export function createSignedReport(fixtureId: 1 | 2, signerAddresses: string[]): Buffer {
  const components = generatePayloadComponents(fixtureId, signerAddresses)
  return encodePayload(components)
}

/**
 * Create a signed report using context from one fixture but signatures looked up globally.
 */
export function createSignedReportCustomSigners(
  contextFixtureId: 1 | 2,
  signerAddresses: string[],
): Buffer {
  const components = generatePayloadComponentsCustomSigners(contextFixtureId, signerAddresses)
  return encodePayload(components)
}

/**
 * Create a signed report with mismatched signatures (remove last S value).
 */
export function createSignedReportMismatched(
  fixtureId: 1 | 2,
  signerAddresses: string[],
): Buffer {
  const components = generatePayloadComponents(fixtureId, signerAddresses)
  const modifiedSs = components.ss.slice(0, -1)
  const modified: PayloadComponents = { ...components, ss: modifiedSs }
  return encodePayload(modified)
}

// ============================================================================
// Cell encoding - pack byte buffers into TON cell tree (snake encoding)
// ============================================================================

/**
 * Pack a byte buffer into a chain of cells (snake encoding).
 * Each cell holds up to 127 bytes (1016 bits), with a ref to the next cell.
 */
export function bufferToSnakeCell(buf: Buffer): Cell {
  const MAX_BYTES = 127 // 1016 bits, leaving room for ref

  function buildChain(offset: number): Cell {
    const remaining = buf.length - offset
    const chunkSize = Math.min(remaining, MAX_BYTES)
    const builder = beginCell()

    for (let i = 0; i < chunkSize; i++) {
      builder.storeUint(buf[offset + i], 8)
    }

    if (offset + chunkSize < buf.length) {
      builder.storeRef(buildChain(offset + chunkSize))
    }

    return builder.endCell()
  }

  return buildChain(0)
}

// ============================================================================
// Contract setup helpers
// ============================================================================

/**
 * Deploy a Verifier contract in the sandbox.
 */
export async function deployVerifier(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
): Promise<SandboxContract<ContractClient>> {
  const code = await ContractClient.code()
  const verifier = blockchain.openContract(
    ContractClient.newFrom({ owner: owner.address }, code),
  )

  const deployResult = await verifier.sendDeploy(owner.getSender(), toNano('0.5'))
  expect(deployResult.transactions).toHaveTransaction({
    from: owner.address,
    to: verifier.address,
    deploy: true,
    success: true,
  })

  return verifier
}

/**
 * Pack Ethereum addresses (20 bytes each) into a Cell for SetConfig/UpdateConfig messages.
 * Each cell holds up to 6 addresses (floor(1023 / 160) = 6).
 */
export function packSignersCell(ethAddresses: string[]): Cell {
  const MAX_ADDRS_PER_CELL = 6

  function buildChain(startIndex: number): Cell {
    const builder = beginCell()
    const remaining = ethAddresses.length - startIndex
    const count = Math.min(remaining, MAX_ADDRS_PER_CELL)

    for (let i = 0; i < count; i++) {
      const addr = hexToBytes(ethAddresses[startIndex + i])
      if (addr.length !== 20) {
        throw new Error(`Invalid Ethereum address length: ${addr.length}`)
      }
      builder.storeBuffer(addr)
    }

    if (startIndex + count < ethAddresses.length) {
      builder.storeRef(buildChain(startIndex + count))
    }

    return builder.endCell()
  }

  return buildChain(0)
}

/**
 * Get a subset of signer addresses from a fixture set (inclusive on both ends).
 */
export function signerSubset(fixture: FixtureSet, start: number, end: number): string[] {
  return fixture.SIGNER_ADDRESSES.slice(start, end + 1)
}

/**
 * Create a config (configDigest + signers) from a fixture set.
 */
export function createConfig(
  fixtureId: 1 | 2,
  numSigners: number,
): { configDigest: bigint; signers: string[] } {
  const fixture = getFixtureSet(fixtureId)
  const signers = fixture.SIGNER_ADDRESSES.slice(0, numSigners)
  const configDigest = BigInt(fixture.CONFIG_DIGEST)
  return { configDigest, signers }
}

// ============================================================================
// Utility functions
// ============================================================================

export function hexToBytes(hex: string): Buffer {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  return Buffer.from(cleanHex, 'hex')
}

function encodeUint256(value: bigint): Buffer {
  const buf = Buffer.alloc(32, 0)
  const hex = value.toString(16).padStart(64, '0')
  for (let i = 0; i < 32; i++) {
    buf[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return buf
}
