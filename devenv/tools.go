package devenv

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/rs/zerolog"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
)

/*
This code should be generalized and moved to devenv library after we finish CCIPv1.7 environment!
*/

type TimeTracker struct {
	logger    zerolog.Logger
	start     time.Time
	last      time.Time
	intervals []interval
}

type interval struct {
	tag   string
	delta time.Duration
}

// NewTimeTracker is a simple utility function that tracks execution time.
func NewTimeTracker(l zerolog.Logger) *TimeTracker { //nolint:gocritic
	now := time.Now()
	return &TimeTracker{
		start:     now,
		last:      now,
		logger:    l,
		intervals: make([]interval, 0),
	}
}

func (t *TimeTracker) Record(tag string) {
	now := time.Now()
	delta := now.Sub(t.last)
	t.intervals = append(t.intervals, interval{
		tag:   tag,
		delta: delta,
	})
	t.last = now
}

func (t *TimeTracker) Print() {
	total := time.Since(t.start)
	t.logger.Debug().Msg("Time tracking results:")
	for _, i := range t.intervals {
		t.logger.Debug().
			Str("Tag", i.tag).
			Str("Duration", i.delta.String()).
			Send()
	}

	t.logger.Debug().
		Str("Duration", total.String()).
		Msg("Total environment boot up time")
}

/*
This code should be provided by CLDF framework exposing methods on EVM Client
*/

const (
	DefaultNativeTransferGasPrice = 21000
)

// ETHClient creates a basic Ethereum client using PRIVATE_KEY env var and tip/cap gas settings.
func ETHClient(wsURL string, gasSettings *GasSettings) (*ethclient.Client, *bind.TransactOpts, string, error) {
	client, err := ethclient.Dial(wsURL)
	if err != nil {
		return nil, nil, "", fmt.Errorf("could not connect to eth client: %w", err)
	}
	privateKey, err := crypto.HexToECDSA(getNetworkPrivateKey())
	if err != nil {
		return nil, nil, "", fmt.Errorf("could not parse private key: %w", err)
	}
	publicKey := privateKey.PublicKey
	address := crypto.PubkeyToAddress(publicKey).String()
	chainID, err := client.ChainID(context.Background())
	if err != nil {
		return nil, nil, "", fmt.Errorf("could not get chain ID: %w", err)
	}
	auth, err := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("could not create transactor: %w", err)
	}
	fc, tc, err := MultiplyEIP1559GasPrices(client, gasSettings.FeeCapMultiplier, gasSettings.TipCapMultiplier)
	if err != nil {
		return nil, nil, "", fmt.Errorf("could not get bumped gas price: %w", err)
	}
	auth.GasFeeCap = fc
	auth.GasTipCap = tc
	Plog.Info().
		Str("GasFeeCap", fc.String()).
		Str("GasTipCap", tc.String()).
		Msg("Default gas prices set")
	return client, auth, address, nil
}

// MultiplyEIP1559GasPrices returns bumped EIP1159 gas prices increased by multiplier.
func MultiplyEIP1559GasPrices(client *ethclient.Client, fcMult, tcMult int64) (*big.Int, *big.Int, error) {
	feeCap, err := client.SuggestGasPrice(context.Background())
	if err != nil {
		return nil, nil, err
	}
	tipCap, err := client.SuggestGasTipCap(context.Background())
	if err != nil {
		return nil, nil, err
	}

	return new(big.Int).Mul(feeCap, big.NewInt(fcMult)), new(big.Int).Mul(tipCap, big.NewInt(tcMult)), nil
}

// FundNodeEIP1559 funds CL node using RPC URL, recipient address and amount of funds to send (ETH).
// Uses EIP-1559 transaction type.
func FundNodeEIP1559(c *ethclient.Client, pkey, recipientAddress string, amountOfFundsInETH float64) error {
	amount := new(big.Float).Mul(big.NewFloat(amountOfFundsInETH), big.NewFloat(1e18))
	amountWei, _ := amount.Int(nil)
	Plog.Info().Str("Addr", recipientAddress).Str("Wei", amountWei.String()).Msg("Funding Node")

	chainID, err := c.NetworkID(context.Background())
	if err != nil {
		return err
	}
	privateKeyStr := strings.TrimPrefix(pkey, "0x")
	privateKey, err := crypto.HexToECDSA(privateKeyStr)
	if err != nil {
		return err
	}
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return errors.New("error casting public key to ECDSA")
	}
	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	nonce, err := c.PendingNonceAt(context.Background(), fromAddress)
	if err != nil {
		return err
	}
	feeCap, err := c.SuggestGasPrice(context.Background())
	if err != nil {
		return err
	}
	tipCap, err := c.SuggestGasTipCap(context.Background())
	if err != nil {
		return err
	}
	recipient := common.HexToAddress(recipientAddress)
	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     nonce,
		To:        &recipient,
		Value:     amountWei,
		Gas:       DefaultNativeTransferGasPrice,
		GasFeeCap: feeCap,
		GasTipCap: tipCap,
	})
	signedTx, err := types.SignTx(tx, types.NewLondonSigner(chainID), privateKey)
	if err != nil {
		return err
	}
	err = c.SendTransaction(context.Background(), signedTx)
	if err != nil {
		return err
	}
	if _, err := bind.WaitMined(context.Background(), c, signedTx); err != nil {
		return err
	}
	Plog.Info().Str("Wei", amountWei.String()).Msg("Funded with ETH")
	return nil
}

func GetCLDFAddressesPerSelector(in *Cfg) ([][]datastore.AddressRef, error) {
	addrs := make([][]datastore.AddressRef, 0)
	for _, addr := range in.OnChainSettings.Addresses {
		var refs []datastore.AddressRef
		if err := json.Unmarshal([]byte(addr), &refs); err != nil {
			return nil, fmt.Errorf("failed to unmarshal addresses: %w", err)
		}
		addrs = append(addrs, refs)
	}
	return addrs, nil
}
