import { Cell } from '@ton/core'
import { CellCodec } from '../../wrappers/utils'
import * as jetton from '../../wrappers/jetton/JettonWallet'
import * as rt from '../../wrappers/ccip/Router'

export function verifyBodyMessage<T>(
  body: Cell | undefined,
  codec: CellCodec<T>,
  validations: ((message: T) => boolean)[] = [],
): boolean {
  if (!body) {
    console.log('Body is empty')
    return false
  }

  let message: T
  try {
    message = codec.load(body.beginParse())
  } catch (e) {
    console.log('Failed to parse message body:', e)
    return false
  }

  return validations.every((validate) => validate(message))
}

export function verifyBodyIsTransferRequest(
  body: Cell | undefined,
  options: {
    transferRequestValidation?: (request: jetton.AskToTransfer) => boolean
  } = {},
): boolean {
  const { transferRequestValidation } = options
  const validations = transferRequestValidation ? [transferRequestValidation] : []

  return verifyBodyMessage(body, jetton.builder.messages.in.askToTransfer, validations)
}

export function verifyBodyIsTransferRequestWithFwdPayload<T>(
  body: Cell | undefined,
  payloadCodec: CellCodec<T>,
  options: {
    transferRequestValidation?: (request: jetton.AskToTransferWithFwdPayload<T>) => boolean
    fwdPayloadValidation?: (payload: T) => boolean
  } = {},
): boolean {
  const { transferRequestValidation, fwdPayloadValidation } = options

  const validations = [
    ...(transferRequestValidation ? [transferRequestValidation] : []),
    ...(fwdPayloadValidation
      ? [
          (request: jetton.AskToTransferWithFwdPayload<T>) =>
            fwdPayloadValidation(request.forwardPayload),
        ]
      : []),
  ]

  return verifyBodyMessage(
    body,
    jetton.builder.messages.in.askToTransferWithFwdPayload(payloadCodec),
    validations,
  )
}

export function verifyBodyIsTransferNotification(
  body: Cell | undefined,
  options: {
    transferNotificationValidaton?: (
      notification: jetton.TransferNotificationForRecipient,
    ) => boolean
  } = {},
): boolean {
  const { transferNotificationValidaton } = options
  const validations = transferNotificationValidaton ? [transferNotificationValidaton] : []

  return verifyBodyMessage(
    body,
    jetton.builder.messages.out.transferNotificationForRecipient,
    validations,
  )
}

export function verifyBodyIsTransferNotificationWithFwdPayload<T>(
  body: Cell | undefined,
  payloadCodec: CellCodec<T>,
  options: {
    transferNotificationValidaton?: (
      notification: jetton.TransferNotificationWithFwdPayload<T>,
    ) => boolean
    fwdPayloadValidation?: (payload: T) => boolean
  } = {},
): boolean {
  const { transferNotificationValidaton, fwdPayloadValidation } = options

  const validations = [
    ...(transferNotificationValidaton ? [transferNotificationValidaton] : []),
    ...(fwdPayloadValidation
      ? [
          (notification: jetton.TransferNotificationWithFwdPayload<T>) =>
            fwdPayloadValidation(notification.forwardPayload),
        ]
      : []),
  ]

  return verifyBodyMessage(
    body,
    jetton.builder.messages.out.transferNotificationWithFwdPayload(payloadCodec),
    validations,
  )
}

export function verifyBodyIsRouterMessageSent(
  body: Cell | undefined,
  options: {
    validation?: (ack: rt.MessageSent) => boolean
  } = {},
): boolean {
  const { validation } = options
  const validations = validation ? [validation] : []

  return verifyBodyMessage(body, rt.builder.message.in.messageSent, validations)
}

export function verifyBodyIsRouterCCIPSendACK(
  body: Cell | undefined,
  options: {
    validation?: (ack: rt.CCIPSendACK) => boolean
  } = {},
): boolean {
  const { validation } = options
  const validations = validation ? [validation] : []

  return verifyBodyMessage(body, rt.builder.message.out.ccipSendACK, validations)
}
