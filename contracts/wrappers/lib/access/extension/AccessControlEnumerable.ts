import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
} from '@ton/core'
import * as ac from '../AccessControl'

// AccessControlEnumerable contract data struct
export type ContractData = {
  underlying: ac.ContractData
  // Enumerates role members
  roleMembers: Dictionary<bigint, Cell>
}

export const builder = {
  data: {
    encode: () => {
      const _encodeRoleMembersDict = (accounts: Address[]): Dictionary<bigint, Cell> => {
        return Dictionary.empty(Dictionary.Keys.BigUint(32), Dictionary.Values.Cell())
      }

      return {
        // Creates a new `AccessControl_ContractData` contract data cell with the given roles.
        contractData: (data: ContractData): Cell => {
          return beginCell() // break line
            .storeDict(data.underlying.roles)
            .storeDict(data.roleMembers)
            .endCell()
        },
        // Creates a new `AccessControlEnumerable_Data.roleMembers` contract data cell with the given roles.
        roleMembersDict: _encodeRoleMembersDict,
      }
    },
    // decode: () => {}, // Decoding functions can be added here if needed
  },
}
