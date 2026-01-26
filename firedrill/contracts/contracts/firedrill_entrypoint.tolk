tolk 1.2

import "../../../contracts/contracts/lib/utils.tolk"
import "../../../contracts/contracts/lib/access/ownable_2step.tolk"
import "../../../contracts/contracts/ccip/router/types.tolk"
import "../../../contracts/contracts/ccip/fee_quoter/types.tolk"
import "../../../contracts/contracts/ccip/fee_quoter/events.tolk"
import "firedrill_entrypoint_messages.tolk"
import "firedrill_onramp_messages.tolk"
import "firedrill_offramp_messages.tolk"

struct FiredrillEntrypoint_Storage {
	id: uint32;
	ownable: Ownable2Step;
	chainSelector: uint64;
	tokenAddress: address;
	firedrillContracts: Cell<FiredrillContracts>;
	sSendLast: uint64;
}

struct FiredrillContracts {
	firedrillOnRamp: address;
	firedrillOffRamp: address;
}

fun FiredrillEntrypoint_Storage.load(): FiredrillEntrypoint_Storage {
	return FiredrillEntrypoint_Storage.fromCell(contract.getData());
}

fun FiredrillEntrypoint_Storage.store(self) {
	return contract.setData(self.toCell());
}

enum FiredrillEntrypoint_Error {
	Unauthorized = 3000,
	NothingToSend,
	MessageAlreadySent,
	NotYetSent,
}

fun onInternalMessage(in: InMessage) {
	var st = lazy FiredrillEntrypoint_Storage.load();
	val msg = lazy FiredrillEntrypoint_InMessage.fromSlice(in.body);
	
	match (msg) {
		FiredrillEntrypoint_PrepareRegister => {
			st.ownable.requireOwner(in.senderAddress);
			prepareRegister(st);
		}
		FiredrillEntrypoint_DrillPendingCommitPendingQueueTxSpike => {
			st.ownable.requireOwner(in.senderAddress);
			drillPendingCommitPendingQueueTxSpike(mutate st, msg);
			st.store();
		}
		FiredrillEntrypoint_DrillPendingExecution => {
			st.ownable.requireOwner(in.senderAddress);
			drillPendingExecution(st, msg);
		}
		FiredrillEntrypoint_DrillPriceRegistries => {
			st.ownable.requireOwner(in.senderAddress);
			drillPriceRegistries(st);
		}
	}
}

fun prepareRegister(st: FiredrillEntrypoint_Storage) {
	// Send message to OffRamp to emit SourceChainConfigSet event
	val emitMsg = FiredrillOffRamp_EmitSourceChainConfigSet {};
	
	val firedrillContracts = st.firedrillContracts.load();
	val msg = createMessage({
		bounce: false,
		value: 0,
		dest: firedrillContracts.firedrillOffRamp,
		body: FiredrillOffRamp_EmitSourceChainConfigSet {},
	});
	msg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun drillPendingCommitPendingQueueTxSpike(mutate st: FiredrillEntrypoint_Storage, msg: FiredrillEntrypoint_DrillPendingCommitPendingQueueTxSpike) {
	assert(msg.from <= msg.to, FiredrillEntrypoint_Error.NothingToSend);
	assert(msg.from > st.sSendLast, FiredrillEntrypoint_Error.MessageAlreadySent);
	
	val firedrillContracts = st.firedrillContracts.load();
	// Send messages to OnRamp to emit CCIPMessageSent events
	var i: uint64 = msg.from;
	while (i <= msg.to) {
		val emitMsg = FiredrillOnRamp_EmitCCIPMessageSent {
			sender: contract.getAddress(),
			sequenceNumber: i
		};
		
		val message = createMessage({
			bounce: false,
			value: 0,
			dest: firedrillContracts.firedrillOnRamp,
			body: emitMsg,
		});
		message.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
		
		i += 1;
	}
	
	st.sSendLast = msg.to;
}

fun drillPendingExecution(st: FiredrillEntrypoint_Storage, msg: FiredrillEntrypoint_DrillPendingExecution) {
	assert(msg.from <= msg.to, FiredrillEntrypoint_Error.NothingToSend);
	assert(msg.to <= st.sSendLast, FiredrillEntrypoint_Error.NotYetSent);
	
	// Send message to OffRamp to emit CommitReportAccepted event
	val emitMsg = FiredrillOffRamp_EmitCommitReportAccepted {
		minSeqNr: msg.from,
		maxSeqNr: msg.to
	};

	val firedrillContracts = st.firedrillContracts.load();
	val message = createMessage({
		bounce: false,
		value: 0,
		dest: firedrillContracts.firedrillOffRamp,
		body: emitMsg,
	});
	message.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun drillPriceRegistries(st: FiredrillEntrypoint_Storage) {
	// Emit UsdPerTokenUpdated event
	val timestamp = blockchain.now();
	
	emit(USD_PER_TOKEN_UPDATED_TOPIC, UsdPerTokenUpdated {
		sourceToken: st.tokenAddress,
		usdPerToken: 1,
		timestamp: timestamp
	});
}

// ========== Router Getters ==========

get fun onRamp(destChainSelector: uint64): address {

	val st = lazy FiredrillEntrypoint_Storage.load();
	val firedrillContracts = st.firedrillContracts.load();
	return firedrillContracts.firedrillOnRamp;
}

get fun offRamp(sourceChainSelector: uint64): address {
	
	val st = lazy FiredrillEntrypoint_Storage.load();
	val firedrillContracts = st.firedrillContracts.load();
	return firedrillContracts.firedrillOffRamp;
}

get fun onRamps(): OnRamps {
	val st = lazy FiredrillEntrypoint_Storage.load();
	val firedrillContracts = st.firedrillContracts.load();
	val selectors = beginCell().storeUint(1, 32).storeUint(st.chainSelector, 64).endCell();

	return OnRamps {
		destChainSelectors: selectors,
		onRamp: firedrillContracts.firedrillOnRamp
	};
}

get fun offRamps(): OffRamps {
	val st = lazy FiredrillEntrypoint_Storage.load();
	val firedrillContracts = st.firedrillContracts.load();
	val selectors = beginCell().storeUint(1, 32).storeUint(st.chainSelector, 64).endCell();
	return OffRamps {
		sourceChainSelectors: selectors,
		offRamp: firedrillContracts.firedrillOffRamp
	};
}

// ========== FeeQuoter Getters ==========

get fun staticConfig(): (uint96, address, uint64) {
	val st = lazy FiredrillEntrypoint_Storage.load();
	// Returns (maxFeeJuelsPerMsg, linkToken, tokenPriceStalenessThreshold)
	return (1, st.tokenAddress, 0);
}

get fun tokenPrice(token: address): TimestampedPrice {
	return TimestampedPrice {
		value: 1,
		timestamp: 0
	};
}

get fun destinationChainGasPrice(destChainSelector: uint64): cell {
	val gasPrice = GasPrice {
		executionGasPrice: 1,
		dataAvailabilityGasPrice: 1,
		timestamp: 0
	};
	return gasPrice.toCell();
}

// ========== Common Getters ==========

get fun chainSelector(): uint64 {
	val st = lazy FiredrillEntrypoint_Storage.load();
	return st.chainSelector;
}

get fun tokenAddress(): address {
	val st = lazy FiredrillEntrypoint_Storage.load();
	return st.tokenAddress;
}

get fun onRampAddress(): address {
	val st = lazy FiredrillEntrypoint_Storage.load();
	val firedrillContracts = st.firedrillContracts.load();
	return firedrillContracts.firedrillOnRamp;
}

get fun offRampAddress(): address {
	val st = lazy FiredrillEntrypoint_Storage.load();
	val firedrillContracts = st.firedrillContracts.load();
	return firedrillContracts.firedrillOffRamp;
}

get fun owner(): address {
	val st = lazy FiredrillEntrypoint_Storage.load();
	return st.ownable.owner;
}

get fun pendingOwner(): address? {
	val st = lazy FiredrillEntrypoint_Storage.load();
	return st.ownable.pendingOwner;
}
