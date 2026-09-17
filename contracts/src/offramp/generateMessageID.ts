import * as c from '@ton/core'
import { uint8ArrayToBigInt } from '../utils'
import * as of from '../../wrappers/gen/ccip/OffRamp'

export function getMetadataHash(
  sourceChainSelector: bigint,
  destChainSelector: bigint,
  onRamp: c.Slice,
): bigint {
  const hash = of.Any2TVMMessageV1Metadata.toCell(
    of.Any2TVMMessageV1Metadata.create({
      sourceChainSelector,
      destChainSelector,
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
