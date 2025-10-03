package feequoter

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type decoder struct {
}

func NewDecoder() lib.ContractDecoder {
	return &decoder{}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.chainlink.ton.ccip.FeeQuoter")
}

// EventInfo implements lib.ContractDecoder.
func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// ExternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	r := msg.BeginParse()
	if r.BitsLeft() == 0 {
		return nil, &lib.UnknownMessageError{}
	}
	opCode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, err
	}
	switch opCode {
	case feequoter.OpcodeUpdatePrices:
		updatePrices, err := feequoter.Builder.Messages.In.UpdatePrices.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("UpdatePrices", updatePrices)
	case feequoter.OpcodeUpdateFeeTokens:
		updateFeeTokens, err := feequoter.Builder.Messages.In.UpdateFeeTokens.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("UpdateFeeTokens", updateFeeTokens)
	case feequoter.OpcodeUpdateTokenTransferFeeConfigs:
		updateConfigs, err := feequoter.Builder.Messages.In.UpdateTokenTransferFeeConfigs.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("UpdateTokenTransferFeeConfigs", updateConfigs)
	case feequoter.OpcodeUpdateDestChainConfigs:
		updateDestConfigs, err := feequoter.Builder.Messages.In.UpdateDestChainConfigs.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("UpdateDestChainConfigs", updateDestConfigs)
	case feequoter.OpcodeFeeQuoterGetValidatedFee:
		getValidatedFee, err := feequoter.Builder.Messages.In.GetValidatedFee.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("GetValidatedFee", getValidatedFee)
	case feequoter.OpcodeFeeQuoterMessageValidated:
		messageValidated, err := feequoter.Builder.Messages.Out.MessageValidated.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("MessageValidated", messageValidated)
	}
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	switch exitCode {
	case feequoter.ErrorUnsupportedChainFamilySelector:
		return "ErrorUnsupportedChainFamilySelector", nil
	case feequoter.ErrorGasLimitTooHigh:
		return "ErrorGasLimitTooHigh", nil
	case feequoter.ExtraArgOutOfOrderExecutionMustBeTrue:
		return "ExtraArgOutOfOrderExecutionMustBeTrue", nil
	case feequoter.ErrorInvalidExtraArgsData:
		return "ErrorInvalidExtraArgsData", nil
	case feequoter.ErrorUnsupportedNumberOfTokens:
		return "ErrorUnsupportedNumberOfTokens", nil
	case feequoter.ErrorInvalidSuiReceiverAddress:
		return "ErrorInvalidSuiReceiverAddress", nil
	case feequoter.ErrorInvalidTokenReceiver:
		return "ErrorInvalidTokenReceiver", nil
	case feequoter.ErrorTooManySuiExtraArgsReceiverObjectIDs:
		return "ErrorTooManySuiExtraArgsReceiverObjectIds", nil
	case feequoter.ErrorMsgDataTooLarge:
		return "ErrorMsgDataTooLarge", nil
	default:
		return "", &lib.UnknownMessageError{}
	}
}
