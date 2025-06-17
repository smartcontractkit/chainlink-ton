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

// @dev Renounces `role` from calling account.
export type RenounceRole = {
  /// Query ID of the change owner request.
  queryId: bigint

  /// Role of the account.
  role: bigint
  /// Caller confirmation of an account to revoke.
  callerConfirmation: Address
}

/// @dev Union of all access control messages.
export type Message = GrantRole | RevokeRole

// AccessControl contract data struct
export type ContractData = {
  roles: Dictionary<Buffer, Cell>
}

/// Internal storage struct for role data
export type ContractRoleData = {
  hasRole: Dictionary<Buffer, Buffer>
  adminRole: bigint
}

const ERROR_INVALID_ROLE = 89
const ERROR_ACCOUNT_EXISTS = 95
const ERROR_ACCOUNT_NOT_EXISTS = 96
const ERROR_ACCOUNT_MISSING_ROLE = 98

export const opcodes = {
  GrantRole: crc32('AccessControl_GrantRole'),
  RevokeRole: crc32('AccessControl_RevokeRole'),
  RenounceRole: crc32('AccessControl_RenounceRole'),
}

export const builder = {
  message: {
    encode: () => ({
      /// Creates a new `AccessControl_GrantRole` message.
      grantRole: (msg: GrantRole): Cell => {
        return beginCell()
          .storeUint(opcodes.GrantRole, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.role, 32)
          .storeAddress(msg.account)
          .endCell()
      },
      /// Creates a new `AccessControl_RevokeRole` message.
      revokeRole: (msg: RevokeRole): Cell => {
        return beginCell()
          .storeUint(opcodes.RevokeRole, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.role, 32)
          .storeAddress(msg.account)
          .endCell()
      },
      /// Creates a new `AccessControl_RenounceRole` message.
      renounceRole: (msg: RenounceRole): Cell => {
        return beginCell()
          .storeUint(opcodes.RevokeRole, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.role, 32)
          .storeAddress(msg.callerConfirmation)
          .endCell()
      },
    }),
    decode: {}, // Decoding functions can be added here if needed
  },
  data: {
    encode: () => {
      // Creates a new `AccessControl_ContractData` contract data cell with the given roles.
      const _encodeContractData = (data: ContractData): Cell => {
        return beginCell().storeDict(data.roles).endCell()
      }

      // Creates a new `AccessControl_RoleData.hasRole` contract data cell with the given roles.
      const _encodeHasRoleDict = (accounts: Address[]): Dictionary<Buffer, Buffer> => {
        const dict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Buffer(0))
        const addAccountFn = (dict, account) => dict.set(account.hash, Buffer.alloc(0))
        return accounts.reduce(addAccountFn, dict)
      }

      // Creates a new `AccessControl_RoleData` contract data cell with the given role data.
      const _encodeRoleData = (roleData: ContractRoleData): Cell => {
        return beginCell().storeDict(roleData.hasRole).storeUint(roleData.adminRole, 256).endCell()
      }

      // Creates a new `AccessControl_Roles` contract data cell with the given roles.
      const _encodeRolesDict = (roles: Map<bigint, ContractRoleData>): Dictionary<Buffer, Cell> => {
        const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
        const addRoleDataFn = (dict, role) => dict.set(role, _encodeRoleData(roles.get(role)!))
        return roles.keys().reduce(addRoleDataFn, dict)
      }

      return {
        contractData: _encodeContractData,
        hasRoleDict: _encodeHasRoleDict,
        roleData: _encodeRoleData,
        rolesDict: _encodeRolesDict,
      }
    },
    decode: () => {}, // Decoding functions can be added here if needed
  },
}
