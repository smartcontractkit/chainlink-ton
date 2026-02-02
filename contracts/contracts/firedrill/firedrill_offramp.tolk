tolk 1.2

import "../lib/utils.tolk"
import "../ccip/offramp/events.tolk"
import "../ccip/offramp/types.tolk"
import "../ccip/common/types.tolk"
import "firedrill_offramp_messages.tolk"

struct FiredrillOffRamp_Storage {
	id: uint32;
	controlAddress: address;
	chainSelector: uint64;
	onRampAddress: CrossChainAddress; // Should be the address of the firedrill onramp contract (TON address but in CrossChainAddress format)
}

fun FiredrillOffRamp_Storage.load(): FiredrillOffRamp_Storage {
	return FiredrillOffRamp_Storage.fromCell(contract.getData());
}

fun FiredrillOffRamp_Storage.store(self) {
	return contract.setData(self.toCell());
}

fun onInternalMessage(in: InMessage) {
	val st = lazy FiredrillOffRamp_Storage.load();
	val msg = lazy FiredrillOffRamp_InMessage.fromSlice(in.body);
	
	match (msg) {
		FiredrillOffRamp_EmitSourceChainConfigSet => {
			// Only control address can trigger emissions
			assert(in.senderAddress == st.controlAddress, 100);
			emitSourceChainConfigSet(st);
		}
		FiredrillOffRamp_EmitCommitReportAccepted => {
			// Only control address can trigger emissions
			assert(in.senderAddress == st.controlAddress, 100);
			emitCommitReportAccepted(msg.minSeqNr, msg.maxSeqNr, st);
		}
	}
}

fun emitSourceChainConfigSet(st: FiredrillOffRamp_Storage) {
	val sourceConfig = SourceChainConfig {
		router: st.controlAddress,
		isEnabled: true,
		minSeqNr: 0,
		isRMNVerificationDisabled: false,
		onRamp: st.onRampAddress
	};
	
	emit(SOURCE_CHAIN_CONFIG_UPDATED_TOPIC, SourceChainConfigUpdated {
		sourceChainSelector: st.chainSelector,
		sourceChainConfig: sourceConfig
	});
}

fun emitCommitReportAccepted(minSeqNr: uint64, maxSeqNr: uint64, st: FiredrillOffRamp_Storage) {
	// Create merkle root
	val merkleRootHash = beginCell()
		.storeSlice(st.onRampAddress.toCell().beginParse())
		.storeUint(minSeqNr, 64)
		.storeUint(maxSeqNr, 64)
		.endCell()
		.hash();
	
	val merkleRoot = MerkleRoot {
		sourceChainSelector: st.chainSelector,
		onRampAddress: st.onRampAddress,
		minSeqNr: minSeqNr,
		maxSeqNr: maxSeqNr,
		merkleRoot: merkleRootHash
	};
	
	// Emit CommitReportAccepted with empty price updates
	emit(TOPIC_COMMIT_REPORT_ACCEPTED, CommitReportAccepted {
		merkleRoot: merkleRoot,
		priceUpdates: null
	});
}

// Getter for static config
get fun staticConfig(): uint64 {
	val st = lazy FiredrillOffRamp_Storage.load();
	return st.chainSelector;
}

// Getter for dynamic config
get fun dynamicConfig(): (address, uint32) {
	val st = lazy FiredrillOffRamp_Storage.load();
	// Returns (feeQuoter, permissionlessExecutionThresholdSeconds)
	return (st.controlAddress, 10);
}

// Getter for source chain config
get fun sourceChainConfig(sourceChainSelector: uint64): SourceChainConfig {
	val st = lazy FiredrillOffRamp_Storage.load();
	
	return SourceChainConfig {
		router: st.controlAddress,
		isEnabled: true,
		minSeqNr: 0,
		isRMNVerificationDisabled: false,
		onRamp: st.onRampAddress
	};
}

get fun typeAndVersion(): (slice, slice) {
	return ("com.chainlink.ton.ccip.firedrill.firedrillOffRamp", "1.6.0")
}
