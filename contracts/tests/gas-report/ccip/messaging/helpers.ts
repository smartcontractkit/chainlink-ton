import { beginCell } from '@ton/core'
import { KeyPair, sha256_sync } from '@ton/crypto'
import { bigIntToBuffer, uint8ArrayToBigInt } from '../../../../src/utils'
import { Any2TVMRampMessage } from '../../../../wrappers/ccip/OffRamp'
import { SignatureEd25519, createSignature } from '../../../../wrappers/libraries/ocr/MultiOCR3Base'
import { CHAINSEL_TON, EVM_ONRAMP_ADDRESS_TEST } from '../../constants'

const LEAF_DOMAIN_SEPARATOR = beginCell().storeUint(0, 256).asSlice()

export function getMetadataHash(sourceChainSelector: bigint): Buffer {
  const hash = beginCell()
    .storeUint(uint8ArrayToBigInt(sha256_sync('Any2TVMMessageHashV1')), 256)
    .storeUint(sourceChainSelector, 64)
    .storeUint(CHAINSEL_TON, 64)
    .storeRef(
      beginCell()
        .storeUint(bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST).byteLength, 8)
        .storeBuffer(
          bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
          bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST).byteLength,
        )
        .endCell(),
    )
    .endCell()
    .hash()

  return hash
}

export function generateMessageId(message: Any2TVMRampMessage, metadataHash: bigint): Buffer {
  return beginCell()
    .storeSlice(LEAF_DOMAIN_SEPARATOR)
    .storeUint(metadataHash, 256)
    .storeRef(
      beginCell()
        .storeUint(message.header.messageId, 256)
        .storeAddress(message.receiver)
        .storeUint(message.header.sequenceNumber, 64)
        .storeUint(message.header.nonce, 64)
        .endCell(),
    )
    .storeRef(
      beginCell()
        .storeUint(message.sender.byteLength, 8)
        .storeBuffer(message.sender, message.sender.byteLength)
        .endCell(),
    )
    .storeRef(message.data)
    .storeMaybeRef(message.tokenAmounts)
    .endCell()
    .hash()
}

export function createSignatures(signerList: KeyPair[], hash: Buffer): SignatureEd25519[] {
  return signerList.map((signer) => createSignature(signer, hash))
}
