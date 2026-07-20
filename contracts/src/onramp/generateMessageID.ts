import * as c from '@ton/core'
import { uint8ArrayToBigInt } from '../utils'
import * as on from '../../wrappers/gen/ccip/OnRamp'
import { ChainSelectors } from '../../tests/utils/Selectors'

export function getMetadataHash(
  sourceChainSelector: bigint,
  destChainSelector: bigint,
  onRamp: c.Address,
): bigint {
  const hash = on.TVM2AnyRampMessageV1Metadata.toCell(
    on.TVM2AnyRampMessageV1Metadata.create({
      sourceChainSelector,
      destChainSelector,
      onRamp,
    }),
  ).hash()

  return uint8ArrayToBigInt(hash)
}

export default function generateMessageID(
  message: on.TVM2AnyRampMessage,
  metadataHash: bigint,
): bigint {
  const hash = on.TVM2AnyRampMessageIDData.toCell(
    on.TVM2AnyRampMessageIDData.create({
      metadataHash,
      metadata: on.TVM2AnyRampMessageIDHeader.create({
        sender: message.sender,
        sequenceNumber: message.header.sequenceNumber,
        nonce: message.header.nonce,
      }),
      body: on.TVM2AnyRampMessageBody.toCell(message.body),
    }),
  ).hash()
  return uint8ArrayToBigInt(hash)
}
