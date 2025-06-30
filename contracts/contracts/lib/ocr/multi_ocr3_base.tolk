import "./types.tolk"
import "/exit_codes.tolk";
import "./../utils.tolk";

/// @notice Event, triggers a new run of the offchain reporting protocol.
/// @param ocrPluginType OCR plugin type for which the config was set.
/// @param configDigest configDigest of this configuration.
/// @param signers ith element is address ith oracle uses to sign a report.
/// @param transmitters ith element is address ith oracle uses to transmit a report via the transmit method.
/// @param F maximum number of faulty/dishonest oracles the protocol can tolerate while still working correctly.
struct OCR3Base_ConfigSet {
    ocrPluginType: uint16;
    configDigest: uint256;
    signers: cell; //Iterator<uint256>
    transmitters: cell; // Iterator<address>
    bigF: uint8;
}


/// @notice Event, optionally emitted to indicate the latest configDigest and sequence number
/// for which a report was successfully transmitted. Alternatively, the contract may
/// use latestConfigDigestAndEpoch with scanLogs set to false.
struct OCR3Base_Transmitted {
   ocrPluginType: uint16;
   configDigest: uint256;
   sequenceNumber: uint64
}

/// @notice Sets offchain reporting protocol configuration incl. participating oracles.
/// NOTE: The OCR3 config must be sanity-checked against the home-chain registry configuration, to ensure home-chain
/// and remote-chain parity!
/// @param ocrConfigArgs OCR config update args.
/// @dev precondition number of transmitters should match the expected F/fChain relationship.
/// For transmitters, the function only validates that len(transmitters) > 0 && len(transmitters) <= MAX_NUM_ORACLES
/// && len(transmitters) <= len(signers) [if sig verification is enabled].
struct (0x00000001) OCR3Base_SetOCR3Config {
    configDigest: uint256;
    ocrPluginType: uint16;
    bigF: uint8;
    isSignatureVerificationEnabled: bool;
    signers: cell; //Iterator<uint256>;
    transmitters: cell; //Iterator<address>;
}

fun OCR3Base.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {

    try {
    	var msg = OCR3Base_SetOCR3Config.fromSlice(msgBody);
	var cs = msgFull.beginParse();
	var flags = cs.loadMessageFlags();
	if (isMessageBounced(flags)) { // ignore all bounced messages
            return false;
        }
	self.setOcr3Config(msg);
	return true;

    } catch (exitCode) {
        if (exitCode != 63) { // 63 is "unknown opcode"
            throw exitCode;
        }
        return false; // Not an OCR3Base message
    }
}

fun OCR3Base.setOcr3Config(mutate self, msg: OCR3Base_SetOCR3Config) {

	assert(msg.ocrPluginType == OCR_PLUGIN_TYPE_COMMIT || msg.ocrPluginType == OCR_PLUGIN_TYPE_EXECUTION, ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE);

	//TODO: self.requireOwner();
	assert(msg.bigF > 0, ERROR_BIG_F_MUST_BE_POSITIVE);

	var (ocrConfig, ok) = self.ocr3Configs.get(msg.ocrPluginType);
	if (!ok) {
		//initialize the config if it does not exist
		ocrConfig = newOCRConfig()
	} else {
		ocrConfig = ocrConfig!;
	}

	// If F is 0, then the config is not yet set.
	if (ocrConfig.configInfo.bigF == 0) {
		ocrConfig.configInfo.isSignatureVerificationEnabled = msg.isSignatureVerificationEnabled;
	} else {
		assert(
			ocrConfig.configInfo.isSignatureVerificationEnabled == msg.isSignatureVerificationEnabled,
			ERROR_STATIC_CONFIG_CANNOT_BE_CHANGED
		);
	}

	val transmitters_length = Iterator<address>.new(msg.transmitters).countBytes() /36;

	assert(transmitters_length <= MAX_NUM_ORACLES, ERROR_TOO_MANY_TRANSMITTERS);
	assert(transmitters_length > 0, ERROR_NO_TRANSMITTERS);
	
	if (msg.isSignatureVerificationEnabled) {
		val signers_length = Iterator<uint256>.new(msg.signers).countBytes() / 32;
		assert(signers_length <= MAX_NUM_ORACLES, ERROR_TOO_MANY_SIGNERS);
		assert(signers_length > 3 * msg.bigF, ERROR_BIG_F_TOO_HIGH);
		assert(signers_length >= transmitters_length, ERROR_TOO_MANY_TRANSMITTERS);

		ocrConfig.configInfo.n = signers_length;
		ocrConfig.signers = msg.signers;
		self.assignSignerOracles(msg.ocrPluginType, msg.signers);
	}

	ocrConfig.transmitters = msg.transmitters;

	self.assignTransmitterOracles(
		msg.ocrPluginType,
		msg.transmitters
	);

	ocrConfig.configInfo.bigF = msg.bigF;
	ocrConfig.configInfo.configDigest = msg.configDigest;
	
	self.ocr3Configs.set(
		msg.ocrPluginType,
		ocrConfig
	);

	//TODO: Emit on a topic using emit<T> from utils.tolk
	val emitMsg = createExternalLogMessage({
		dest:createAddressNone(),
		body: OCR3Base_ConfigSet {
			ocrPluginType: msg.ocrPluginType,
			configDigest: ocrConfig.configInfo.configDigest,
			signers: ocrConfig.signers,
			transmitters: ocrConfig.transmitters,
			bigF: ocrConfig.configInfo.bigF
		}
	});
	emitMsg.send(SEND_MODE_REGULAR);
}

fun OCR3Base.transmit(
    mutate self,
    transmitter: address,
    ocrPluginType: int,
    reportContext: ReportContext,
    report: cell,
    signatures: cell, //Iterator<SignatureEd25519>
    ) { 
    var (ocrConfig, foundConfig) = self.ocr3Configs.get(ocrPluginType);
    assert(foundConfig, ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE);
    ocrConfig = ocrConfig!;
    var configInfo: ConfigInfo = ocrConfig.configInfo;
    
    // TODO: EVM checks transaction data length here
    
    assert(reportContext.configDigest == configInfo.configDigest, ERROR_CONFIG_DIGEST_MISMATCH);
    
    // TODO: assert_chain_not_forked, not sure how to do this check or if it's even necessary in TON
    
    // TODO: Maybe it's better to store the signers and transmitters as dictionaries so we don't have to iterate over them here?  
    val(pluginTransmitters, foundTransmitters) = self.transmitterOracles.get(ocrPluginType);
    assert(foundTransmitters && Iterator<address>.new(pluginTransmitters!).has(transmitter), ERROR_UNAUTHORIZED_TRANSMITTER);

    
    
    if (configInfo.isSignatureVerificationEnabled) {
    	var expectedSignatures = configInfo.bigF + 1;
	val signatures_length = Iterator<SignatureEd25519>.new(signatures).countBytes() / 64;
    	assert(signatures_length == expectedSignatures, ERROR_WRONG_NUMBER_OF_SIGNATURES);
    	var hashedReport = self.hashReport(report, reportContext);
    	var (pluginSigners, ok) = self.signerOracles.get(ocrPluginType);
    	assert(ok, ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE);
    	self.verifySignature(pluginSigners!, hashedReport, signatures);
    }
    val emitMsg = createExternalLogMessage({
	dest: createAddressNone(),
	body: OCR3Base_Transmitted {
	    ocrPluginType: ocrPluginType,
	    configDigest: reportContext.configDigest,
	    sequenceNumber: reportContext.sequenceBytes
	}
    });
    emitMsg.send(SEND_MODE_REGULAR);
}

fun OCR3Base.hashReport(self, report: cell, reportContext: ReportContext): int {
	var data = beginCell()
		.storeRef(report)
		.storeUint(reportContext.configDigest, 256)
		.storeUint(0, 192) // Padding to 256 bits
		.storeUint(reportContext.sequenceBytes, 64)
		.endCell();
	return data.hash();
}

fun OCR3Base.verifySignature(
	mutate self,
	signers: cell, // Iterator<uint256>
	hashedReport: uint256,
	signatures: cell // Iterator<SignatureEd25519>
) {
	var signaturesIt = Iterator<SignatureEd25519>.new(signatures); 
	var signersIt = Iterator<uint256>.new(signers);
	while (!signaturesIt.empty() || !signersIt.empty()) {
		val signature = signaturesIt.next();
		val signerKey = signersIt.next();
		assert(isSignatureValid(hashedReport,signature.toCell().beginParse(), signerKey), ERROR_INVALID_SIGNATURE );
	}
}

fun OCR3Base.assignSignerOracles(
	mutate self,
	ocrPluginType: uint16,
	signers: cell /*Iterator<uint256>*/
) {
	assert(!Iterator<uint256>.new(signers).hasDuplicates(), ERROR_REPEATED_SIGNERS);
	// TODO: We cannot do ed25519 public key validation on chain. For now we assume valid keys.
	self.signerOracles.set(
		ocrPluginType,
		signers
	);
}

fun OCR3Base.assignTransmitterOracles(
	mutate self,
	ocrPluginType: int,
	transmitters: cell // Iterator<address>
) {
	assert(!Iterator<address>.new(transmitters).hasDuplicates(), ERROR_REPEATED_TRANSMITTERS);
	self.transmitterOracles.set(
		ocrPluginType,
		transmitters
	);
}
