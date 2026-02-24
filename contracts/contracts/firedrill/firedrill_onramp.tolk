tolk 1.2

import "../lib/utils.tolk"
import "../ccip/onramp/events.tolk"
import "../ccip/onramp/types.tolk"
import "../ccip/common/types.tolk"
import "firedrill_onramp_messages.tolk"
import "firedrill_utils.tolk"

struct FiredrillOnRamp_Storage {
	id: uint32;
	controlAddress: address;
	chainSelector: uint64;
	tokenAddress: address;
}

fun FiredrillOnRamp_Storage.load(): FiredrillOnRamp_Storage {
	return FiredrillOnRamp_Storage.fromCell(contract.getData());
}

fun FiredrillOnRamp_Storage.store(self) {
	return contract.setData(self.toCell());
}

fun onInternalMessage(in: InMessage) {
	val st = lazy FiredrillOnRamp_Storage.load();
	val msg = lazy FiredrillOnRamp_InMessage.fromSlice(in.body);
	
	match (msg) {
		FiredrillOnRamp_EmitCCIPMessageSent => {
			// Only control address can trigger emissions
			assert(in.senderAddress == st.controlAddress, 100);
			emitCCIPMessageSent(msg.sender, msg.sequenceNumber, st.chainSelector, st.tokenAddress);
		}
		else => {
		    // ignore empty messages, "wrong opcode" for others
		    assert (in.body.isEmpty()) throw 0xFFFF;
		}
	}
}

fun emitCCIPMessageSent(sender: address, sequenceNumber: uint64, chainSelector: uint64, tokenAddress: address) {
	// Create a mock message header
	val messageId = beginCell()
		.storeAddress(sender)
		.storeUint(sequenceNumber, 64)
		.endCell()
		.hash();
	
	val header = RampMessageHeader {
		messageId: messageId,
		sourceChainSelector: chainSelector,
		destChainSelector: chainSelector, // For firedrill, using same chain
		sequenceNumber: sequenceNumber,
		nonce: 1
	};
	
	// Create mock message body
	val messageBody = TVM2AnyRampMessageBody {
		receiver: tonAddressToCrossChainAddress(sender).toCell(),
		data: beginCell().storeUint(123, 32).endCell(),
		extraArgs: createEmptyCell(),
		tokenAmounts: createEmptyCell(),
		feeToken: tokenAddress,
		feeTokenAmount: 0
	};
	
	val message = TVM2AnyRampMessage {
		header: header,
		sender: sender,
		body: messageBody.toCell(),
		feeValueJuels: 0
	};
	
	emit(CCIP_MESSAGE_SENT_TOPIC, CCIPMessageSent { message: message });
}

// Note: getStaticConfig name is kept to match EVM implementation
// Returns chain selector to match the StaticConfig struct from EVM
get fun staticConfig(): uint64 {
	val st = lazy FiredrillOnRamp_Storage.load();
	return st.chainSelector;
}

get fun dynamicConfig(): OnRamp_DynamicConfig {
	val st = lazy FiredrillOnRamp_Storage.load();
	return OnRamp_DynamicConfig {
		feeQuoter: st.controlAddress,
		feeAggregator: st.controlAddress,
		allowlistAdmin: st.controlAddress,
		reserve: ton("0")
	};
}

// Getter for destination chain config
get fun destChainConfig(destChainSelector: uint64): OnRamp_DestChainConfig {
	val st = lazy FiredrillOnRamp_Storage.load();
	return OnRamp_DestChainConfig {
		router: st.controlAddress,
		sequenceNumber: 0,
		allowlistEnabled: false,
		allowedSenders: createEmptyMap()
	};
}

get fun typeAndVersion(): (slice, slice) {
	return ("link.chain.ton.ccip.firedrill.firedrillOnRamp", "1.6.0")
}
