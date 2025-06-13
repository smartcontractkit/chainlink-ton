import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core'
import { crc32 } from 'zlib'

// @dev Grants `role` to `account`.
export type GrantRole = {
  /// Query ID of the change owner request.
  queryId: bigint

  /// Role of the account.
  role: bigint
  /// New account to add.
  account: Address
}

// @dev Revokes `role` from `account`.
export type RevokeRole = {
  /// Query ID of the change owner request.
  queryId: bigint

  /// Role of the account.
  role: bigint
  /// Account to revoke.
  account: Address
}

/// @dev Union of all access control messages.
type Message = GrantRole | RevokeRole

const ERROR_INVALID_ROLE = 89
const ERROR_ACCOUNT_EXISTS = 95
const ERROR_ACCOUNT_NOT_EXISTS = 96
const ERROR_ACCOUNT_MISSING_ROLE = 98

export const Opcodes = {
  GrantRole: crc32('AccessControl_GrantRole'),
  RevokeRole: crc32('AccessControl_RevokeRole'),
}

export const Builder = {
  /// Creates a new `GrantRole` message.
  grantRole: (msg: GrantRole): Cell => {
    return beginCell()
      .storeUint(Opcodes.GrantRole, 32)
      .storeUint(msg.queryId, 64)
      .storeUint(msg.role, 32)
      .storeAddress(msg.account)
      .endCell()
  },
  /// Creates a new `RevokeRole` message.
  revokeRole: (msg: RevokeRole): Cell => {
    return beginCell()
      .storeUint(Opcodes.RevokeRole, 32)
      .storeUint(msg.queryId, 64)
      .storeUint(msg.role, 32)
      .storeAddress(msg.account)
      .endCell()
  },
}
