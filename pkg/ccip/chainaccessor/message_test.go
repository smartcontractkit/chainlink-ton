package chainaccessor

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

// TODO: validate behavior
func TestCCIPMessageSentEventToMessage(t *testing.T) {
	// Create test address
	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Create test token amount
	tokenAmount := onramp.TokenAmount{
		Amount: big.NewInt(1000),
		Token:  *testAddr,
	}

	// Create test extra args cell
	extraArgs, err := tlb.ToCell(onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(200000),
		AllowOutOfOrderExecution: true,
	})
	require.NoError(t, err)

	// Create test CCIP send message
	ccipSend := onramp.CCIPSend{
		QueryID:                  12345,
		DestinationChainSelector: 67890,
		Receiver:                 common.CrossChainAddress([]byte("test-receiver-address")),
		TokenAmounts:             common.SnakeData[onramp.TokenAmount]{tokenAmount},
		ExtraArgs:                extraArgs,
	}

	// Create test event
	event := &onramp.CCIPMessageSent{
		DestChainSelector: 67890,
		SequenceNumber:    42,
		Message:           ccipSend,
	}

	// Test conversion
	sourceChainSelector := ccipocr3.ChainSelector(12345)
	onRampAddress := ccipocr3.UnknownAddress([]byte("test-onramp-address"))
	txHash := "test-tx-hash"
	addressCodec := codec.AddressCodec{}

	msg, err := ToGenericCCIPMessage(
		event,
		sourceChainSelector,
		onRampAddress,
		txHash,
		addressCodec,
	)

	require.NoError(t, err)

	// Verify conversion
	require.Equal(t, sourceChainSelector, msg.Header.SourceChainSelector)
	require.Equal(t, ccipocr3.ChainSelector(67890), msg.Header.DestChainSelector)
	require.Equal(t, ccipocr3.SeqNum(42), msg.Header.SequenceNumber)
	require.Equal(t, onRampAddress, msg.Header.OnRamp)
	require.Equal(t, txHash, msg.Header.TxHash)
	require.Equal(t, []byte("test-receiver-address"), []byte(msg.Receiver))
	require.Len(t, msg.TokenAmounts, 1)
	require.Equal(t, big.NewInt(1000), msg.TokenAmounts[0].Amount.Int)
}
