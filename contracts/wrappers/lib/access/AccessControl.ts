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
export type Message = GrantRole | RevokeRole | RenounceRole

// AccessControl contract data struct
export type ContractData = {
  roles: Dictionary<bigint, Cell>
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
      const _encodeRoleData = (roleData: ContractRoleData): Cell => {
        return beginCell() // break line
          .storeDict(roleData.hasRole)
          .storeUint(roleData.adminRole, 256)
          .endCell()
      }

      return {
        // Creates a new `AccessControl_ContractData` contract data cell with the given roles.
        contractData: (data: ContractData): Cell => {
          return beginCell() // break line
            .storeDict(data.roles)
            .endCell()
        },

        // Creates a new `AccessControl_RoleData.hasRole` contract data cell with the given roles.
        hasRoleDict: (accounts: Address[]): Dictionary<Buffer, Buffer> => {
          const dict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Buffer(0))
          const addAccountFn = (dict, account) => dict.set(account.hash, Buffer.alloc(0))
          return accounts.reduce(addAccountFn, dict)
        },

        // Creates a new `AccessControl_RoleData` contract data cell with the given role data.
        roleData: _encodeRoleData,

        // Creates a new `AccessControl_Data.roles` contract data cell with the given roles.
        rolesDict: (roles: Map<bigint, ContractRoleData>): Dictionary<bigint, Cell> => {
          const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
          const addRoleDataFn = (dict, role) => dict.set(role, _encodeRoleData(roles.get(role)!))
          return roles.keys().reduce(addRoleDataFn, dict)
        },
      }
    },
    decode: () => {}, // Decoding functions can be added here if needed
  },
}

// AccessControl contract bindings
export class AccessControl implements Contract {
  constructor(readonly address: Address) {}

  static newFrom(address: Address): AccessControl {
    return new AccessControl(address)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendGrantRole(p: ContractProvider, via: Sender, body: GrantRole, value: bigint = 0n) {
    return this.sendInternal(p, via, value, builder.message.encode().grantRole(body))
  }

  async sendRevokeRole(p: ContractProvider, via: Sender, body: RevokeRole, value: bigint = 0n) {
    return this.sendInternal(p, via, value, builder.message.encode().revokeRole(body))
  }

  async sendRenounceRole(p: ContractProvider, via: Sender, body: RenounceRole, value: bigint = 0n) {
    return this.sendInternal(p, via, value, builder.message.encode().renounceRole(body))
  }

  async getHasRole(p: ContractProvider, role: bigint, account: Address) {
    const result = await p.get('hasRole', [
      {
        type: 'int',
        value: role,
      },
      {
        type: 'slice',
        cell: beginCell().storeAddress(account).endCell(),
      },
    ])
    return result.stack.readBoolean()
  }
}
