import '@ton/test-utils'

import { beginCell, Cell, contractAddress, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { LispListContainer, TestLispList, Byte } from '../../wrappers/gen/test/TestLispList'

class LispListContract extends TestLispList {
  static create(code: Cell = TestLispList.CodeCell, data: Cell = Cell.EMPTY, workchain = 0) {
    const init = { code, data }
    return new LispListContract(contractAddress(workchain, init), init)
  }
}

describe('lisp_list generated wrapper compatibility', () => {
  it('round-trips a non-empty lisp_list encoded by Tolk', async () => {
    const blockchain = await Blockchain.create()
    const deployer = await blockchain.treasury('deployer')
    const contract = blockchain.openContract(LispListContract.create())

    await contract.sendDeploy(deployer.getSender(), toNano('0.05'))

    const encodedByTolk = await contract.getEncodedList()
    const decoded = LispListContainer.fromSlice(encodedByTolk.beginParse())
    const values = decoded.values.map((struct) => struct.value)
    const expectedValues = [1n, 2n]
    for (let i = 0; i < values.length; i++) {
      expect(values[i]).toEqual(expectedValues[i])
    }
    const encodedByTS = LispListContainer.toCell(decoded)

    // This equality is the wire-compatibility assertion. With the current
    // generated storeLispListOf implementation disabled from post-processing,
    // it demonstrates the element/tail reference-order mismatch.
    expect(encodedByTS.toString()).toEqual(encodedByTolk.toString())

    const decodedByTolk = await contract.getDecodeList(encodedByTS)
    expect(decodedByTolk).toEqual([1n, 2n])
  })
})
