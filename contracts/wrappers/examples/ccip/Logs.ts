import { crc32 } from 'zlib'
import { Any2TVMMessage } from '../../ccip/OffRamp'

export const LOG_TOPIC: Record<string, number> = {
  ReceiverCCIPMessageReceived: crc32('Receiver_CCIPMessageReceived'),
}

export const LogTypes = {
  ReceiverCCIPMessageReceived: 'Receiver_CCIPMessageReceived',
} as const;


export type ReceiverCCIPMessageReceived = {
  message: Any2TVMMessage
}
