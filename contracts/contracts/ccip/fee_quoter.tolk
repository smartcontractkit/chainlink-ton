import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../deployable/types.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "utils.tolk";
import "../lib/utils.tolk";

struct Storage {
    ownable: Ownable2Step;
    deployer: cell; // Deployable compiled code
    destChainConfigCode: cell; // make sure to use a library cell offchain to save space

    maxFeeJuelsPerMsg: uint96;
    linkToken: address;
    tokenPriceStalenessThreshold: uint64;

    // NOTE: for now we're embedding token/gas price data
    usdPerToken: Map<TimestampedPrice>; // (sdict len=36*8) address -> TimestampedPrice
    // TODO: this is on DestChain instead (same as Solana)
    // usdPerUnitGasByDestChain: UMap<uint64, TimestampedPrice>; // (idict len=64) chainSelector -> TimestampedPrice

    premiumMultiplierWeiPerEth: Map<uint64>; // (sdict len=36*8) token address -> multiplier

    // TODO: merge usdPerToken and premiumMultiplierWeiPerEth into one BillingToken config like solana to reduce lookups?

    // TODO: both fee quoter and onramp store DestChainConfig, can we share a single subcontract?
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

type Msg = UpdatePrices | UpdateDestChainConfig | GetValidatedFee | MessageValidated; // | MessageValidated

fun onInternalMessage(msgCell: cell, msgBody: slice) {
    // TODO: does this waste gas?
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs     = msgCell.beginParse();
    val flags  = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { return; } // ignore all bounced messages
    val sender = cs.loadAddress();

    val msg = Msg.fromSlice(msgBody);
    match (msg) {
        UpdatePrices => { onUpdatePrices(msg.updates) }
        UpdateDestChainConfig => { onUpdateDestChainConfig(msg, msgBody, sender) }
        GetValidatedFee => { onGetValidatedFee(msg, sender) }
        MessageValidated => { onMessageValidated(msg, sender) }
    }
}

@pure @inline
fun getDestChainConfigID(destChainSelector: uint64): builder {
    return beginCell() // id:u16 = 1 | destChainSelector:u64
        .storeUint(1, 16) // TODO: alias constant for DestChainConfig
        .storeUint(destChainSelector, 64);
}

// TODO: allow providing an array of these msg to feeQuoter
fun onUpdateDestChainConfig(msg: UpdateDestChainConfig, msgBody: slice, sender: address) {
    var st = Storage.load();
    st.ownable.requireOwner(sender);

    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.1"), // TODO:
        dest: {
            stateInit: {
                code: st.deployer,
                data: Deployable<builder> {
                    owner: contract.getAddress(),
                    id: getDestChainConfigID(msg.destChainSelector),
                }.toCell(),
            }
            // TODO: toShard so it's collocated with offramp
        },
        body: Initialize {
            stateInit: {
                code: st.destChainConfigCode,
                data: DestChainConfig_Storage {
                    owner: contract.getAddress(),
                    config: msg.destChainConfig,
                    usdPerUnitGas: GasPrice {
                        executionGasPrice: 0,
                        dataAvailabilityGasPrice: 0,
                        timestamp: 0, // TODO: temp set as blockchain.now() to pass validation
                    }.toCell(),
                    tokenTransferFeeConfigs: Map<TokenTransferFeeConfig>.new()
                }.toCell()
            }
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);
}

fun onUpdatePrices(priceUpdates: PriceUpdates) {
    // TODO: validate that price updates came from the offramp

    var st = Storage.load();
    val timestamp = blockchain.now();

    // TODO: assert cells are well-formed
    var iter = Iterator<TokenPriceUpdate>.new(priceUpdates.tokenPriceUpdates);
    while (!iter.empty()) {
        val update = iter.next();

        st.usdPerToken.set(update.sourceToken, TimestampedPrice {
            value: update.usdPerToken,
            timestamp
        })
    }

    var iter2 = Iterator<GasPriceUpdate>.new(priceUpdates.gasPriceUpdates);
    while (!iter2.empty()) {
        val update = iter2.next();

        // TODO: propagate gas updates to destchainconfig.usPerUnitGas
        // st.usdPerUnitGasByDestChain.set(update.destChainSelector, TimestampedPrice {
        //     value: update.usdPerUnitGas,
        //     timestamp
        // })
    }

    st.store();
}

// NOTE: for getValidatedFee to be a getter, we'd need to merge destchainconfig into feequoter
fun onGetValidatedFee(payload: GetValidatedFee, sender: address) {
    val msg = payload.msg;
    // TODO: validate origin? or charge
    var st = Storage.load();

    // call getValidatedFee on DestChainConfig
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO:
        dest: {
            stateInit: {
                code: st.deployer,
                data: Deployable<builder> {
                    owner: contract.getAddress(),
                    id: getDestChainConfigID(msg.destChainSelector),
                }.toCell(),
            }
        },
        body: GetValidatedFee { msg, caller: sender }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);
    // NOTE: this can get bounced if dest chain doesn't exist, in which case we should send
    // an error notification to the user and refund
    // it could also get bounced on a validation error

    // pass through information on token/jetton amounts
}

fun onMessageValidated(payload: MessageValidated, sender: address) {
    val msg = payload.msg.load();
    val fees = payload.fees.load();

    // TODO: validate origin: must be dest_chain_config belonging to us
    var st = Storage.load();

    // TODO: this should be eagerly validated in the router.ccipSend to revert early?
    val feeTokenPrice = st.usdPerToken.mustGet(msg.feeToken, ERROR_FEE_TOKEN_NOT_SUPPORTED);
    val premiumMultiplier = st.premiumMultiplierWeiPerEth.mustGet(msg.feeToken, ERROR_FEE_TOKEN_NOT_SUPPORTED) as uint256;

    // At this step, every fee component has been raised to 36 decimals
    val feeTokenValue =
        (fees.premiumFeeUsdWei * premiumMultiplier) + fees.executionCost + fees.dataAvailabilityCost;

    // Fee token value is in 36 decimals
    // Fee token price is in 18 decimals USD for 1e18 smallest token denominations.
    // The result is the fee in the fee tokens smallest denominations (e.g. lamport for Sol).
    val feeTokenAmount = (feeTokenValue / feeTokenPrice.value);

    // validate user transferred enough value
    // else refund and notify

    // call publish on onramp
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO:
        dest: payload.caller, // this is the onramp
        body: Publish { msg: payload.msg }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);
}

// apply_premium_multiplier_wei_per_eth_updates??

get typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.FeeQuoter", "1.0.0");
 }
