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
  adminRole: bigint

  membersLen: bigint
  hasRole: Dictionary<Buffer, Buffer>
}

const ERROR_INVALID_ROLE = 89

export const errors = {
  UnouthorizedAccount: 90,
  BadConfirmation: 91,
}

export const opcodes = {
  in: {
    GrantRole: crc32('AccessControl_GrantRole'),
    RevokeRole: crc32('AccessControl_RevokeRole'),
    RenounceRole: crc32('AccessControl_RenounceRole'),
  },
  out: {
    RoleGranted: crc32('AccessControl_RoleGranted'),
    RoleRevoked: crc32('AccessControl_RoleRevoked'),
    RoleAdminChanged: crc32('AccessControl_RoleAdminChanged'),
  },
}

export const builder = {
  message: {
    encode: () => ({
      /// Creates a new `AccessControl_GrantRole` message.
      grantRole: (msg: GrantRole): Cell => {
        return beginCell()
          .storeUint(opcodes.in.GrantRole, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.role, 256)
          .storeAddress(msg.account)
          .endCell()
      },

      /// Creates a new `AccessControl_RevokeRole` message.
      revokeRole: (msg: RevokeRole): Cell => {
        return beginCell()
          .storeUint(opcodes.in.RevokeRole, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.role, 256)
          .storeAddress(msg.account)
          .endCell()
      },

      /// Creates a new `AccessControl_RenounceRole` message.
      renounceRole: (msg: RenounceRole): Cell => {
        return beginCell()
          .storeUint(opcodes.in.RevokeRole, 32)
          .storeUint(msg.queryId, 64)
          .storeUint(msg.role, 256)
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
          .storeUint(roleData.adminRole, 256)
          .storeUint(roleData.membersLen, 64)
          .storeDict(roleData.hasRole)
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
          const dict = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.Buffer(0))
          const addAccountFn = (dict, account: Address) => dict.set(account, Buffer.alloc(0))
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

  static newAt(address: Address): AccessControl {
    return new AccessControl(address)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendGrantRole(p: ContractProvider, via: Sender, value: bigint = 0n, body: GrantRole) {
    return this.sendInternal(p, via, value, builder.message.encode().grantRole(body))
  }

  async sendRevokeRole(p: ContractProvider, via: Sender, value: bigint = 0n, body: RevokeRole) {
    return this.sendInternal(p, via, value, builder.message.encode().revokeRole(body))
  }

  async sendRenounceRole(p: ContractProvider, via: Sender, value: bigint = 0n, body: RenounceRole) {
    return this.sendInternal(p, via, value, builder.message.encode().renounceRole(body))
  }

  async getHasRole(p: ContractProvider, role: bigint, account: Address): Promise<boolean> {
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

  async getRoleAdmin(p: ContractProvider, role: bigint): Promise<bigint> {
    const result = await p.get('getRoleAdmin', [
      {
        type: 'int',
        value: role,
      },
    ])
    return result.stack.readBigNumber()
  }

  async getRoleMember(p: ContractProvider, role: bigint, index: bigint): Promise<Address | null> {
    const result = await p.get('getRoleMember', [
      {
        type: 'int',
        value: role,
      },
      {
        type: 'int',
        value: index,
      },
    ])
    return result.stack.readAddressOpt()
  }

  async getRoleMemberCount(p: ContractProvider, role: bigint): Promise<bigint> {
    const result = await p.get('getRoleMemberCount', [
      {
        type: 'int',
        value: role,
      },
    ])
    return result.stack.readBigNumber()
  }

  // TODO: add getRoleMembers binding
}
