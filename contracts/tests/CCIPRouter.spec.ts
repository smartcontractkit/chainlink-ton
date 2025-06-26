import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell, Dictionary, Message, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'
import { Router, RouterStorage } from '../wrappers/ccip/Router'
import { OnRamp, OnRampStorage } from '../wrappers/ccip/OnRamp'

import '@ton/test-utils'
import { createTimestampedPriceValue, FeeQuoter, FeeQuoterStorage } from '../wrappers/ccip/FeeQuoter'

const ZERO_ADDRESS: Address = Address.parse("0:0000000000000000000000000000000000000000000000000000000000000000");
const CHAINSEL_EVM_TEST_90000001 =  909606746561742123n;
const CHAINSEL_TON =  123n; // TODO:

// https://github.com/ton-blockchain/liquid-staking-contract/blob/1f4e9badbed52a4cf80cc58e4bb36ed375c6c8e7/utils.ts#L269-L294
export const getExternals = (transactions: BlockchainTransaction[]) => {
    const externals:Message[] = [];
    return transactions.reduce((all, curExt) => [...all, ...curExt.externals], externals);
}

const testPartial = (cmp: any, match: any) => {
    for (let key in match) {
        if(!(key in cmp)) {
            throw Error(`Unknown key ${key} in ${cmp}`);
        }

        if(match[key] instanceof Address) {
            if(!(cmp[key] instanceof Address)) {
                return false
            }
            if(!(match[key] as Address).equals(cmp[key])) {
                return false
            }
        }
        else if(match[key] instanceof Cell) {
            if(!(cmp[key] instanceof Cell)) {
                return false;
            }
            if(!(match[key] as Cell).equals(cmp[key])) {
                return false;
            }
        }
        else if(match[key] !== cmp[key]){
            return false;
        }
    }
    return true;
}

export const testLog = (message: Message, from: Address, topic: number | bigint, matcher?:(body: Cell) => boolean) => {
    // Meh
    if(message.info.type !== "external-out") {
        console.log("Wrong from");
        return false;
    }
    if(!message.info.src.equals(from))
        return false;
    if(!message.info.dest)
        return false;
    if(message.info.dest!.value !== BigInt(topic))
        return false;
    if(matcher !== undefined) {
        if(!message.body)
            console.log("No body");
        return matcher(message.body);
    }
    return true;
};

type CCIPMessageSentParams = {
    destChainSelector: bigint,
    sequenceNumber: bigint;
    message: Cell, // TODO: parse further so we can assert on it
}
export const testLogMessageSent  = (message: Message, from: Address, match: Partial<CCIPMessageSentParams>) => {
    return testLog(message, from, LogTypes.MessageSent, x => {
        const bs = x.beginParse();
        const msg : CCIPMessageSentParams = {
            destChainSelector: bs.loadUintBig(64),
            sequenceNumber: bs.loadUintBig(64),
            message: bs.loadRef()
        }
        // TODO: use a better helper here so we get more info
        return testPartial(msg, match);
    });
}

type Log = CCIPMessageSentParams |  number;

enum LogTypes {
  MessageSent = 0x99
}

type LogMatch<T extends LogTypes> = T extends LogTypes.MessageSent ? Partial<CCIPMessageSentParams>
    : number;
export const assertLog = <T extends LogTypes>(transactions: BlockchainTransaction[], from: Address, type: T, match:LogMatch<T> ) => {
    expect(getExternals(transactions).some(x => {
        let res = false;
        switch(type) {
            case LogTypes.MessageSent:
                res = testLogMessageSent(x, from, match as Partial<CCIPMessageSentParams>);
                break;
        }
        return res;
    })).toBe(true);
}

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let router: SandboxContract<Router>
  let feeQuoter: SandboxContract<FeeQuoter>
  let onRamp: SandboxContract<OnRamp>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')

    let code = await compile('Router')
    let data: RouterStorage = {
      ownable: {
        owner: deployer.address
      },
      onRamp: ZERO_ADDRESS
    }
    router = blockchain.openContract(Router.createFromConfig(data, code))

    // setup fee quoter
    {
      let code = await compile('FeeQuoter')
      let data: FeeQuoterStorage = {
          ownable: {
              owner: deployer.address
          },
          maxFeeJuelsPerMsg: 1_000_000n,
          linkToken: ZERO_ADDRESS,
          tokenPriceStalenessThreshold: 1_000n,
          usdPerToken: Dictionary.empty(Dictionary.Keys.Address(), createTimestampedPriceValue()),
          premiumMultiplierWeiPerEth: Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigUint(64)),
      }
       // add config for EVM destination

      // TODO: use deployable to make deterministic
      feeQuoter = blockchain.openContract(FeeQuoter.createFromConfig(data, code))

      let result = await feeQuoter.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: feeQuoter.address,
        deploy: true,
        success: true,
      })
    }
    // setup onramp
    {
      let code = await compile('OnRamp')
      let data: OnRampStorage = {
          ownable: {
              owner: deployer.address
          },
          chainSelector: CHAINSEL_TON,
          config: {
              feeQuoter: feeQuoter.address,
              feeAggregator: deployer.address,
              allowlistAdmin: deployer.address
          },
          destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell())
      }
      // add config for EVM destination
      data.destChainConfigs.set(CHAINSEL_EVM_TEST_90000001, beginCell()
        .storeAddress(router.address) // TODO:
        .storeUint(0n, 64)
        .storeBit(false)
        // Map<>
        .storeDict(Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.Bool()))
        .storeUint(Dictionary.Keys.Address().bits, 16) // keyLen
        .endCell());

      // TODO: use deployable to make deterministic
      onRamp = blockchain.openContract(OnRamp.createFromConfig(data, code))

      let result = await onRamp.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onRamp.address,
        deploy: true,
        success: true,
      })
    }
  })

  it('it works', async () => {
    // Configure onRamp on router
    let result = await router.sendSetRamp(deployer.getSender(), {
      value: toNano('1'),
      queryID: 0,
      destChainSelector: CHAINSEL_EVM_TEST_90000001,
      onRamp: onRamp.address,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      deploy: true, // TRUE the first time around
      success: true,
    })

    // router.ccipSend
    result = await router.sendCcipSend(deployer.getSender(), {
      value: toNano('1'),
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST_90000001,
      receiver: Cell.EMPTY,
      data: Cell.EMPTY,
      tokenAmounts: Cell.EMPTY,
      feeToken: ZERO_ADDRESS,
      extraArgs: Cell.EMPTY,
    })

    // we called the router
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
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

    // TODO: assert message went to feeQuoter

    console.log(getExternals(result.transactions))

    // assert CCIPMessageSent
    assertLog(result.transactions, onRamp.address, LogTypes.MessageSent, { destChainSelector: CHAINSEL_EVM_TEST_90000001 })

  })
  //   expect(await calculator.getGetRoot()).toBe(expectedRoot)
})
