import { Cell, Slice } from '@ton/core'
import * as manualJettonWallet from '../../wrappers/jetton/JettonWallet'
import * as jetton from '../../wrappers/gen/ccip/cct/JettonWallet'
import * as rt from '../../wrappers/gen/ccip/Router'
import { CellCodec } from '../../wrappers/gen'

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
    message = codec.fromSlice(body.beginParse())
  } catch (e) {
    console.log('Failed to parse message body:', e)
    return false
  }

  return validations.every((validate) => validate(message))
}

export function verifyBodyIsTransferRequest(
  body: Cell | undefined,
  options: {
    transferRequestValidation?: (request: manualJettonWallet.AskToTransfer) => boolean
  } = {},
): boolean {
  const { transferRequestValidation } = options
  const validations = transferRequestValidation ? [transferRequestValidation] : []

  return verifyBodyMessage(body, manualJettonWallet.builder.messages.in.askToTransfer, validations)
}

export function verifyBodyIsTransferRequestWithFwdPayload<T>(
  body: Cell | undefined,
  payloadCodec: CellCodec<T>,
  options: {
    transferRequestValidation?: (
      request: manualJettonWallet.AskToTransferWithFwdPayload<T>,
    ) => boolean
    fwdPayloadValidation?: (payload: T) => boolean
  } = {},
): boolean {
  const { transferRequestValidation, fwdPayloadValidation } = options

  const validations = [
    ...(transferRequestValidation ? [transferRequestValidation] : []),
    ...(fwdPayloadValidation
      ? [
          (request: manualJettonWallet.AskToTransferWithFwdPayload<T>) =>
            fwdPayloadValidation(request.forwardPayload),
        ]
      : []),
  ]

  return verifyBodyMessage(
    body,
    manualJettonWallet.builder.messages.in.askToTransferWithFwdPayload<T>(payloadCodec),
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

  return verifyBodyMessage(body, jetton.TransferNotificationForRecipient, validations)
}

export function verifyBodyIsTransferNotificationWithFwdPayload<T>(
  body: Cell | undefined,
  payloadCodec: CellCodec<T>,
  options: {
    transferNotificationValidaton?: (
      notification: manualJettonWallet.TransferNotificationWithFwdPayload<T>,
    ) => boolean
    fwdPayloadValidation?: (payload: T) => boolean
  } = {},
): boolean {
  const { transferNotificationValidaton, fwdPayloadValidation } = options

  const validations = [
    ...(transferNotificationValidaton ? [transferNotificationValidaton] : []),
    ...(fwdPayloadValidation
      ? [
          (notification: manualJettonWallet.TransferNotificationWithFwdPayload<T>) =>
            fwdPayloadValidation(notification.forwardPayload),
        ]
      : []),
  ]

  return verifyBodyMessage(
    body,
    manualJettonWallet.builder.messages.out.transferNotificationWithFwdPayload(payloadCodec),
    validations,
  )
}

export function verifyBodyIsRouterMessageSent(
  body: Cell | undefined,
  options: {
    validation?: (ack: rt.Router_MessageSent) => boolean
  } = {},
): boolean {
  const { validation } = options
  const validations = validation ? [validation] : []

  return verifyBodyMessage(body, rt.Router_MessageSent, validations)
}

export function verifyBodyIsRouterCCIPSendACK(
  body: Cell | undefined,
  options: {
    validation?: (ack: rt.Router_CCIPSendACK) => boolean
  } = {},
): boolean {
  const { validation } = options
  const validations = validation ? [validation] : []

  return verifyBodyMessage(body, rt.Router_CCIPSendACK, validations)
}
