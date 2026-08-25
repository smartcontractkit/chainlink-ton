import "@stdlib/gas-payments"

import "../../lib/utils"
import "../../lib/jetton/messages"

import "../pools/lib/token_pool/messages"
import "../token_registry/messages"
import "../fee_quoter/messages"
import "../fee_quoter/types"
import "../onramp/messages"
import "../router/messages"
import "../common/types"

import "types"
import "messages"
import "storage"
import "errors"

tolk 1.4.1

const CONTRACT_VERSION = "1.6.1".literalSlice();

contract CCIPSendExecutor {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.CCIPSendExecutor"

    storage: CCIPSendExecutor_Data
    storageAtDeployment: CCIPSendExecutor_InitialData
    incomingMessages: CCIPSendExecutor_InMessage
    // TBD Acton is not detecting InsufficientFunds and FeeQuoterBounce.
    thrownErrors: CCIPSendExecutor_Error | Utils_Error
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSendExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be this contract (called when initializing the contract)
        CCIPSendExecutor_Execute => {
            var this = init(msg.onrampSend, msg.config.load());
            assert (in.senderAddress == contract.getAddress()) throw CCIPSendExecutor_Error.Unauthorized;
            assert (in.valueCoins >= SendExecutor_Costs.Execute()) throw CCIPSendExecutor_Error.InsufficientFee;
            this.onExecute();
        }

        // Sender must be the Fee Quoter
        FeeQuoter_MessageValidated<RemainingBitsAndRefs> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert(this.addresses.load().feeQuoter == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidated(msg);
        }
        // Sender must be the Fee Quoter
        FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs> => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert(this.addresses.load().feeQuoter == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidationFailed(msg);
        }
        // Sender must be TokenRegistry
        TokenRegistry_ReturnTokenInfo => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.load();
            assert(this.addresses.load().tokenRegistry!.load() == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onTokenInfoReceived(msg);
        }
        // Sender must be minter
        ResponseWalletAddress => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_WalletAddressValidation>.load();
            assert(this.state.load().minterAddress == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onResponseWalletAddress(msg);
        }
        // Sender must be the TokenPool
        TokenPool_LockOrBurnWithdraw => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.load();
            assert(this.state.load().tokenPool == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onConfirmLockOrBurn(msg);
        }
        TokenPool_LockOrBurnFinished => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
            assert(this.state.load().tokenPool == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onConfirmWithdraw(msg);
        }
        // Structured pool failures can arrive either before custody withdrawal
        // or while the withdrawal/finalization phase is in progress.
        TokenPool_LockOrBurnFailure => {
            val st = lazy CCIPSendExecutor_Data.fromCell(contract.getData());
            if (st.state is Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn>) {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.load();
                assert(this.state.load().tokenPool == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
                this.exitWithError(msg.errorCode as uint256);
            } else {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
                assert(this.state.load().tokenPool == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
                this.exitWithError(msg.errorCode as uint256);
            }
        }
        // Router policy rejection, a pre-admission pool bounce, or a bounced
        // Router-wallet withdrawal is reported by the configured Router.
        Router_TokenPoolLockOrBurnFailed => {
            val st = lazy CCIPSendExecutor_Data.fromCell(contract.getData());
            if (st.state is Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn>) {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.load();
                val state = lazy this.state.load();
                val addresses = lazy this.addresses.load();
                assert(addresses.router == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
                assert(state.tokenPool == msg.tokenPool, CCIPSendExecutor_Error.Unauthorized);
                this.exitWithError(CCIPSendExecutor_Error.TokenPoolBounce as uint256);
            } else {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
                val state = lazy this.state.load();
                val addresses = lazy this.addresses.load();
                assert(addresses.router == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
                assert(state.tokenPool == msg.tokenPool, CCIPSendExecutor_Error.Unauthorized);
                this.exitWithError(CCIPSendExecutor_Error.TokenPoolBounce as uint256);
            }
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        },   
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    val msg = lazy CCIPSendExecutor_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());
    match (msg) {
        FeeQuoter_GetValidatedFee<RemainingBitsAndRefs> => {
            val this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            this.exitWithError(CCIPSendExecutor_Error.FeeQuoterBounce);
        }
        //TODO: We should handle bounced messages from the TokenRegistry, as that means the token is not enabled on the lane
    }
}

fun init(onrampSend: OnRamp_Send, config: CCIPSendExecutor_Config): CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
    val st = lazy CCIPSendExecutor_InitialData.fromCell(contract.getData());
    return CCIPSendExecutor<CCIPSendExecutor_State_Initialized> {
        id: st.id,
        onrampSend,
        addresses: CCIPSendExecutor_Addresses {
            onramp: st.onramp,
            router: config.router,
            feeQuoter: config.feeQuoter,
            tokenRegistry: onrampSend.tokenRegistry.toOptCell(),
        }.toCell(),
        state: CCIPSendExecutor_State_Initialized{
        }.toCell(),
    };
}

fun CCIPSendExecutor<CCIPSendExecutor_State_Initialized>.onExecute(mutate self) {
    getValidatedFee(self.addresses.load().feeQuoter, self.onrampSend);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_OnGoingFeeValidation {
        }.toCell(),
    };
    newState.store();
}

fun getValidatedFee(feeQuoter: address, onrampSend: OnRamp_Send) {
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: FeeQuoter_Costs.GetValidatedFee(),
        dest: feeQuoter,
        body: FeeQuoter_GetValidatedFee<slice> {
            msg: onrampSend.msg,
            context: createEmptySlice(),
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidated(mutate self, msg: FeeQuoter_MessageValidated<RemainingBitsAndRefs>) {
    val message = Router_CCIPSend.fromCell(self.onrampSend.msg);
    val tokenAmounts = message.tokenAmounts;
    if (msg.fee.feeTokenAmount + Router_Costs.CCIPSend() > self.onrampSend.metadata.value) {
        self.exitWithError(CCIPSendExecutor_Error.InsufficientFunds);
        return;
    }
    // If token amounts is empty finalize the message
    if (tokenAmounts.empty()) {
        setGasLimitToMaximum();
        self.exitSuccessfully(msg.fee);
        return;
     }

    // Else if there are token transfers continue querying the tokenRegistry
    val tokenRegistry = self.addresses.load().tokenRegistry!;

    //TODO: Possible optimization: We could do this earlier in onExecute. We can send to FQ and TR at the same time, then wait for both messages to continue. It increases complexity but it's slightly faster.
    val queryMsg = createMessage({
        bounce: true,
        value: TokenRegistry_GetTokenInfo.cost(ton("0.5")), // TODO extract to constant and calculate real values
        dest: tokenRegistry.load(),
        body: TokenRegistry_GetTokenInfo {
        }
    });
    queryMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_TokenRegistryAccess {
            fee: msg.fee,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.onTokenInfoReceived(mutate self, msg: TokenRegistry_ReturnTokenInfo) {
    val state = self.state.load();
    assert(msg.tokenPool != null) throw CCIPSendExecutor_Error.TokenNotEnabled;

    val routerWalletAddressRequest = createMessage({
        bounce: true,
        value: ton("0.5"), // TODO extract to constant and calculate real values
        dest: msg.minterAddress,
        body: RequestWalletAddress {
            queryId: 0,
            ownerAddress: self.addresses.load().router,
            includeOwnerAddress: false,
        },
    });
    routerWalletAddressRequest.send(SEND_MODE_PAY_FEES_SEPARATELY);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_WalletAddressValidation> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_WalletAddressValidation {
            fee: state.fee,
            minterAddress: msg.minterAddress,
            tokenPool: msg.tokenPool,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_WalletAddressValidation>.onResponseWalletAddress(mutate self, msg: ResponseWalletAddress) {
    //TODO instead of throw maybe this should exit with error?
    val state = self.state.load();
    val ccipSend = lazy self.onrampSend.msg.load();
    val tokenAmount = ccipSend.tokenAmounts.iter().next();
    val addresses = lazy self.addresses.load();
    val requestLockOrBurn = createMessage({
        bounce: true,
        value: OnRamp_ExecutorRequestsLockOrBurn.cost(),
        dest: addresses.onramp,
        body: OnRamp_ExecutorRequestsLockOrBurn {
            queryID: ccipSend.queryID,
            tokenAmount: tokenAmount.toCell(),
            tokenPool: state.tokenPool,
            destChainSelector: ccipSend.destChainSelector,
            executorID: self.id,
            receiver: ccipSend.receiver.toCell(),
            originalSender: self.onrampSend.metadata.sender,
        }
    });
    requestLockOrBurn.send(SEND_MODE_PAY_FEES_SEPARATELY);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_TokenPool_LockOrBurn {
            fee: state.fee,
            minterAddress: state.minterAddress,
            tokenPool: state.tokenPool,
            routerWalletAddress: msg.jettonWalletAddress!, // TODO what to do if null
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.onConfirmLockOrBurn(mutate self, msg: TokenPool_LockOrBurnWithdraw) {
    val state = self.state.load();
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_TokenPool_Withdraw {
            fee: state.fee,
            minterAddress: state.minterAddress,
            tokenPool: state.tokenPool,
            routerWalletAddress: state.routerWalletAddress,
        }.toCell(),
    };
    newState.store();


    val ccipSend = lazy self.onrampSend.msg.load();
    val tokenAmount = ccipSend.tokenAmounts.iter().next();

    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorRequestsWithdraw {
            queryID: self.onrampSend.msg.load().queryID,
            executorID: self.id,
            destChainSelector: self.onrampSend.msg.load().destChainSelector,
            withdrawRequest: Router_WithdrawRequest {
                routerWalletAddress: state.routerWalletAddress,
                amount: tokenAmount.amount,
                tokenPool: state.tokenPool,
                forwardPayload: msg.forwardPayload.toCell(),
            }.toCell()
        },
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.onConfirmWithdraw(mutate self, msg: TokenPool_LockOrBurnFinished) {
    setGasLimitToMaximum();
    self.exitSuccessfully(self.state.load().fee);
}

fun CCIPSendExecutor<T>.exitSuccessfully(self, fee: Fee) {
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_Finalized> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_Finalized {
        }.toCell(),
    };
    newState.store();

    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorFinishedSuccessfully {
            fee,
            executorID: self.id,
            msg: self.onrampSend.msg,
            metadata: self.onrampSend.metadata,
        }
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidationFailed(mutate self, msg: FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>) {
    self.exitWithError(msg.error as uint256);
}

fun CCIPSendExecutor<T>.exitWithError(self, error: uint256) {
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_Finalized> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_Finalized {
        }.toCell(),
    };
    newState.store();
    
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorFinishedWithError {
            executorID: self.id,
            error,
            msg: self.onrampSend.msg,
            metadata: self.onrampSend.metadata,
        }
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE);
}

get fun typeAndVersion(): (slice, slice) {
    return (CCIPSendExecutor_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return CCIPSendExecutor_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(CCIPSendExecutor_FACILITY_NAME.crc32(), local);
}
