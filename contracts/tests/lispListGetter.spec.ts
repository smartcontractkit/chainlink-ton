import { compile } from '@ton/blueprint'
import {
  Address,
  Cell,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano,
} from '@ton/core'
import { generateRandomContractId, generateRandomTonAddress, ZERO_ADDRESS } from '../src/utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import * as ownable2StepSpec from './lib/access/Ownable2StepSpec'
import * as coverage from './coverage/coverage'

class LispListGetter {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new LispListGetter(address)
  }

  static createFromConfig(code: Cell, workchain = 0) {
    const data = Cell.EMPTY
    const init = { code, data }
    return new LispListGetter(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value: value,
      bounce: false,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: Cell.EMPTY,
    })
  }

  async getList(provider: ContractProvider) {
    return await provider.get('list', []).then((r) => r.stack.readTuple())
  }
}

describe('lisp list getter', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let contract: SandboxContract<LispListGetter>
  let compiled: Cell

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    deployer = await blockchain.treasury('deployer')
    compiled = await compile('lispListGetter')

    contract = blockchain.openContract(LispListGetter.createFromConfig(compiled))
    await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
  })

  //TODO we really need to increase onramp coverage
  it('Test coverage fails ', async () => {
    const list = await contract.getList()
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      coverage.generateCoverageArtifacts(blockchain, 'lisp_list_getter', [
        {
          code: compiled,
          name: 'lisp_list_getter',
        },
      ])
    }
  })
})

const assertAddressesMatch = (expected: Address[], actual: Address[]) => {
  expect(actual.map((x) => x.toString()).sort()).toEqual(
    expected
      .map((x) => {
        return x.toString()
      })
      .sort(),
  )
}
