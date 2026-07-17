import * as c from '@ton/core'
import { sha256_sync } from '@ton/crypto'

import { uint8ArrayToBigInt, asSnakedCell } from '../utils'

import * as of from '../../wrappers/gen/ccip/OffRamp'
import { ChainSelectors } from '../../tests/utils/Selectors'

const LEAF_DOMAIN_SEPARATOR = c.beginCell().storeUint(0, 256).asSlice()

export function getMetadataHash(sourceChainSelector: bigint, address: c.Slice) {
  const hash = c
    .beginCell()
    .storeUint(uint8ArrayToBigInt(sha256_sync('Any2TVMMessageHashV1')), 256)
    .storeUint(sourceChainSelector, 64)
    .storeUint(ChainSelectors.testnet.ton, 64)
    .storeRef(of.CrossChainAddress.toCell(address))
    .endCell()
    .hash()

  return hash
}

export default function generateMessageID(message: of.Any2TVMRampMessage, metadataHash: bigint) {
  return (
    c
      .beginCell()
      .storeSlice(LEAF_DOMAIN_SEPARATOR)
      .storeUint(metadataHash, 256)
      //header
      .storeRef(
        c
          .beginCell()
          .storeUint(message.header.messageId, 256)
          .storeAddress(message.receiver)
          .storeUint(message.header.sequenceNumber, 64)
          .storeCoins(message.gasLimit)
          .storeUint(message.header.nonce, 64)
          .endCell(),
      )
      //message sender
      .storeRef(of.CrossChainAddress.toCell(message.sender))
      //rest of the message
      .storeRef(message.data)
      .storeMaybeRef(
        message.tokenAmounts
          ? asSnakedCell(message.tokenAmounts, (item) => {
              const b = c.beginCell()
              of.Any2TVMTokenTransfer.store(item, b)
              return b
            })
          : undefined,
      )
      .endCell()
      .hash()
  )
}
