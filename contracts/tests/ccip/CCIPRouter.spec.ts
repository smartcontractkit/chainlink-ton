import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell, Dictionary, beginCell, Slice } from '@ton/core'
import { compile } from '@ton/blueprint'
import * as rt from '../../wrappers/ccip/Router'
import * as or from '../../wrappers/ccip/OnRamp'
import * as ex from '../../wrappers/ccip/CCIPSendExecutor'
import * as tr from '../../wrappers/ccip/TokenRegistry'
import {
  createTimestampedPriceValue,
  FeeQuoter,
  FeeQuoterStorage,
} from '../../wrappers/ccip/FeeQuoter'
import '@ton/test-utils'
import { assertLog } from '../Logs'
import { LogTypes } from '../../wrappers/ccip/Logs'
import { ZERO_ADDRESS } from '../../src/utils'
import { JettonMinterCode, JettonWalletCode } from '../../wrappers/jetton/JettonCode'
import { JettonMinter } from '../../wrappers/jetton/JettonMinter'
import * as jetton from '../../wrappers/jetton/JettonWallet'
import { dump, prettifyAddressesMap } from '../utils/prettyPrint'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_TON = 13879075125137744094n
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000001',
)

type Bind = {
  deployer: SandboxContract<TreasuryContract>
  sender: SandboxContract<TreasuryContract>
  router: SandboxContract<rt.Router>
  feeQuoter: SandboxContract<FeeQuoter>
  onRamp: SandboxContract<or.OnRamp>
  ccipSendExecutor: SandboxContract<ex.CCIPSendExecutor>
  tokenRegistry: SandboxContract<tr.TokenRegistry>
}

type Code = {
  router: Cell
  feeQuoter: Cell
  onRamp: Cell
  ccipSendExecutor: Cell
  tokenRegistry: Cell
}

describe('Router', () => {
  let blockchain: Blockchain
  let bind = {} as Bind
  let code: Code

  beforeAll(async () => {
    blockchain = await Blockchain.create()

    code = {
      router: await compile('Router'),
      feeQuoter: await compile('FeeQuoter'),
      onRamp: await compile('OnRamp'),
      ccipSendExecutor: await compile('CCIPSendExecutor'),
      tokenRegistry: await compile('TokenRegistry'),
    }

    bind.deployer = await blockchain.treasury('deployer')
    bind.sender = await blockchain.treasury('sender')

    let merkleRootCodeRaw = await compile('MerkleRoot')

    // Populate the emulator library code
    // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
    const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs
    // Mock UpdatePrices Message handler
    let data: rt.Storage = {
      ownable: {
        owner: bind.deployer.address,
        pendingOwner: null,
      },
      onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
    }
    bind.router = blockchain.openContract(rt.Router.createFromConfig(data, code.router))
    // Deploy contract
    {
      const result = await bind.router.sendInternal(
        bind.deployer.getSender(),
        toNano('1'),
        Cell.EMPTY,
      )
      expect(result.transactions).toHaveTransaction({
        from: bind.deployer.address,
        to: bind.router.address,
        deploy: true,
        success: true,
      })
    }

    // setup fee quoter
    {
      let data: FeeQuoterStorage = {
        ownable: {
          owner: bind.deployer.address,
          pendingOwner: null,
        },
        maxFeeJuelsPerMsg: 1000000n,
        linkToken: ZERO_ADDRESS,
        tokenPriceStalenessThreshold: 1000n,
        usdPerToken: Dictionary.empty(Dictionary.Keys.Address(), createTimestampedPriceValue()),
        premiumMultiplierWeiPerEth: Dictionary.empty(
          Dictionary.Keys.Address(),
          Dictionary.Values.BigUint(64),
        ),
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64)),
      }
      bind.feeQuoter = blockchain.openContract(FeeQuoter.createFromConfig(data, code.feeQuoter))

      {
        const result = await bind.feeQuoter.sendDeploy(bind.deployer.getSender(), toNano('1'))
        expect(result.transactions).toHaveTransaction({
          from: bind.deployer.address,
          to: bind.feeQuoter.address,
          deploy: true,
          success: true,
        })
      }
      {
        const result = await bind.feeQuoter.sendUpdatePrices(bind.deployer.getSender(), {
          value: toNano('1'),
          msg: {
            updates: {
              gasPricesUpdates: [],
              tokenPricesUpdates: [{ token: TEST_TOKEN_ADDR, price: 123n }],
            },
          },
        })
        expect(result.transactions).toHaveTransaction({
          to: bind.feeQuoter.address,
          success: true,
        })
      }

      // add config for EVM destination
      {
        const result = await bind.feeQuoter.sendUpdateDestChainConfigs(bind.deployer.getSender(), {
          value: toNano('1'),
          updates: [
            {
              destChainSelector: CHAINSEL_EVM_TEST_90000001,
              config: {
                // minimal valid config
                isEnabled: true,
                maxNumberOfTokensPerMsg: 0, // TODO:
                maxDataBytes: 100,
                maxPerMsgGasLimit: 100,
                destGasOverhead: 0,
                destGasPerPayloadByteBase: 0,
                destGasPerPayloadByteHigh: 0,
                destGasPerPayloadByteThreshold: 0,
                destDataAvailabilityOverheadGas: 0,
                destGasPerDataAvailabilityByte: 0,
                destDataAvailabilityMultiplierBps: 0,
                chainFamilySelector: 0,
                enforceOutOfOrder: true,
                defaultTokenFeeUsdCents: 0,
                defaultTokenDestGasOverhead: 0,
                defaultTxGasLimit: 1,
                gasMultiplierWeiPerEth: 0n,
                gasPriceStalenessThreshold: 0,
                networkFeeUsdCents: 0,
              },
            },
          ],
        })
        expect(result.transactions).toHaveTransaction({
          to: bind.feeQuoter.address,
          success: true,
        })
      }
      // configure the feeToken
      {
        const result = await bind.feeQuoter.sendUpdateFeeTokens(bind.deployer.getSender(), {
          value: toNano('1'),
          msg: {
            add: new Map([[TEST_TOKEN_ADDR, { premiumMultiplierWeiPerEth: 1n }]]),
            remove: [],
          },
        })
        expect(result.transactions).toHaveTransaction({
          to: bind.feeQuoter.address,
          success: true,
        })
      }
      // TODO: call UpdatePrices so there's a price available and the timestamp isn't zero
    }
    // setup onramp
    {
      let data: or.OnRampStorage = {
        ownable: {
          owner: bind.deployer.address,
          pendingOwner: null,
        },
        chainSelector: CHAINSEL_TON,
        config: {
          feeQuoter: bind.feeQuoter.address,
          feeAggregator: bind.deployer.address,
          allowlistAdmin: bind.deployer.address,
        },
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
        currentMessageId: 0n,
        executor_code: code.ccipSendExecutor,
        token_registry_code: code.tokenRegistry,
      }
      // TODO: use deployable to make deterministic?
      bind.onRamp = blockchain.openContract(or.OnRamp.createFromConfig(data, code.onRamp))
      {
        const result = await bind.onRamp.sendDeploy(bind.deployer.getSender(), toNano('1'))
        expect(result.transactions).toHaveTransaction({
          from: bind.deployer.address,
          to: bind.onRamp.address,
          deploy: true,
          success: true,
        })
      }

      // add config for EVM destination
      {
        const result = await bind.onRamp.sendUpdateDestChainConfigs(bind.deployer.getSender(), {
          value: toNano('1'),
          destChainConfigs: [
            {
              destChainSelector: CHAINSEL_EVM_TEST_90000001,
              router: bind.router.address,
              allowlistEnabled: false,
            },
          ],
        })
        expect(result.transactions).toHaveTransaction({
          from: bind.deployer.address,
          to: bind.onRamp.address,
          deploy: false,
          success: true,
        })
      }
    }
  }, 10000)

  it('onramp arbitrary message passing', async () => {
    // Configure onRamp on router
    {
      const result = await bind.router.sendSetRamp(bind.deployer.getSender(), {
        value: toNano('1'),
        queryID: 0,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        onRamp: bind.onRamp.address,
      })
      expect(result.transactions).toHaveTransaction({
        from: bind.deployer.address,
        to: bind.router.address,
        success: true,
      })
    }

    // bind.router.ccipSend
    {
      const result = await bind.router.sendCcipSend(bind.sender.getSender(), {
        value: toNano('1'),
        body: {
          queryID: 1,
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
          receiver: Buffer.from(
            '1234567890123456789012345678901234567890123456789012345678901234',
            'hex',
          ), // 32 bytes
          data: Cell.EMPTY,
          tokenAmounts: [],
          feeToken: TEST_TOKEN_ADDR,
          extraArgs: Cell.EMPTY,
        },
      })

      const executorAddress = ((): Address => {
        for (const tx of result.transactions) {
          if (
            tx.inMessage != null &&
            tx.inMessage != undefined &&
            tx.inMessage.info.src != null &&
            tx.inMessage.info.src != undefined &&
            tx.inMessage.info.src instanceof Address &&
            tx.inMessage.info.src.equals(bind.onRamp.address) &&
            tx.inMessage.info.dest != null &&
            tx.inMessage.info.dest != undefined &&
            tx.inMessage.info.dest instanceof Address
          ) {
            return tx.inMessage.info.dest
          }
        }
        throw new Error('Executor address not found')
      })()

      // we called the router
      expect(result.transactions).toHaveTransaction({
        from: bind.sender.address,
        to: bind.router.address,
        deploy: false,
        success: true,
      })
      // the router called the onRamp
      expect(result.transactions).toHaveTransaction({
        from: bind.router.address,
        to: bind.onRamp.address,
        deploy: false,
        success: true,
      })
      // the onRamp deployed the executor
      expect(result.transactions).toHaveTransaction({
        from: bind.onRamp.address,
        to: executorAddress,
        deploy: true,
        success: true,
      })

      // assert message went to feeQuoter
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: bind.feeQuoter.address,
        deploy: false,
        success: true,
      })

      // destChainConfig -> feeQuoter -> executor
      expect(result.transactions).toHaveTransaction({
        from: bind.feeQuoter.address,
        to: executorAddress,
        deploy: false,
        success: true,
        destroyed: false,
        // destroyed: true, // TODO should be true after tracetracker is fixed
      })

      // the executor called back the onRamp and self-destructed
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: bind.onRamp.address,
        deploy: false,
        success: true,
      })

      // assert CCIPMessageSent
      assertLog(result.transactions, bind.onRamp.address, LogTypes.CCIPMessageSent, {
        message: {
          header: {
            destChainSelector: CHAINSEL_EVM_TEST_90000001,
          },
          sender: bind.sender.address,
        },
      })
    }
  })

  // TODO: This test is only asserting the user interface. It should be extended to assert the actual fee payment
  it('onramp token transfer - paid with TON', async () => {
    // Configure onRamp on router
    {
      const result = await bind.router.sendSetRamp(bind.deployer.getSender(), {
        value: toNano('1'),
        queryID: 0,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        onRamp: bind.onRamp.address,
      })
      expect(result.transactions).toHaveTransaction({
        from: bind.deployer.address,
        to: bind.router.address,
        success: true,
      })
    }

    // Setup Jetton
    const { jettonMinter, tokenRegistry, provideUserWalletFor } = await setupJetton(
      blockchain,
      bind,
      code,
    )

    const senderJettonWallet = await provideUserWalletFor(bind.sender.address)

    const jettonAmount = toNano('1')
    const ccipSend = rt.builder.message.in.ccipSend
      .encode({
        queryID: 1,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        receiver: Buffer.alloc(64),
        data: Cell.EMPTY,
        tokenAmounts: [{ amount: jettonAmount, token: jettonMinter.address }],
        feeToken: TEST_TOKEN_ADDR,
        extraArgs: Cell.EMPTY,
      })
      .asCell()

    const transferMsg: jetton.AskToTransfer = {
      queryId: 0,
      jettonAmount,
      destination: bind.router.address,
      responseDestination: bind.sender.address,
      customPayload: null,
      forwardTonAmount: toNano('1'), // TODO This should be derived from the fee
      forwardPayload: ccipSend,
    }

    // ccip send over jetton transfer
    {
      const result = await senderJettonWallet.sendTransfer(bind.sender.getSender(), {
        value: toNano('2'),
        message: transferMsg,
      })

      const routerJettonWallet = await provideUserWalletFor(bind.router.address)
      const onRampJettonWallet = await provideUserWalletFor(bind.onRamp.address)

      const executorAddress = ((): Address => {
        for (const tx of result.transactions) {
          if (
            tx.inMessage != null &&
            tx.inMessage != undefined &&
            tx.inMessage.info.src != null &&
            tx.inMessage.info.src != undefined &&
            tx.inMessage.info.src instanceof Address &&
            tx.inMessage.info.src.equals(bind.onRamp.address) &&
            tx.inMessage.info.dest != null &&
            tx.inMessage.info.dest != undefined &&
            tx.inMessage.info.dest instanceof Address
          ) {
            return tx.inMessage.info.dest
          }
        }
        throw new Error('Executor address not found')
      })()

      const executor = blockchain.openContract(
        ex.CCIPSendExecutor.createFromAddress(executorAddress),
      )
      const executorJettonWallet = await provideUserWalletFor(executorAddress)
      console.log('trace:', (await dump(result.transactions)).join('\n'))

      // we called the router
      expect(result.transactions).toHaveTransaction({
        from: routerJettonWallet.address,
        to: bind.router.address,
        deploy: false,
        success: true,
      })
      // the router called the onRamp
      expect(result.transactions).toHaveTransaction({
        from: bind.router.address,
        to: routerJettonWallet.address,
        deploy: false,
        success: true,
        body(x) {
          if (!x) return false
          const transferRequest = jetton.builder.messages.in.askToTransfer.load(x.beginParse())
          if (transferRequest.forwardPayload == null || transferRequest.forwardPayload == undefined)
            return false
          if (!transferRequest.destination.equals(bind.onRamp.address)) return false
          try {
            const payload = or.builder.messages.in.onrampSend.load(
              ((forwardPayload: Cell | Slice): Slice => {
                if (forwardPayload instanceof Cell) {
                  return forwardPayload.beginParse()
                } else {
                  return forwardPayload
                }
              })(transferRequest.forwardPayload),
            )
            return true
          } catch {
            console.log('Failed to load onrampSend')
            return false
          }
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: onRampJettonWallet.address,
        to: bind.onRamp.address,
        deploy: false,
        success: true,
        body(x) {
          if (!x) return false
          const transferNotification =
            jetton.builder.messages.out.transferNotificationForRecipient.load(x.beginParse())
          if (
            transferNotification.forwardPayload == null ||
            transferNotification.forwardPayload == undefined
          )
            return false
          if (!transferNotification.senderAddress.equals(bind.router.address)) {
            return false
          }
          try {
            const payload = or.builder.messages.in.onrampSend.load(
              ((forwardPayload: Cell | Slice): Slice => {
                if (forwardPayload instanceof Cell) {
                  return forwardPayload.beginParse()
                } else {
                  return forwardPayload
                }
              })(transferNotification.forwardPayload),
            )
            return true
          } catch {
            return false
          }
        },
      })
      // the onRamp deployed the executor
      expect(result.transactions).toHaveTransaction({
        from: bind.onRamp.address,
        to: executorAddress,
        deploy: true,
        success: true,
      })
      // the executor withdrew the jettons
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: bind.onRamp.address,
        deploy: false,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: bind.onRamp.address,
        to: onRampJettonWallet.address,
        deploy: false,
        success: true,
        body(x) {
          if (!x) return false
          const transferRequest = jetton.builder.messages.in.askToTransfer.load(x.beginParse())
          if (transferRequest.jettonAmount !== jettonAmount) return false
          if (!transferRequest.destination.equals(executorAddress)) return false
          return true
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: executorJettonWallet.address,
        to: executorAddress,
        deploy: false,
        success: true,
        body(x) {
          if (!x) return false
          // const transferNotification =
          //   jetton.builder.messages.out.transferNotificationForRecipient.load(x.beginParse())
          // if (transferNotification.jettonAmount !== jettonAmount) return false
          // if (!transferNotification.senderAddress.equals(bind.onRamp.address)) return false
          return true
        },
      })
      // assert message went to feeQuoter
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: bind.feeQuoter.address,
        deploy: false,
        success: true,
      })

      // destChainConfig -> feeQuoter -> onRamp
      expect(result.transactions).toHaveTransaction({
        from: bind.feeQuoter.address,
        to: executorAddress,
        deploy: false,
        success: true,
      })

      // the executor called back the onRamp and self-destructed
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: bind.onRamp.address,
        deploy: false,
        success: true,
      })

      // assert CCIPMessageSent
      assertLog(result.transactions, bind.onRamp.address, LogTypes.CCIPMessageSent, {
        message: {
          header: {
            destChainSelector: CHAINSEL_EVM_TEST_90000001,
          },
          sender: bind.sender.address,
        },
      })
    }
  })
})

async function setupJetton(blockchain: Blockchain, bind: Bind, code: Code) {
  const jettonDataURI = 'smartcontract.com'

  const defaultContent = beginCell().storeStringTail(jettonDataURI).endCell()

  // get jetton wallet code
  const jettonWalletCode = await JettonWalletCode()

  // deploy jetton minter
  const jettonMinterCode = await JettonMinterCode()
  const jettonMinter = blockchain.openContract(
    JettonMinter.createFromConfig(
      {
        admin: bind.deployer.address,
        walletCode: jettonWalletCode,
        jettonContent: defaultContent,
        totalSupply: 0n,
      },
      jettonMinterCode,
    ),
  )

  const deployResult = await jettonMinter.sendDeploy(bind.deployer.getSender(), toNano('1'))

  expect(deployResult.transactions).toHaveTransaction({
    from: bind.deployer.address,
    to: jettonMinter.address,
    deploy: true,
  })

  // mint jettons to sender contract address as part of the setup
  const mintResult = await jettonMinter.sendMint(bind.deployer.getSender(), {
    value: toNano('1'),
    message: {
      queryId: 0n,
      destination: bind.sender.address,
      tonAmount: toNano('0.1'),
      jettonAmount: toNano('1'),
      from: bind.deployer.address,
      responseDestination: bind.deployer.address,
      forwardTonAmount: toNano('0.05'),
    },
  })

  expect(mintResult.transactions).toHaveTransaction({
    from: bind.deployer.address,
    to: jettonMinter.address,
    success: true,
    endStatus: 'active',
    outMessagesCount: 1, // mint message
  })

  const provideUserWalletFor = async (address: Address) => {
    return blockchain.openContract(
      jetton.JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
    )
  }

  const userJettonWallet = await provideUserWalletFor(bind.sender.address)

  expect(mintResult.transactions).toHaveTransaction({
    from: jettonMinter.address,
    to: userJettonWallet.address,
    deploy: true,
    success: true,
  })

  {
    // TODO sendUpdatePrices to pay fees with LINK
    // const result = await feeQuoter.sendUpdatePrices(bind.deployer.getSender(), {
    //   value: toNano('1'),
    //   gasPrices: [],
    //   tokenPrices: [{ token: jettonMinter.address, price: 1n }],
    // })
    // expect(result.transactions).toHaveTransaction({
    //   to: feeQuoter.address,
    //   success: true,
    // })
  }

  // configure feeQuoter to accept the jetton as fee payment
  {
    const result = await bind.feeQuoter.sendUpdateTokenTransferFeeConfigs(
      bind.deployer.getSender(),
      {
        value: toNano('1'),
        msg: {
          updates: new Map([
            [
              CHAINSEL_EVM_TEST_90000001,
              {
                add: new Map([
                  [
                    jettonMinter.address,
                    {
                      isEnabled: true,
                      minFeeUsdCents: 1,
                      maxFeeUsdCents: 100,
                      deciBps: 0,
                      destGasOverhead: 0,
                      destBytesOverhead: 0,
                    },
                  ],
                ]),
                remove: [],
              },
            ],
          ]),
        },
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: bind.deployer.address,
      to: bind.feeQuoter.address,
      success: true,
    })
  }

  let tokenRegistry: SandboxContract<tr.TokenRegistry>
  // setup token registry
  {
    let data: tr.Storage = {
      onramp: bind.onRamp.address,
      minterAddress: jettonMinter.address,
    }

    tokenRegistry = blockchain.openContract(
      tr.TokenRegistry.createFromConfig(data, code.tokenRegistry),
    )
    {
      const result = await tokenRegistry.sendDeploy(bind.deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: bind.deployer.address,
        to: tokenRegistry.address,
        deploy: true,
        success: true,
      })
    }

    {
      const result = await tokenRegistry.sendSetInfo(
        bind.deployer.getSender(),
        {
          queryId: 0,
          info: {
            tokenPool: ZERO_ADDRESS, // TODO until we have a real pool
            walletCode: jettonWalletCode,
            enabled: true,
          },
        },
        toNano('1'),
      )
      expect(result.transactions).toHaveTransaction({
        from: bind.deployer.address,
        to: tokenRegistry.address,
        success: true,
      })
    }
  }

  return {
    jettonMinter,
    tokenRegistry,
    provideUserWalletFor,
  }
}
