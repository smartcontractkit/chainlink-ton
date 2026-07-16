import { beginCell } from '@ton/core'
import { KeyPair, sha256_sync } from '@ton/crypto'
import { bigIntToBuffer, uint8ArrayToBigInt, asSnakedCell } from '../../../../src/utils'
import * as of from '../../../../wrappers/gen/ccip/OffRamp'
import { createSignature } from '../../../../wrappers/libraries/ocr/MultiOCR3Base'
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

export function generateMessageId(message: of.Any2TVMRampMessage, metadataHash: bigint): Buffer {
  return beginCell()
    .storeSlice(LEAF_DOMAIN_SEPARATOR)
    .storeUint(metadataHash, 256)
    .storeRef(
      beginCell()
        .storeUint(message.header.messageId, 256)
        .storeAddress(message.receiver)
        .storeUint(message.header.sequenceNumber, 64)
        .storeCoins(message.gasLimit)
        .storeUint(message.header.nonce, 64)
        .endCell(),
    )
    .storeRef(of.CrossChainAddress.toCell(message.sender))
    .storeRef(message.data)
    .storeMaybeRef(
      message.tokenAmounts
        ? asSnakedCell(message.tokenAmounts, (item) => {
            const b = beginCell()
            of.Any2TVMTokenTransfer.store(item, b)
            return b
          })
        : undefined,
    )
    .endCell()
    .hash()
}

export function createSignatures(signerList: KeyPair[], hash: Buffer): of.SignatureEd25519[] {
  return signerList.map((signer) => of.SignatureEd25519.create(createSignature(signer, hash)))
}
