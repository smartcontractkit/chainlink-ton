import "@stdlib/gas-payments"

import "../../lib/utils"
import "../lib/client/common/types"
import "../lib/client/sender/messages"

import "../pools/lib/token_pool/messages"

import "../token_admin_registry/messages"
import "../fee_quoter/messages"
import "../fee_quoter/types"
import "../onramp/messages"
import "../onramp/types"
import "../router/messages"
import "../router/utils"

import "types"
import "messages"
import "storage"
import "errors"
import "../../../gen/Deployable.code"

tolk 1.4.2

const CONTRACT_VERSION = "1.7.0".literalSlice();

contract CCIPSendExecutor {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.7.0"
    description: "link.chain.ton.ccip.CCIPSendExecutor"

    storage: CCIPSendExecutor_Data
    storageAtDeployment: CCIPSendExecutor_InitialData
    incomingMessages: CCIPSendExecutor_InMessage
    thrownErrors: CCIPSendExecutor_Error | Utils_Error
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSendExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be this contract (called when initializing the contract)
        CCIPSendExecutor_Execute => {
            var this = init(msg.onrampSend, msg.config.load());
            assert (in.senderAddress == contract.getAddress()) throw (CCIPSendExecutor_Error.Unauthorized);
            assert (in.valueCoins >= SendExecutor_Costs.Execute()) throw (CCIPSendExecutor_Error.InsufficientFee);
            this.onExecute();
        }

        // Sender must be the Fee Quoter
        FeeQuoter_MessageValidated => {
            var this: CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation> = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert (this.addresses.load().feeQuoter == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidated(msg);
        }
        // Sender must be the Fee Quoter
        FeeQuoter_MessageValidationFailed => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            assert (this.addresses.load().feeQuoter == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onMessageValidationFailed(msg);
        }
        // Sender must be the OnRamp after it has reserved the validated fee.
        OnRamp_ExecutorFeeReserved => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation>.load();
            assert (this.addresses.load().onramp == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onFeeReserved(msg);
        }
        // Sender must be the TokenAdminRegistry
        TokenAdminRegistry_TokenInfo => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.load();
            assert (this.addresses.load().tokenRegistry!.load() == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            assert (msg.token == this.state.load().token) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onTokenInfoReceived(msg);
        }
        // Sender must be the TokenAdminRegistry
        TokenAdminRegistry_GetTokenInfoFailed => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.load();
            assert (this.addresses.load().tokenRegistry!.load() == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            assert (msg.token == this.state.load().token) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onTokenInfoFailed(msg);
        }
        // Sender must be the TokenPool
        TokenPool_LockOrBurnWithdraw => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.load();
            assert (this.state.load().tokenPool == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onConfirmLockOrBurn(msg);
        }
        TokenPool_LockOrBurnFinished => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
            assert (this.state.load().tokenPool == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onConfirmWithdraw(msg);
        }
        // Structured pool failures can arrive either before custody withdrawal
        // or while the withdrawal/finalization phase is in progress.
        TokenPool_LockOrBurnFailure => {
            val st = lazy CCIPSendExecutor_Data.fromCell(contract.getData());
            if (st.state is Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn>) {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.load();
                assert (this.state.load().tokenPool == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
                this.onLockOrBurnFailure(msg);
            } else {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
                assert (this.state.load().tokenPool == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
                this.onLockOrBurnFailure(msg);
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
                assert (addresses.router == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
                assert (state.tokenPool == msg.tokenPool) throw (CCIPSendExecutor_Error.Unauthorized);
                this.onRouterLockOrBurnFailed(msg);
            } else {
                var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.load();
                val state = lazy this.state.load();
                val addresses = lazy this.addresses.load();
                assert (addresses.router == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
                assert (state.tokenPool == msg.tokenPool) throw (CCIPSendExecutor_Error.Unauthorized);
                this.onRouterLockOrBurnFailed(msg);
            }
        }
        // The OnRamp's lock-or-burn request bounced off the Router.
        OnRamp_LockOrBurnFailed => {
            var this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.load();
            assert (this.addresses.load().onramp == in.senderAddress) throw (CCIPSendExecutor_Error.Unauthorized);
            this.onOnRampLockOrBurnFailed(msg);
        }
        else => {
            assert (in.body.isEmpty()) throw (0xFFFF);
        },   
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    assert (in.bouncedBody.preloadUint(32) == 0xfffffffe) throw (CCIPSendExecutor_Error.UnhandledLegacyBounce);
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy CCIPSendExecutor_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        FeeQuoter_GetValidatedFee => {
            val this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.load();
            this.onGetValidatedFeeBounced();
        }
        OnRamp_ExecutorReserveFee => {
            val this = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation>.load();
            this.onReserveFeeBounced();
        }
        TokenAdminRegistry_GetTokenInfo => {
            val this = CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.load();
            this.onGetTokenInfoBounced();
        }
        OnRamp_ExecutorRequestsLockOrBurn => {
            val this = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.load();
            this.onLockOrBurnRequestBounced(rich.exitCode);
        }
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
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: feeQuoter,
        body: FeeQuoter_GetValidatedFee {
            msg: onrampSend.msg,
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// The original sender's on-ramp account for `token`, holding the jettons to transfer.
fun senderOnRampAccount(sender: address, token: address, router: address): address {
    return Router.onRampAccount(router, sender, token, deployableCompiledCode()).calculateAddress();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidated(mutate self, msg: FeeQuoter_MessageValidated) {
    val hasTokens = !self.onrampSend.msg.load().tokenAmounts.empty();

    // The FeeQuoter only reports destOverheads for token-transfer messages; a tokenless
    // message legitimately carries null there, so the single-overhead requirement below
    // applies to the token path only. It must hold BEFORE the fee is locked: a malformed
    // validated fee is a validation failure, not a post-reservation refund.
    var destOverhead: FeeQuoter_DestOverhead? = null;
    try {
        assert (msg.fee.feeTokenAmount + Router_Costs.CCIPSend(hasTokens) <= self.onrampSend.metadata.value) throw (CCIPSendExecutor_Error.InsufficientFunds);
        if (hasTokens) {
            assert (msg.destOverheads != null) throw (CCIPSendExecutor_Error.InvalidValidatedFee);
            destOverhead = msg.destOverheads.asSingle();
            assert (destOverhead != null) throw (CCIPSendExecutor_Error.InvalidValidatedFee);
        }
    } catch (e) {
        // Nothing is charged or committed yet.
        self.exitWithError(e as int32, NO_FEE_CHARGED);
        return;
    }

    self.onrampSend.msg = msg.msg;

    val reserveFee = createMessage({
        bounce: BounceMode.RichBounce,
        value: msg.fee.feeTokenAmount + OnRamp_Costs.ExecutorReserveFee(),
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorReserveFee {
            executorID: self.id,
            fee: msg.fee.feeTokenAmount,
        },
    });
    reserveFee.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_OnGoingFeeReservation {
            fee: msg.fee,
            destOverhead,
            chainFamilySelector: msg.chainFamilySelector,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation>.onFeeReserved(mutate self, msg: OnRamp_ExecutorFeeReserved) {
    assert(msg.executorID == self.id) throw (CCIPSendExecutor_Error.Unauthorized);
    val state = self.state.load();
    val chargedFee = state.fee;
    val message = Router_CCIPSend.fromCell(self.onrampSend.msg);
    val tokenAmounts = message.tokenAmounts;
    // If token amounts is empty finalize the message.
    if (tokenAmounts.empty()) {
        setGasLimitToMaximum();
        // No token transfer, so there are no pool-supplied details to report.
        self.exitSuccessfully(chargedFee, null);
        return;
    }

    // Else if there are token transfers continue querying the TokenAdminRegistry
    var tokenAmount: TokenAmount? = null;
    try {
        assert (state.destOverhead != null) throw (CCIPSendExecutor_Error.MissingDestOverhead);
        tokenAmount = tokenAmounts.asSingle().unwrap(CCIPSendExecutor_Error.UnsupportedNumberOfTokens);
    } catch (e) {
        self.exitWithError(e as int32, chargedFee.feeTokenAmount);
        return;
    }
    // Token transfers always carry exactly one destGasOverhead (validated before the fee
    // was reserved), so it must be present here.
    val tokenRegistry = self.addresses.load().tokenRegistry!;

    val queryMsg = createMessage({
        bounce: BounceMode.RichBounce,
        value: TokenAdminRegistry_GetTokenInfo.cost(),
        dest: tokenRegistry.load(),
        body: TokenAdminRegistry_GetTokenInfo {
            queryID: 0,
            token: tokenAmount.token,
        }
    });
    queryMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_TokenRegistryAccess {
            chargedFee,
            token: tokenAmount.token,
            destOverhead: state.destOverhead,
            chainFamilySelector: state.chainFamilySelector,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.onTokenInfoReceived(mutate self, msg: TokenAdminRegistry_TokenInfo) {
    val state = self.state.load();
    var lockOrBurnAdmission: coins = 0;
    var tokenPool: address = ZERO_ADDRESS;
    try {
        val poolInfo = msg.poolInfo.unwrap(CCIPSendExecutor_Error.TokenNotEnabled).load();
        tokenPool = poolInfo.tokenPool;
        lockOrBurnAdmission = poolInfo.admission.load().lockOrBurn;
        // The Router checked the entry value against the pool-type default admission; a pool that
        // raised its budget is only known here.
        assert (contract.getOriginalBalance() >= OnRamp_Costs.ExecutorRequestsLockOrBurn(lockOrBurnAdmission) + SendExecutor_Costs.Finalize()) throw (CCIPSendExecutor_Error.InsufficientFunds);
    } catch (e) {
        self.exitWithError(e as int32, state.chargedFee.feeTokenAmount);
        return;
    }
    val ccipSend = lazy self.onrampSend.msg.load();
    val tokenAmount = ccipSend.tokenAmounts.iter().next();
    val addresses = lazy self.addresses.load();
    val requestLockOrBurn = createMessage({
        bounce: BounceMode.RichBounce,
        value: OnRamp_Costs.ExecutorRequestsLockOrBurn(lockOrBurnAdmission),
        dest: addresses.onramp,
        body: OnRamp_ExecutorRequestsLockOrBurn {
            queryID: ccipSend.queryID,
            tokenAmount: tokenAmount.toCell(),
            tokenPool,
            destChainSelector: ccipSend.destChainSelector,
            executorID: self.id,
            receiver: ccipSend.receiver.toCell(),
            originalSender: self.onrampSend.metadata.sender,
        }
    });
    requestLockOrBurn.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_TokenPool_LockOrBurn {
            chargedFee: state.chargedFee,
            destOverhead: state.destOverhead,
            chainFamilySelector: state.chainFamilySelector,
            tokenPool,
        }.toCell(),
    };
    newState.store();
}

fun CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.onConfirmLockOrBurn(mutate self, msg: TokenPool_LockOrBurnWithdraw) {
    val state = self.state.load();
    // Snapshot pool return data before custody moves so the pool cannot alter it in its
    // TokenPool_LockOrBurnFinished reply; the OnRamp validates destTokenAddress pre-custody.
    val prepared = lazy msg.forwardPayload.prepared.load();
    val newState = CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw> {
        id: self.id,
        onrampSend: self.onrampSend,
        addresses: self.addresses,
        state: CCIPSendExecutor_State_TokenPool_Withdraw {
            chargedFee: state.chargedFee,
            destOverhead: state.destOverhead,
            chainFamilySelector: state.chainFamilySelector,
            tokenPool: state.tokenPool,
            destTokenAmount: prepared.destTokenAmount,
            lockOrBurnOut: prepared.out.toCell(),
        }.toCell(),
    };
    newState.store();


    val ccipSend = lazy self.onrampSend.msg.load();
    val tokenAmount = ccipSend.tokenAmounts.iter().next();

    val sendMsg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorRequestsWithdraw {
            queryID: self.onrampSend.msg.load().queryID,
            executorID: self.id,
            destChainSelector: self.onrampSend.msg.load().destChainSelector,
            chainFamilySelector: state.chainFamilySelector,
            destBytesOverhead: state.destOverhead.destBytesOverhead,
            withdrawRequest: Router_WithdrawRequest {
                depositAccount: senderOnRampAccount(self.onrampSend.metadata.sender, tokenAmount.token, self.addresses.load().router),
                amount: tokenAmount.amount,
                tokenPool: state.tokenPool,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload.toCell(),
            }.toCell()
        },
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_Withdraw>.onConfirmWithdraw(mutate self, msg: TokenPool_LockOrBurnFinished) {
    setGasLimitToMaximum();
    // Emit from our pre-custody snapshot, not the pool's reply, so a misbehaving pool
    // cannot alter lockOrBurnOut/destTokenAmount after the tokens were locked/burned.
    val state = self.state.load();
    val tokenTransfer = OnRamp_ExecutorTokenTransfer {
        sourcePoolAddress: state.tokenPool,
        amount: state.destTokenAmount as uint256,
        lockOrBurnOut: state.lockOrBurnOut,
        destExecData: encodeDestExecData(state.destOverhead.destGasOverhead),
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
        bounce: BounceMode.NoBounce,
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
    // SAFETY: This is an ephemeral contract. It is an *acceptor* finite-state automaton which has reached its final state. It can be safely destroyed after sending the message.
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onMessageValidationFailed(mutate self, msg: FeeQuoter_MessageValidationFailed) {
    self.exitWithError(msg.errorCode, NO_FEE_CHARGED);
}

const NO_FEE_CHARGED: coins = 0

/// FeeQuoter_GetValidatedFee bounced. Nothing is charged yet.
fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeValidation>.onGetValidatedFeeBounced(self) {
    self.exitWithError(CCIPSendExecutor_Error.FeeQuoterBounce, NO_FEE_CHARGED);
}

/// OnRamp_ExecutorReserveFee bounced, so OnRamp rolled back the reservation. Nothing is charged.
fun CCIPSendExecutor<CCIPSendExecutor_State_OnGoingFeeReservation>.onReserveFeeBounced(self) {
    self.exitWithError(CCIPSendExecutor_Error.OnRampFeeReservationBounce, NO_FEE_CHARGED);
}

/// The token registry failed to answer the token-info query. The fee is already reserved on the
/// OnRamp, so finalize with an error and refund it.
fun CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.onGetTokenInfoBounced(self) {
    self.exitWithError(CCIPSendExecutor_Error.TokenRegistryBounce, self.state.load().chargedFee.feeTokenAmount);
}

/// OnRamp rejected the lock-or-burn request (authorization or destination chain lookup), so
/// nothing reached the Router or the pool. Forward OnRamp's exit code and refund the reserved fee.
fun CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.onLockOrBurnRequestBounced(self, errorCode: int32) {
    self.exitWithError(errorCode, self.state.load().chargedFee.feeTokenAmount);
}

/// The token registry has no pool for the token. Refund the reserved fee.
fun CCIPSendExecutor<CCIPSendExecutor_State_TokenRegistryAccess>.onTokenInfoFailed(self, msg: TokenAdminRegistry_GetTokenInfoFailed) {
    self.exitWithError(CCIPSendExecutor_Error.TokenNotEnabled as int32, self.state.load().chargedFee.feeTokenAmount);
}

/// The pool failed the lock-or-burn and restored its own rate limit. Forward its error and refund
/// the reserved fee. Arrives in the LockOrBurn or the Withdraw state.
fun CCIPSendExecutor<T>.onLockOrBurnFailure(self, msg: TokenPool_LockOrBurnFailure) {
    self.exitWithError(msg.errorCode, self.state.load().chargedFee.feeTokenAmount);
}

/// The Router reports a policy rejection, a pre-admission pool bounce or a bounced withdrawal.
/// Refund the reserved fee. Arrives in the LockOrBurn or the Withdraw state.
fun CCIPSendExecutor<T>.onRouterLockOrBurnFailed(self, msg: Router_TokenPoolLockOrBurnFailed) {
    self.exitWithError(msg.errorCode, self.state.load().chargedFee.feeTokenAmount);
}

/// The OnRamp's lock-or-burn request bounced off the Router. Forward the Router's exit code and
/// refund the reserved fee.
fun CCIPSendExecutor<CCIPSendExecutor_State_TokenPool_LockOrBurn>.onOnRampLockOrBurnFailed(self, msg: OnRamp_LockOrBurnFailed) {
    self.exitWithError(msg.errorCode, self.state.load().chargedFee.feeTokenAmount);
}

fun CCIPSendExecutor<T>.exitWithError(self, errorCode: int32, chargedFee: coins?) {
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
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: self.addresses.load().onramp,
        body: OnRamp_ExecutorFinishedWithError {
            queryID: msg.queryID,
            executorID: self.id,
            destChainSelector: msg.destChainSelector,
            sender: self.onrampSend.metadata.sender,
            errorCode,
            refund: chargedFee.toOptCell(),
        }
    });
    // SAFETY: This is an ephemeral contract. It is an *acceptor* finite-state automaton which has reached its final state. It can be safely destroyed after sending the message.
    sendMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
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
