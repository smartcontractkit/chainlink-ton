tolk 1.2

import "../../../contracts/contracts/lib/utils.tolk"
import "../../../contracts/contracts/ccip/offramp/events.tolk"
import "../../../contracts/contracts/ccip/offramp/types.tolk"
import "../../../contracts/contracts/ccip/common/types.tolk"
import "../../../contracts/contracts/ccip/fee_quoter/types.tolk"
import "firedrill_offramp_messages.tolk"
import "firedrill_utils.tolk"

struct FiredrillOffRamp_Storage {
	id: uint32;
	controlAddress: address;
	chainSelector: uint64;
	onRampAddress: CrossChainAddress;
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
	
	// Create empty price updates
	val emptyTokenUpdates = beginCell().storeUint(0, 32).endCell(); // empty vec
	val emptyGasUpdates = beginCell().storeUint(0, 32).endCell(); // empty vec
	val priceUpdates = PriceUpdates {
		tokenPriceUpdates: emptyTokenUpdates,
		gasPriceUpdates: emptyGasUpdates
	};
	
	emit(TOPIC_COMMIT_REPORT_ACCEPTED, CommitReportAccepted {
		merkleRoot: merkleRoot,
		priceUpdates: priceUpdates.toCell()
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
	
	debug.print(st.onRampAddress);
	return SourceChainConfig {
		router: st.controlAddress,
		isEnabled: true,
		minSeqNr: 0,
		isRMNVerificationDisabled: false,
		onRamp: st.onRampAddress
	};
}

