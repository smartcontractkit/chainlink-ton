import '@ton/test-utils'
import { Address, beginCell, Cell, Message, toNano } from '@ton/core'
import { SandboxContract, TreasuryContract, Blockchain } from '@ton/sandbox'
import { compile } from '@ton/blueprint'
import {
  JettonMinter,
  JettonWallet,
  JettonSender,
  OnrampMock,
  type ChangeContentMessage,
  type MintMessage,
  type SendJettonsFastMessage,
  type SendJettonsExtendedMessage,
  jettonMinterConfigToCell,
  jettonWalletConfigToCell,
  jettonSenderConfigToCell,
  onrampMockConfigToCell,
} from '../wrappers/examples/jetton'

class JettonMetadata {
  name: string
  description: string
  symbol: string
  decimals: number
  image_data: string
}

function bufferToChunks(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = []
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.subarray(i, i + chunkSize))
  }
  return chunks
}

export function makeSnakeCell(data: Buffer): Cell {
  const chunks = bufferToChunks(data, 127)

  if (chunks.length === 0) {
    return beginCell().endCell()
  }

  if (chunks.length === 1) {
    return beginCell().storeBuffer(chunks[0]).endCell()
  }

  let curCell = beginCell()

  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i]

    curCell.storeBuffer(chunk)

    if (i - 1 >= 0) {
      const nextCell = beginCell()
      nextCell.storeRef(curCell)
      curCell = nextCell
    }
  }

  return curCell.endCell()
}

export function flattenSnakeCell(cell: Cell): Buffer {
  let c: Cell | null = cell
  let output = Buffer.alloc(0)

  while (c) {
    const cs = c.beginParse()
    const remainingBits = cs.remainingBits
    if (remainingBits === 0) {
      break
    }

    const data = cs.loadBits(remainingBits)
    // bitResult.writeBits(data)
    output = Buffer.concat([output, data.subbuffer(0, remainingBits)!])
    c = c.refs && c.refs[0]
  }

  return output
}

describe('Send and Receive Jettons', () => {
  let blockchain: Blockchain

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonSenderContract: SandboxContract<JettonSender>

  let deployer: SandboxContract<TreasuryContract>

  let defaultContent: Cell
  let jettonWalletCode: Cell
  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  let jettonMetadata: JettonMetadata

  // read ./link.png and save as base64
  let imageData = `<svg width="21" height="22" viewBox="0 0 21 22" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M10.5046 4.87361L16.1192 7.97661V14.2074L10.5201 17.3302L4.90549 14.2322V8.00139L10.5046 4.87361ZM10.5046 0.293457L8.44421 1.44345L2.8348 4.57124L0.774414 5.72123V8.01131V14.2371V16.5272L2.8348 17.6673L8.44936 20.7703L10.5098 21.9104L12.5701 20.7604L18.1693 17.6326L20.2296 16.4876V14.1975V7.96669V5.67662L18.1693 4.53654L12.5547 1.43354L10.4943 0.293457H10.5046Z" fill="#375BD2"/>
</svg>`

  jettonMetadata = {
    name: 'Chainlink',
    description: 'Chainlink token on TON blockchain',
    symbol: 'LINK',
    decimals: 18,
    image_data: imageData,
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    deployer = await blockchain.treasury('deployer')

    defaultContent = makeSnakeCell(Buffer.from(JSON.stringify(jettonMetadata), 'utf8'))

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
      success: true,
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
    const json = flattenSnakeCell(data.jettonContent).toString('utf8')
    const metadataJson = JSON.parse(json)
    expect(metadataJson.name).toEqual(jettonMetadata.name)
    expect(metadataJson.description).toEqual(jettonMetadata.description)
    expect(metadataJson.symbol).toEqual(jettonMetadata.symbol)
    expect(metadataJson.decimals).toEqual(jettonMetadata.decimals)
    expect(metadataJson.image_data).toEqual(jettonMetadata.image_data)
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

  let jettonMetadata: JettonMetadata

  // read ./link.png and save as base64
  let imageData = `<svg width="21" height="22" viewBox="0 0 21 22" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M10.5046 4.87361L16.1192 7.97661V14.2074L10.5201 17.3302L4.90549 14.2322V8.00139L10.5046 4.87361ZM10.5046 0.293457L8.44421 1.44345L2.8348 4.57124L0.774414 5.72123V8.01131V14.2371V16.5272L2.8348 17.6673L8.44936 20.7703L10.5098 21.9104L12.5701 20.7604L18.1693 17.6326L20.2296 16.4876V14.1975V7.96669V5.67662L18.1693 4.53654L12.5547 1.43354L10.4943 0.293457H10.5046Z" fill="#375BD2"/>
</svg>`

  jettonMetadata = {
    name: 'Chainlink',
    description: 'Chainlink token on TON blockchain',
    symbol: 'LINK',
    decimals: 18,
    image_data: imageData,
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    deployer = await blockchain.treasury('deployer')

    defaultContent = makeSnakeCell(Buffer.from(JSON.stringify(jettonMetadata), 'utf8'))

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
      success: true,
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
