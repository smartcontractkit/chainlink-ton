import { crc32 } from 'zlib'
import { Any2TVMMessage } from '../../ccip/OffRamp'

export const RECEIVER_CCIP_MESSAGE_RECEIVED = crc32('Receiver_CCIPMessageReceived')

export enum LogTypes {
  ReceiverCCIPMessageReceived = RECEIVER_CCIP_MESSAGE_RECEIVED,
}

export type ReceiverCCIPMessageReceived = {
  message: Any2TVMMessage
}
