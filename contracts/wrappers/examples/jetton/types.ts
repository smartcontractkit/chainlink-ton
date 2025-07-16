import { Address, Cell, beginCell } from '@ton/core'

export type JettonClientConfig = {
  masterAddress: Address
  jettonWalletCode: Cell
}

export function jettonClientConfigToCell(config: JettonClientConfig): Cell {
  return beginCell().storeAddress(config.masterAddress).storeRef(config.jettonWalletCode).endCell()
}

export const JettonOpcodes = {
  // Jetton Wallet opcodes
  TRANSFER: 0x0f8a7ea5,
  TRANSFER_NOTIFICATION: 0x7362d09c,
  INTERNAL_TRANSFER: 0x178d4519,
  EXCESSES: 0xd53276db,
  BURN: 0x595f07bc,
  BURN_NOTIFICATION: 0x7bdd97de,
  WITHDRAW_TONS: 0x107c49ef,
  WITHDRAW_JETTONS: 0x10,

  // Jetton Minter opcodes
  MINT: 0x642b7d07,
  // PROVIDE_WALLET_ADDRESS: 0x2c76b973,
  // TAKE_WALLET_ADDRESS: 0xd1735400,
  CHANGE_ADMIN: 0x6501f354,
  CLAIM_ADMIN: 0xfb88e119,
  DROP_ADMIN: 0x7431f221,
  CHANGE_METADATA_URL: 0xcb862902,
  UPGRADE: 0x2508d66a,
  // TOP_UP: 0x8,

  // Custom contract opcodes
  SEND_JETTONS_FAST: 0x6984f9bb,
  SEND_JETTONS_EXTENDED: 0xe815f1d0,
}

export const ErrorCodes = {
  INCORRECT_SENDER: 100,
  FORWARD_PAYLOAD_REQUIRED: 101,
}
