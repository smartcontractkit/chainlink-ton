import "@stdlib/gas-payments"

import "../../lib/utils"
import "../../lib/jetton/messages"

import "../pools/lib/token_pool/messages"
import "../pools/lib/token_pool/types"

import "../token_admin_registry_entry/messages"
import "../fee_quoter/messages"
import "../fee_quoter/types"
import "../onramp/messages"
import "../onramp/types"
import "../router/messages"
import "../common/types"

import "types"
import "messages"
import "storage"
import "errors"

tolk 1.4.2

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
        FeeQuoter_MessageValidated_Any => {
            var this: CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation> = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert(this.addresses.load().feeQuoter == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidated(msg);
        }
        // Sender must be the Fee Quoter
        FeeQuoter_MessageValidationFailed_Any => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert(this.addresses.load().feeQuoter == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidationFailed(msg);
        }
        // Sender must be the OnRamp after it has reserved the validated fee.
        OnRamp_ExecutorFeeReserved => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation>.load();
            assert(this.addresses.load().onramp == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
            this.onFeeReserved(msg);
        }
        // Sender must be TokenRegistry
        TokenAdminRegistryEntry_ReturnTokenInfo => {
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
                this.exitWithError(msg.errorCode as uint256, this.state.load().chargedFee.feeTokenAmount);
            } else {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
                assert(this.state.load().tokenPool == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
                this.exitWithError(msg.errorCode as uint256, this.state.load().chargedFee.feeTokenAmount);
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
                this.exitWithError(CCIPSendExecutor_Error.TokenPoolBounce as uint256, state.chargedFee.feeTokenAmount);
            } else {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
                val state = lazy this.state.load();
                val addresses = lazy this.addresses.load();
                assert(addresses.router == in.senderAddress, CCIPSendExecutor_Error.Unauthorized);
                assert(state.tokenPool == msg.tokenPool, CCIPSendExecutor_Error.Unauthorized);
                this.exitWithError(CCIPSendExecutor_Error.TokenPoolBounce as uint256, state.chargedFee.feeTokenAmount);
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
            this.exitWithError(CCIPSendExecutor_Error.FeeQuoterBounce, 0);
        }
        OnRamp_ExecutorReserveFee => {
            val this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation>.load();
            this.exitWithError(CCIPSendExecutor_Error.OnRampFeeReservationBounce, 0);
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
            tokenRegistry: config.tokenRegistry.toOptCell(),
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
        value: 0,
        dest: feeQuoter,
        body: FeeQuoter_GetValidatedFee<slice> {
            msg: onrampSend.msg,
            context: createEmptySlice(),
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidated(mutate self, msg: FeeQuoter_MessageValidated<RemainingBitsAndRefs>) {
    if (msg.fee.feeTokenAmount + Router_Costs.CCIPSend() > self.onrampSend.metadata.value) {
        self.exitWithError(CCIPSendExecutor_Error.InsufficientFunds, 0);
        return;
    }

    val reserveFee = createMessage({
        bounce: true,
        value: msg.fee.feeTokenAmount + OnRamp_Costs.ExecutorReserveFee(),
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorReserveFee {
            executorID: self.id,
            fee: msg.fee.feeTokenAmount,
        },
    });
    reserveFee.send(SEND_MODE_PAY_FEES_SEPARATELY);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_OnGoingFeeReservation {
            fee: msg.fee,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation>.onFeeReserved(mutate self, msg: OnRamp_ExecutorFeeReserved) {
    assert(msg.executorID == self.id) throw CCIPSendExecutor_Error.Unauthorized;
    val fee = self.state.load().fee;
    self.continueAfterFeeReservation(fee);
}

fun CCIPSendExecutor<T>.continueAfterFeeReservation(mutate self, chargedFee: Fee) {
    val message = Router_CCIPSend.fromCell(self.onrampSend.msg);
    val tokenAmounts = message.tokenAmounts;
    // If token amounts is empty finalize the message.
    if (tokenAmounts.empty()) {
        setGasLimitToMaximum();
        // No token transfer, so there are no pool-supplied details to report.
        self.exitSuccessfully(chargedFee, null);
        return;
     }

    // Else if there are token transfers continue querying the tokenRegistry
    val tokenRegistry = self.addresses.load().tokenRegistry!;

    //TODO: Possible optimization: We could do this earlier in onExecute. We can send to FQ and TR at the same time, then wait for both messages to continue. It increases complexity but it's slightly faster.
    val queryMsg = createMessage({
        bounce: true,
        value: TokenAdminRegistryEntry_GetTokenInfo.cost(grams("0.5")), // TODO extract to constant and calculate real values
        dest: tokenRegistry.load(),
        body: TokenAdminRegistryEntry_GetTokenInfo {
            queryId: 0,
        }
    });
    queryMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_TokenRegistryAccess {
            chargedFee,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.onTokenInfoReceived(mutate self, msg: TokenAdminRegistryEntry_ReturnTokenInfo) {
    val state = self.state.load();
    if (msg.tokenPool == null) {
        self.exitWithError(CCIPSendExecutor_Error.TokenNotEnabled, state.chargedFee.feeTokenAmount);
        return;
    }

    val routerWalletAddressRequest = createMessage({
        bounce: true,
        value: grams("0.5"), // TODO extract to constant and calculate real values
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
            chargedFee: state.chargedFee,
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
            chargedFee: state.chargedFee,
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
            chargedFee: state.chargedFee,
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
    // Forward what the pool returned so the OnRamp can emit it. sourcePoolAddress comes
    // from our own state (the pool we routed the lockOrBurn to) rather than from the
    // pool's reply, so it stays trusted.
    val state = self.state.load();
    val out = TokenPool_LockOrBurnOutV1.fromCell(msg.out);
    val tokenTransfer = OnRamp_ExecutorTokenTransfer {
        sourcePoolAddress: state.tokenPool,
        amount: msg.destTokenAmount as uint256,
        destTokenAddress: out.destTokenAddress,
        extraData: out.destPoolData,
        // TODO: source this from FeeQuoter_TokenTransferFeeConfig.destGasOverhead once the
        // FeeQuoter fee path accepts token transfers. It cannot be left empty in the
        // meantime: the offchain nodes fail to hash a message whose token transfer carries
        // no destExecData, which stalls the lane.
        destExecData: encodeDestExecData(DEFAULT_TOKEN_DEST_GAS_OVERHEAD),
    }.toCell();
    self.exitSuccessfully(state.chargedFee, tokenTransfer);
}

fun CCIPSendExecutor<T>.exitSuccessfully(self, fee: Fee, tokenTransfer: Cell<OnRamp_ExecutorTokenTransfer>?) {
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
            tokenTransfer,
        }
    });
    // SAFETY: This is an ephimeral contract. It is an *acceptor* finite-state automaton which has reached its final state. It can be safely destroyed after sending the message.
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidationFailed(mutate self, msg: FeeQuoter_MessageValidationFailed<RemainingBitsAndRefs>) {
    self.exitWithError(msg.error as uint256, 0);
}

fun CCIPSendExecutor<T>.exitWithError(self, error: uint256, chargedFee: coins?) {
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_Finalized> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_Finalized {
        }.toCell(),
    };
    newState.store();
    
    val msg = lazy self.onrampSend.msg.load();
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorFinishedWithError {
            queryID: msg.queryID,
            executorID: self.id,
            destChainSelector: msg.destChainSelector,
            sender: self.onrampSend.metadata.sender,
            error,
            refund: chargedFee.toOptCell(),
        }
    });
    // SAFETY: This is an ephimeral contract. It is an *acceptor* finite-state automaton which has reached its final state. It can be safely destroyed after sending the message.
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
