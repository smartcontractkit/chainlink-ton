tolk 1.4.1

contract FiredrillEntrypoint {
	author: "SmartContract Chainlink Limited SEZC"

	version: "1.6.0"

	description: "link.chain.ton.ccip.firedrill.firedrillEntrypoint.Router.FeeQuoter"

	storage: FiredrillEntrypoint_Storage
	incomingMessages: FiredrillEntrypoint_InMessage
}

import "../lib/utils.tolk"
import "../lib/access/ownable_2step.tolk"
import "../ccip/router/types.tolk"
import "../ccip/fee_quoter/types.tolk"
import "../ccip/fee_quoter/events.tolk"
import "firedrill_entrypoint_messages.tolk"
import "firedrill_onramp_messages.tolk"
import "firedrill_offramp_messages.tolk"

struct FiredrillEntrypoint_Storage {
	id: uint32;
	ownable: Ownable2Step;
	chainSelector: uint64;
	tokenAddress: address;
	firedrillContracts: Cell<FiredrillContracts>?;
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
	NothingToSend = 3001,
	MessageAlreadySent,
	NotYetSent,
	RampsAlreadyInitialized,
	RampsNotInitialized,
	NotEnoughTon
}

const DRILL_MESSAGE_VALUE: coins = ton("0.007");

fun onInternalMessage(in: InMessage) {
	var st = lazy FiredrillEntrypoint_Storage.load();
	st.ownable.requireOwner(in.senderAddress);
	val msg = lazy FiredrillEntrypoint_InMessage.fromSlice(in.body);
	val value = in.valueCoins;
	
	match (msg) {
		FiredrillEntrypoint_PrepareRegister => {
			prepareRegister(st);
		}
		FiredrillEntrypoint_DrillPendingCommitPendingQueueTxSpike => {
			drillPendingCommitPendingQueueTxSpike(mutate st, msg, value);
			st.store();
		}
		FiredrillEntrypoint_DrillPendingExecution => {
			drillPendingExecution(st, msg);
		}
		FiredrillEntrypoint_DrillPriceRegistries => {
			drillPriceRegistries(st);
		}
		FiredrillEntrypoint_InitRamps => {
			initRamps(mutate st, msg);
			st.store();
		}
		else => {
		    // attempt to handle Ownable messages
		    var st = lazy FiredrillEntrypoint_Storage.load();
		    val handled = st.ownable.onInternalMessage(in.senderAddress, in.body);
		    if (handled) {
			st.store();
			return;
		    }

		    // ignore empty messages, "wrong opcode" for others
		    assert (in.body.isEmpty()) throw 0xFFFF;
		}

	}
}

fun initRamps(mutate st: FiredrillEntrypoint_Storage, msg: FiredrillEntrypoint_InitRamps) {
	assert(st.firedrillContracts == null, FiredrillEntrypoint_Error.RampsAlreadyInitialized);
	val firedrillContracts = FiredrillContracts {
		firedrillOnRamp: msg.onramp,
		firedrillOffRamp: msg.offramp
	};
	st.firedrillContracts = firedrillContracts.toCell();
}

fun prepareRegister(st: FiredrillEntrypoint_Storage) {
	// Send message to OffRamp to emit SourceChainConfigSet event
	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
	val firedrillContracts = st.firedrillContracts.load();
	val msg = createMessage({
		bounce: false,
		value: 0,
		dest: firedrillContracts.firedrillOffRamp,
		body: FiredrillOffRamp_EmitSourceChainConfigSet {},
	});
	msg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun drillPendingCommitPendingQueueTxSpike(mutate st: FiredrillEntrypoint_Storage, msg: FiredrillEntrypoint_DrillPendingCommitPendingQueueTxSpike, value: coins) {
	assert(msg.from <= msg.to, FiredrillEntrypoint_Error.NothingToSend);
	assert(msg.from > st.sSendLast, FiredrillEntrypoint_Error.MessageAlreadySent);
	assert(value >= DRILL_MESSAGE_VALUE * (msg.to - msg.from + 1) + ton("0.005"), FiredrillEntrypoint_Error.NotEnoughTon);
	
	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
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
			value: DRILL_MESSAGE_VALUE,
			dest: firedrillContracts.firedrillOnRamp,
			body: emitMsg,
		});
		message.send(SEND_MODE_REGULAR);
		
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

	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
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
	
	emit(USD_PER_UNIT_GAS_UPDATED, UsdPerUnitGasUpdated {
		destChainSelector: st.chainSelector,
		executionGasPrice: 1,
		dataAvailabilityGasPrice: 1,
		timestamp: timestamp
	});
}

// ========== Router Getters ==========

get fun onRamp(destChainSelector: uint64): address {
	val st = lazy FiredrillEntrypoint_Storage.load();

	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
	val firedrillContracts = st.firedrillContracts.load();

	return firedrillContracts.firedrillOnRamp;
}

get fun offRamp(sourceChainSelector: uint64): address {
	val st = lazy FiredrillEntrypoint_Storage.load();

	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
	val firedrillContracts = st.firedrillContracts.load();

	return firedrillContracts.firedrillOffRamp;
}

get fun onRamps(): OnRamps {
	val st = lazy FiredrillEntrypoint_Storage.load();

	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
	val firedrillContracts = st.firedrillContracts.load();

	val selectors = beginCell().storeUint(st.chainSelector, 64).endCell() as SnakedCell<uint64>;

	return OnRamps {
		destChainSelectors: selectors,
		onRamp: firedrillContracts.firedrillOnRamp
	};
}

get fun offRamps(): OffRamps {
	val st = lazy FiredrillEntrypoint_Storage.load();

	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
	val firedrillContracts = st.firedrillContracts.load();
	val selectors = beginCell().storeUint(st.chainSelector, 64).endCell() as SnakedCell<uint64>;
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

get fun destChainConfig(destChainSelector: uint64): DestChainConfig {
  val destChainConfig: DestChainConfig = {
    config: {// minimal valid config for EVM destination
	isEnabled: true,
	maxNumberOfTokensPerMsg: 0,
	maxDataBytes: 300,
	maxPerMsgGasLimit: 4000000,
	destGasOverhead: 300000,
	destGasPerPayloadByteBase: 16,
	destGasPerPayloadByteHigh: 40,
	destGasPerPayloadByteThreshold: 100,
	destDataAvailabilityOverheadGas:300 ,
	destGasPerDataAvailabilityByte: 300,
	destDataAvailabilityMultiplierBps: 6840,
	chainFamilySelector: 0x647e2ba9, //TVM
	defaultTokenFeeUsdCents: 50,
	defaultTokenDestGasOverhead: 90000,
	defaultTxGasLimit: 1000000,
	gasMultiplierWeiPerEth: 1000000000000000000,
	gasPriceStalenessThreshold: 12 * 60 * 60,
	networkFeeUsdCents: 100,
    },
    usdPerUnitGas: GasPrice {
	executionGasPrice: 1000000,
	dataAvailabilityGasPrice: 1000000000,
	timestamp: blockchain.now()
    }.toCell(),
    tokenTransferFeeConfigs: [],
  };
  return destChainConfig;
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

	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
	val firedrillContracts = st.firedrillContracts.load();
	return firedrillContracts.firedrillOnRamp;
}

get fun offRampAddress(): address {
	val st = lazy FiredrillEntrypoint_Storage.load();

	assert(st.firedrillContracts != null, FiredrillEntrypoint_Error.RampsNotInitialized);
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

get fun typeAndVersion(): (slice, slice) {
	return ("link.chain.ton.ccip.firedrill.firedrillEntrypoint.Router.FeeQuoter".literalSlice(), "1.6.0".literalSlice())
}
