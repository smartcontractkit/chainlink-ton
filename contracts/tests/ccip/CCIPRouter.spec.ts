import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell, Dictionary, beginCell, Slice } from '@ton/core'
import { compile } from '@ton/blueprint'
import * as rt from '../../wrappers/ccip/Router'
import * as or from '../../wrappers/ccip/OnRamp'
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
import { dump } from '../utils/prettyPrint'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_TON = 13879075125137744094n
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000001',
)

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<FeeQuoter>
  let onRamp: SandboxContract<or.OnRamp>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')

    let deployerCode = await compile('Deployable')

    let merkleRootCodeRaw = await compile('MerkleRoot')

    // Populate the emulator library code
    // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
    const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs
    // Mock UpdatePrices Message handler
    let routerCode = await compile('Router')
    let data: rt.Storage = {
      ownable: {
        owner: deployer.address,
        pendingOwner: null,
      },
      onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
    }
    router = blockchain.openContract(rt.Router.createFromConfig(data, routerCode))
    // Deploy contract
    {
      const result = await router.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        deploy: true,
        success: true,
      })
    }

    // setup fee quoter
    {
      let code = await compile('FeeQuoter')

      let data: FeeQuoterStorage = {
        ownable: {
          owner: deployer.address,
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
      feeQuoter = blockchain.openContract(FeeQuoter.createFromConfig(data, code))

      {
        const result = await feeQuoter.sendDeploy(deployer.getSender(), toNano('1'))
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: feeQuoter.address,
          deploy: true,
          success: true,
        })
      }
      {
        const result = await feeQuoter.sendUpdatePrices(deployer.getSender(), {
          value: toNano('1'),
          msg: {
            updates: {
              gasPricesUpdates: [],
              tokenPricesUpdates: [{ token: TEST_TOKEN_ADDR, price: 123n }],
            },
          },
        })
        expect(result.transactions).toHaveTransaction({
          to: feeQuoter.address,
          success: true,
        })
      }

      // add config for EVM destination
      {
        const result = await feeQuoter.sendUpdateDestChainConfigs(deployer.getSender(), {
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
          to: feeQuoter.address,
          success: true,
        })
      }
      // configure the feeToken
      {
        const result = await feeQuoter.sendUpdateFeeTokens(deployer.getSender(), {
          value: toNano('1'),
          msg: {
            add: new Map([[TEST_TOKEN_ADDR, { premiumMultiplierWeiPerEth: 1n }]]),
            remove: [],
          },
        })
        expect(result.transactions).toHaveTransaction({
          to: feeQuoter.address,
          success: true,
        })
      }
      // TODO: call UpdatePrices so there's a price available and the timestamp isn't zero
    }
    // setup onramp
    {
      let code = await compile('OnRamp')
      let data: or.OnRampStorage = {
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        chainSelector: CHAINSEL_TON,
        config: {
          feeQuoter: feeQuoter.address,
          feeAggregator: deployer.address,
          allowlistAdmin: deployer.address,
        },
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
        currentMessageId: 0n,
        executor_code: await compile('CCIPSendExecutor'),
      }
      // TODO: use deployable to make deterministic?
      onRamp = blockchain.openContract(or.OnRamp.createFromConfig(data, code))
      {
        const result = await onRamp.sendDeploy(deployer.getSender(), toNano('1'))
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: onRamp.address,
          deploy: true,
          success: true,
        })
      }

      // add config for EVM destination
      {
        const result = await onRamp.sendUpdateDestChainConfigs(deployer.getSender(), {
          value: toNano('1'),
          destChainConfigs: [
            {
              destChainSelector: CHAINSEL_EVM_TEST_90000001,
              router: router.address,
              allowlistEnabled: false,
            },
          ],
        })
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: onRamp.address,
          deploy: false,
          success: true,
        })
      }
    }
  }, 10000)

  it('onramp arbitrary message passing', async () => {
    // Configure onRamp on router
    {
      const result = await router.sendSetRamp(deployer.getSender(), {
        value: toNano('1'),
        queryID: 0,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        onRamp: onRamp.address,
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    // router.ccipSend
    {
      const result = await router.sendCcipSend(sender.getSender(), {
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
            tx.inMessage.info.src.equals(onRamp.address) &&
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
        from: sender.address,
        to: router.address,
        deploy: false,
        success: true,
      })
      // the router called the onRamp
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: onRamp.address,
        deploy: false,
        success: true,
      })
      // the onRamp deployed the executor
      expect(result.transactions).toHaveTransaction({
        from: onRamp.address,
        to: executorAddress,
        deploy: true,
        success: true,
      })

      // assert message went to feeQuoter
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: feeQuoter.address,
        deploy: false,
        success: true,
      })

      // destChainConfig -> feeQuoter -> executor
      expect(result.transactions).toHaveTransaction({
        from: feeQuoter.address,
        to: executorAddress,
        deploy: false,
        success: true,
        destroyed: false,
        // destroyed: true, // TODO should be true after tracetracker is fixed
      })

      // the executor called back the onRamp and self-destructed
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: onRamp.address,
        deploy: false,
        success: true,
      })

      // assert CCIPMessageSent
      assertLog(result.transactions, onRamp.address, LogTypes.CCIPMessageSent, {
        message: {
          header: {
            destChainSelector: CHAINSEL_EVM_TEST_90000001,
          },
          sender: sender.address,
        },
      })
    }
  })

  // TODO: This test is only asserting the user interface. It should be extended to assert the actual fee payment
  it('onramp token transfer - paid with TON', async () => {
    // Configure onRamp on router
    {
      const result = await router.sendSetRamp(deployer.getSender(), {
        value: toNano('1'),
        queryID: 0,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        onRamp: onRamp.address,
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    // Setup Jetton
    const { jettonMinter, provideUserWalletFor } = await setupJetton(
      blockchain,
      feeQuoter,
      deployer,
      sender,
    )

    const senderJettonWallet = await provideUserWalletFor(sender.address)

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
      destination: router.address,
      responseDestination: sender.address,
      customPayload: null,
      forwardTonAmount: toNano('1'), // TODO This should be derived from the fee
      forwardPayload: ccipSend,
    }

    // ccip send over jetton transfer
    {
      const result = await senderJettonWallet.sendTransfer(sender.getSender(), {
        value: toNano('2'),
        message: transferMsg,
      })

      const routerJettonWallet = await provideUserWalletFor(router.address)
      const onRampJettonWallet = await provideUserWalletFor(onRamp.address)

      const executorAddress = ((): Address => {
        for (const tx of result.transactions) {
          if (
            tx.inMessage != null &&
            tx.inMessage != undefined &&
            tx.inMessage.info.src != null &&
            tx.inMessage.info.src != undefined &&
            tx.inMessage.info.src instanceof Address &&
            tx.inMessage.info.src.equals(onRamp.address) &&
            tx.inMessage.info.dest != null &&
            tx.inMessage.info.dest != undefined &&
            tx.inMessage.info.dest instanceof Address
          ) {
            return tx.inMessage.info.dest
          }
        }
        throw new Error('Executor address not found')
      })()
      const executorJettonWallet = await provideUserWalletFor(executorAddress)

      // we called the router
      expect(result.transactions).toHaveTransaction({
        from: routerJettonWallet.address,
        to: router.address,
        deploy: false,
        success: true,
      })
      // the router called the onRamp
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: routerJettonWallet.address,
        deploy: false,
        success: true,
        body(x) {
          if (!x) return false
          const transferRequest = jetton.builder.messages.in.askToTransfer.load(x.beginParse())
          if (transferRequest.forwardPayload == null || transferRequest.forwardPayload == undefined)
            return false
          if (!transferRequest.destination.equals(onRamp.address)) return false
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
        to: onRamp.address,
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
          if (!transferNotification.senderAddress.equals(router.address)) {
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
        from: onRamp.address,
        to: executorAddress,
        deploy: true,
        success: true,
      })
      // the executor withdrew the jettons
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: onRamp.address,
        deploy: false,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: onRamp.address,
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
          // if (!transferNotification.senderAddress.equals(onRamp.address)) return false
          return true
        },
      })
      // assert message went to feeQuoter
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: feeQuoter.address,
        deploy: false,
        success: true,
      })

      // destChainConfig -> feeQuoter -> onRamp
      expect(result.transactions).toHaveTransaction({
        from: feeQuoter.address,
        to: executorAddress,
        deploy: false,
        success: true,
      })

      // the executor called back the onRamp and self-destructed
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: onRamp.address,
        deploy: false,
        success: true,
      })

      // assert CCIPMessageSent
      assertLog(result.transactions, onRamp.address, LogTypes.CCIPMessageSent, {
        message: {
          header: {
            destChainSelector: CHAINSEL_EVM_TEST_90000001,
          },
          sender: sender.address,
        },
      })
    }
  })
})

async function setupJetton(
  blockchain: Blockchain,
  feeQuoter: SandboxContract<FeeQuoter>,
  deployer: SandboxContract<TreasuryContract>,
  user: SandboxContract<TreasuryContract>,
) {
  const jettonDataURI = 'smartcontract.com'

  const defaultContent = beginCell().storeStringTail(jettonDataURI).endCell()

  // get jetton wallet code
  const jettonWalletCode = await JettonWalletCode()

  // deploy jetton minter
  const jettonMinterCode = await JettonMinterCode()
  const jettonMinter = blockchain.openContract(
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

  // mint jettons to sender contract address as part of the setup
  const mintResult = await jettonMinter.sendMint(deployer.getSender(), {
    value: toNano('1'),
    message: {
      queryId: 0n,
      destination: user.address,
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

  {
    // TODO sendUpdatePrices to pay fees with LINK
    // const result = await feeQuoter.sendUpdatePrices(deployer.getSender(), {
    //   value: toNano('1'),
    //   gasPrices: [],
    //   tokenPrices: [{ token: jettonMinter.address, price: 1n }],
    // })
    // expect(result.transactions).toHaveTransaction({
    //   to: feeQuoter.address,
    //   success: true,
    // })
  }

  {
    const result = await feeQuoter.sendUpdateTokenTransferFeeConfigs(deployer.getSender(), {
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
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: feeQuoter.address,
      success: true,
    })
  }

  const provideUserWalletFor = async (address: Address) => {
    return blockchain.openContract(
      jetton.JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
    )
  }

  return {
    jettonMinter,
    provideUserWalletFor,
  }
}
