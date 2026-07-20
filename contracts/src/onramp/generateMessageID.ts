import * as c from '@ton/core'
import { sha256_sync } from '@ton/crypto'
import { uint8ArrayToBigInt, asSnakedCell } from '../utils'
import * as on from '../../wrappers/gen/ccip/OnRamp'
import { ChainSelectors } from '../../tests/utils/Selectors'

export function getMetadataHash(destChainSelector: bigint, onRamp: c.Address) {
  return on.TVM2AnyRampMessageV1Metadata.toCell(
    on.TVM2AnyRampMessageV1Metadata.create({
      sourceChainSelector: ChainSelectors.testnet.ton,
      destChainSelector,
      onRamp,
    }),
  ).hash()
}

export default function generateMessageID(message: on.TVM2AnyRampMessage, metadataHash: bigint) {
  return on.TVM2AnyRampMessageIDData.toCell(
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
}
