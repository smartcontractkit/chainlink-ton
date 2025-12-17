import { Cell, Sender, Slice, toNano } from '@ton/core'
import { SandboxContract } from '@ton/sandbox'
import * as rt from '../../../wrappers/ccip/Router'

// Helper function to send a GetValidatedFee request to router and parse the response
export async function sendGetValidatedFee(
  sender: Sender,
  router: SandboxContract<rt.Router>,
  msg: rt.CCIPSend,
  context: Slice,
): Promise<bigint> {
  const result = await router.sendGetValidatedFee(sender, toNano('1'), msg, context)

  // request
  expect(result.transactions).toHaveTransaction({
    from: sender.address,
    to: router.address,
    success: true,
  })
  // response
  expect(result.transactions).toHaveTransaction({
    from: router.address,
    to: sender.address,
    success: true,
  })

  const tx = result.transactions.find(
    (tx) =>
      tx.inMessage?.info.type === 'internal' &&
      tx.inMessage.info.src.equals(router.address) &&
      tx.inMessage.info.dest.equals(sender.address!),
  )

  if (!tx || tx.inMessage === undefined || tx.inMessage?.info.type !== 'internal') {
    throw new Error('Failed to find response transaction')
  }
  const resp = tx.inMessage

  const body = resp.body.beginParse()
  if (body.preloadUint(32) !== rt.OutOpcodes.messageValidated) {
    if (body.preloadUint(32) === rt.OutOpcodes.messageValidationFailed) {
      const msgValidationFailed = rt.builder.message.out.messageValidationFailed.load(
        resp.body.beginParse(),
      )
      throw new Error(
        `Message validation failed with error code: ${msgValidationFailed.error.toString(16)}`,
      )
    }
    throw new Error('Unexpected response opcode')
  }
  const messageValidated = rt.builder.message.out.messageValidated.load(resp.body.beginParse())
  return messageValidated.fee
}
