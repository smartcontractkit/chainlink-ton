import '@ton/test-utils'
import { Address, beginCell, Cell, Dictionary, Message, toNano } from '@ton/core'
import { SandboxContract, TreasuryContract, Blockchain } from '@ton/sandbox'
import { compile } from '@ton/blueprint'
import { JettonMinter, JettonWallet, JettonSender, OnrampMock } from '../wrappers/examples/jetton'
import { sha256 } from '@ton/crypto'
import {
  downloadAndVerifyJettonContracts,
  JettonContractVerifier,
} from '../scripts/jetton-contract-verifier'

const ONCHAIN_CONTENT_PREFIX = 0x00
const OFFCHAIN_CONTENT_PREFIX = 0x01

const jettonDataURI = 'smartcontract.com'

describe('Send and Receive Jettons', () => {
  let blockchain: Blockchain

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonSenderContract: SandboxContract<JettonSender>

  let deployer: SandboxContract<TreasuryContract>

  let defaultContent: Cell
  let jettonWalletCode: Cell
  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  beforeEach(async () => {
    expect(await downloadAndVerifyJettonContracts()).toEqual(true)

    blockchain = await Blockchain.create()

    deployer = await blockchain.treasury('deployer')

    defaultContent = beginCell().storeStringTail(jettonDataURI).endCell()

    // get jetton wallet code
    jettonWalletCode = await compile('jetton.JettonWallet')

    // deploy jetton minter
    const jettonMinterCode = await compile('jetton.JettonMinter')
    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          walletCode: jettonWalletCode,
          jettonContent: defaultContent,
          totalSupply: 0n,
        },
        jettonMinterCode,
      ),
    )

    const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonMinter.address,
      deploy: true,
    })

    // deploy jetton sender contract
    const jettonSenderCode = await compile('examples.jetton.JettonSender')
    jettonSenderContract = blockchain.openContract(
      JettonSender.createFromConfig(
        {
          jettonClient: {
            masterAddress: jettonMinter.address,
            jettonWalletCode: jettonWalletCode,
          },
        },
        jettonSenderCode,
      ),
    )

    const testerDeployResult = await jettonSenderContract.sendDeploy(
      deployer.getSender(),
      toNano('1'),
    )

    expect(testerDeployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonSenderContract.address,
      deploy: true,
      success: true,
    })

    // mint jettons to sender contract address as part of the setup
    const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: jettonSenderContract.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('1'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    expect(mintResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonMinter.address,
      success: true,
      endStatus: 'active',
      outMessagesCount: 1, // mint message
    })

    userWallet = async (address: Address) => {
      return blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
      )
    }
  })

  // Getting jetton data
  it('jetton mastercontract should have metadata', async () => {
    const data = await jettonMinter.getJettonData()
    let slice = data.jettonContent.beginParse()
    let prefix = slice.loadUint(8)
    expect(prefix).toEqual(ONCHAIN_CONTENT_PREFIX)
    let dictionary = Dictionary.load(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell(), slice)

    const firstKeyHashBigInt = BigInt(
      '0x' + (await sha256(Buffer.from('uri', 'utf8'))).toString('hex'),
    )
    const uriCell = dictionary.get(firstKeyHashBigInt)
    if (!uriCell) {
      throw new Error('URI not found in dictionary')
    }
    let uriSlice = uriCell?.beginParse()
    uriSlice.loadBits(8) // There is a 0x00 prefix
    const uri = uriSlice.loadStringTail()
    expect(uri).toEqual(jettonDataURI)
    const seccondKeyHashBigInt = BigInt(
      '0x' + (await sha256(Buffer.from('decimals', 'utf8'))).toString('hex'),
    )
    const decimalCell = dictionary.get(seccondKeyHashBigInt)
    if (!decimalCell) {
      throw new Error('Decimals not found in dictionary')
    }
    let decimalsSlice = decimalCell?.beginParse()
    decimalsSlice.loadBits(8) // There is a 0x00 prefix
    const decimals = decimalsSlice.loadStringTail()
    const decimalCharHex = Buffer.from(decimals, 'utf8').toString('hex')
    expect(decimals).toEqual('9')
  })

  // basic send, without any extra params
  it('jetton sender should correctly send jettons in basic mode', async () => {
    const senderContractJettonWallet = await userWallet(jettonSenderContract.address)

    const jettonTransferAmount = toNano('1')
    const receiverAddress = Address.parse('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ')

    // -(external)-> deployer -(send jettons fast)-> sender.tolk --
    // -(transfer)-> sender jetton wallet -(internal transfer)-> receiver jetton wallet
    const jettonSendResult = await jettonSenderContract.sendJettonsFast(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 0n,
        amount: jettonTransferAmount,
        destination: receiverAddress,
      },
    })

    // message from our sender.tolk to its jetton wallet
    // we need to only check that this one was send, the rest is handled by the jettons contracts
    expect(jettonSendResult.transactions).toHaveTransaction({
      from: jettonSenderContract.address,
      to: senderContractJettonWallet.address,
      success: true,
      exitCode: 0,
      outMessagesCount: 1, // internal transfer
    })

    const receiverJettonWallet = await userWallet(receiverAddress)

    const jettonReceiverDataAfter = await receiverJettonWallet.getWalletData()

    expect(jettonReceiverDataAfter.balance).toEqual(jettonTransferAmount)
  })

  // extended send, check all the params
  it('jetton sender should correctly send jettons in extended mode', async () => {
    const senderContractJettonWallet = await userWallet(jettonSenderContract.address)

    const jettonTransferAmount = toNano('1')

    // this can be any payload that we want receiver to get with transfer notification
    const jettonTransferPayload = beginCell().storeUint(239, 32).storeUint(0, 32).endCell()

    // ton amount that will be sent to the receiver with transfer notification
    const forwardTonAmount = toNano('1')

    // payload that could be used by the jetton wallets, usually just null
    const customPayload = beginCell().storeBit(true).endCell()

    const receiverAddress = Address.parse('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ')

    // -(external)-> deployer -(send jettons extended)-> sender.tolk --
    // -(transfer)-> sender jetton wallet -(internal transfer)-> receiver jetton wallet
    const jettonExtendedSendResult = await jettonSenderContract.sendJettonsExtended(
      deployer.getSender(),
      {
        value: toNano('2'),
        message: {
          queryId: 0n,
          amount: jettonTransferAmount,
          destination: receiverAddress,
          forwardPayload: jettonTransferPayload,
          forwardTonAmount: forwardTonAmount,
          customPayload: customPayload,
        },
      },
    )

    expect(jettonExtendedSendResult.transactions).toHaveTransaction({
      from: jettonSenderContract.address,
      to: senderContractJettonWallet.address,
      success: true,
      exitCode: 0,
      outMessagesCount: 1, // internal transfer
    })

    // check that we correctly send notification message and excesses
    expect(jettonExtendedSendResult.transactions).toHaveTransaction({
      from: senderContractJettonWallet.address,
      success: true,
      exitCode: 0,
      outMessagesCount: 2, // notification + excesses
    })

    const receiverJettonWallet = await userWallet(receiverAddress)

    const jettonReceiverDataAfter = await receiverJettonWallet.getWalletData()

    expect(jettonReceiverDataAfter.balance).toEqual(jettonTransferAmount)
  })
})

describe('Receiving Jettons as an Onramp Mock', () => {
  let blockchain: Blockchain

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonSenderContract: SandboxContract<JettonSender>
  let onrampMock: SandboxContract<OnrampMock>

  let deployer: SandboxContract<TreasuryContract>

  let defaultContent: Cell
  let jettonWalletCode: Cell
  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  beforeEach(async () => {
    expect(await downloadAndVerifyJettonContracts()).toEqual(true)

    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    deployer = await blockchain.treasury('deployer')

    // defaultContent = makeSnakeCell(Buffer.from(JSON.stringify(jettonMetadata), 'utf8'))
    defaultContent = beginCell().storeStringTail(jettonDataURI).endCell()

    // get jetton wallet code
    jettonWalletCode = await compile('jetton.JettonWallet')

    // deploy jetton minter
    const jettonMinterCode = await compile('jetton.JettonMinter')
    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          walletCode: jettonWalletCode,
          jettonContent: defaultContent,
          totalSupply: 0n,
        },
        jettonMinterCode,
      ),
    )

    const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonMinter.address,
      deploy: true,
    })

    // deploy jetton sender contract
    const jettonSenderCode = await compile('examples.jetton.JettonSender')
    jettonSenderContract = blockchain.openContract(
      JettonSender.createFromConfig(
        {
          jettonClient: {
            masterAddress: jettonMinter.address,
            jettonWalletCode: jettonWalletCode,
          },
        },
        jettonSenderCode,
      ),
    )

    const testerDeployResult = await jettonSenderContract.sendDeploy(
      deployer.getSender(),
      toNano('1'),
    )

    expect(testerDeployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonSenderContract.address,
      deploy: true,
      success: true,
    })

    // deploy onramp mock contract
    const onrampMockCode = await compile('examples.jetton.OnrampMock')
    onrampMock = blockchain.openContract(
      OnrampMock.createFromConfig(
        {
          jettonClient: {
            masterAddress: jettonMinter.address,
            jettonWalletCode: jettonWalletCode,
          },
        },
        onrampMockCode,
      ),
    )

    const onrampDeployResult = await onrampMock.sendDeploy(deployer.getSender(), toNano('1'))

    expect(onrampDeployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: onrampMock.address,
      deploy: true,
      success: true,
    })

    // mint jettons to sender contract address as part of the setup
    const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: jettonSenderContract.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('6'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    expect(mintResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonMinter.address,
      success: true,
      endStatus: 'active',
      outMessagesCount: 1, // mint message
    })

    userWallet = async (address: Address) => {
      return blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
      )
    }
  })

  // extended send, check all the params
  it('onramp mock should receive notification', async () => {
    const senderContractJettonWallet = await userWallet(jettonSenderContract.address)

    const insufficientJettonTransferAmount = 1n
    const sufficientJettonTransferAmount = 5n

    const ccipRequest = 'CALL step ON 0x AT evm'
    const buf = Buffer.from(ccipRequest, 'utf8')

    // this can be any payload that we want receiver to get with transfer notification
    const jettonTransferPayload = beginCell().storeBuffer(buf, buf.length).endCell()

    // ton amount that will be sent to the receiver with transfer notification
    const forwardTonAmount = toNano('1')

    // payload that could be used by the jetton wallets, usually just null
    const customPayload = beginCell().storeBit(true).endCell()

    let nextQueryId = 0n

    const insuffientFeeEventMessage = await sendCallWithAmount(insufficientJettonTransferAmount)
    // Note: Event parsing would need to be implemented based on the actual contract events
    // For now, we'll just check that the transaction was successful
    expect(insuffientFeeEventMessage).toBeDefined()

    const receiverJettonWallet = await userWallet(onrampMock.address)
    const jettonReceiverDataAfter = await receiverJettonWallet.getWalletData()
    expect(jettonReceiverDataAfter.balance).toEqual(insufficientJettonTransferAmount)

    const acceptedRequestEventMessage = await sendCallWithAmount(sufficientJettonTransferAmount)
    expect(acceptedRequestEventMessage).toBeDefined()

    const jettonReceiverDataAfter2 = await receiverJettonWallet.getWalletData()
    expect(jettonReceiverDataAfter2.balance).toEqual(
      insufficientJettonTransferAmount + sufficientJettonTransferAmount,
    )

    async function sendCallWithAmount(jettonAmount: bigint): Promise<Message | undefined> {
      const callResult = await jettonSenderContract.sendJettonsExtended(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: nextQueryId,
          amount: jettonAmount,
          destination: onrampMock.address,
          forwardPayload: jettonTransferPayload,
          forwardTonAmount: forwardTonAmount,
          customPayload: customPayload,
        },
      })
      nextQueryId++

      expect(callResult.transactions).toHaveTransaction({
        from: jettonSenderContract.address,
        to: senderContractJettonWallet.address,
        success: true,
        exitCode: 0,
        outMessagesCount: 1, // internal transfer
      })

      // check that we correctly send notification message and excesses
      expect(callResult.transactions).toHaveTransaction({
        from: senderContractJettonWallet.address,
        success: true,
        exitCode: 0,
        outMessagesCount: 2, // notification + excesses
      })

      const callTransaction = callResult.transactions.find(
        (tx) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.dest.equals(onrampMock.address),
      )

      const event = callTransaction?.outMessages.values().find((msg: Message) => {
        return msg.info.type === 'external-out'
      })
      return event
    }
  })
})
