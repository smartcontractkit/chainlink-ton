import * as c from '@ton/core'

import { uint8ArrayToBigInt, asSnakedCell } from '../utils'

import * as of from '../../wrappers/gen/ccip/OffRamp'
import { ChainSelectors } from '../../tests/utils/Selectors'

const LEAF_DOMAIN_SEPARATOR = c.beginCell().storeUint(0, 256).asSlice()

export function getMetadataHash(sourceChainSelector: bigint, onRamp: c.Slice): bigint {
  const hash = of.MessageMetadata.toCell(
    of.MessageMetadata.create({
      sourceChainSelector,
      destChainSelector: ChainSelectors.testnet.ton,
      onRamp,
    }),
  ).hash()

  return uint8ArrayToBigInt(hash)
}

export default function generateMessageID(
  message: of.Any2TVMRampMessage,
  metadataHash: bigint,
): bigint {
  const hash = of.Any2TVMRampMessageIDData.toCell(
    of.Any2TVMRampMessageIDData.create({
      metadataHash,
      metadata: of.Any2TVMRampMessageIDHeader.create({
        messageId: message.header.messageId,
        receiver: message.receiver,
        sequenceNumber: message.header.sequenceNumber,
        gasLimit: message.gasLimit,
        nonce: message.header.nonce,
      }),
      sender: message.sender,
      data: message.data,
      tokenAmounts: message.tokenAmounts,
    }),
  ).hash()
  return uint8ArrayToBigInt(hash)
}
