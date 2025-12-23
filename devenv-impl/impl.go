package ccip_ton

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/rs/zerolog"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/clclient"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/simple_node_set"
	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences"
	testutils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

type CCIP16TON struct {
	e *deployment.Environment
}

func NewEmptyCCIP16TON() *CCIP16TON {
	return &CCIP16TON{}
}

// NewCCIP16TON creates new smart-contracts wrappers with utility functions for CCIP16TON implementation.
func NewCCIP16TON(ctx context.Context, e *deployment.Environment) (*CCIP16TON, error) {
	_ = zerolog.Ctx(ctx)
	out := NewEmptyCCIP16TON()
	out.e = e
	return out, nil
}

func (m *CCIP16TON) SetCLDF(e *deployment.Environment) {
	m.e = e
}

func (m *CCIP16TON) SendMessage(ctx context.Context, src, dest uint64, fields any, opts any) error {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Sending CCIP message")
	return nil
}

func (m *CCIP16TON) GetExpectedNextSequenceNumber(ctx context.Context, from, to uint64) (uint64, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Getting expected next sequence number")
	return uint64(0), nil
}

// WaitOneSentEventBySeqNo wait and fetch strictly one CCIPMessageSent event by selector and sequence number and selector.
func (m *CCIP16TON) WaitOneSentEventBySeqNo(ctx context.Context, from, to, seq uint64, timeout time.Duration) (any, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Waiting for one sent event for a sequence number")
	return "", nil
}

// WaitOneExecEventBySeqNo wait and fetch strictly one ExecutionStateChanged event by sequence number and selector.
func (m *CCIP16TON) WaitOneExecEventBySeqNo(ctx context.Context, from, to, seq uint64, timeout time.Duration) (any, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Waiting for one exec event for a sequence number")
	return "", nil
}

func (m *CCIP16TON) GetEOAReceiverAddress(ctx context.Context, chainSelector uint64) ([]byte, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Getting EOA receiver address")
	return nil, nil
}

func (m *CCIP16TON) GetTokenBalance(ctx context.Context, chainSelector uint64, address, tokenAddress []byte) (*big.Int, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Getting token balance")
	return big.NewInt(0), nil
}

func (m *CCIP16TON) ExposeMetrics(
	ctx context.Context,
	source, dest uint64,
	chainIDs []string,
	wsURLs []string,
) ([]string, *prometheus.Registry, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Exposing on-chain metrics")
	return []string{}, nil, nil
}

func (m *CCIP16TON) DeployLocalNetwork(ctx context.Context, bc *blockchain.Input) (*blockchain.Output, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Deploying TON networks")
	out, err := blockchain.NewBlockchainNetwork(bc)
	if err != nil {
		return nil, fmt.Errorf("failed to create blockchain network: %w", err)
	}
	return out, nil
}

func (m *CCIP16TON) ConfigureNodes(ctx context.Context, bc *blockchain.Input) (string, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Configuring CL nodes for TON")
	name := fmt.Sprintf("node-ton-%s", uuid.New().String()[0:5])
	return fmt.Sprintf(`
	[[TON]]
	ChainID = '%s'
	Enabled = true
	NetworkName = 'ton-localnet'

	[TON.TransactionManager]
	BroadcastChanSize = 100
	ConfirmPollInterval = '5s'
	SendRetryDelay = '3s'
	MaxSendRetryAttempts = 5
	TxExpiration = '5m'
	CleanupInterval = '1h'

	[TON.LogPoller]
	PollPeriod = '5s'
	PageSize = 100
	LogPollerStartingLookback = '1440m'
	BlockTime = '2500ms'
	BatchInsertSize = 3500

	[[TON.Nodes]]
	Name = '%s'
	URL = '%s'`,
		bc.ChainID,
		name,
		bc.Out.Nodes[0].InternalHTTPUrl,
	), nil
}

func (m *CCIP16TON) PreDeployContractsForSelector(ctx context.Context, env *deployment.Environment, cls []*simple_node_set.Input, selector uint64, ccipHomeSelector uint64, crAddr string) error {
	return nil
}

func (m *CCIP16TON) PostDeployContractsForSelector(ctx context.Context, env *deployment.Environment, cls []*simple_node_set.Input, selector uint64, ccipHomeSelector uint64, crAddr string) error {
	return nil
}

func (m *CCIP16TON) FundNodes(ctx context.Context, cls []*simple_node_set.Input, nodeKeyBundles map[string]clclient.NodeKeysBundle, bc *blockchain.Input, linkAmount, nativeAmount *big.Int) error {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Funding CL nodes with native and LINK")
	var keys []*address.Address
	var amounts []tlb.Coins
	for _, nk := range nodeKeyBundles {
		k, err := hex.DecodeString(nk.TXKey.Data.Attributes.PublicKey)
		if err != nil {
			return fmt.Errorf("failed to decode public key: %w", err)
		}
		addr := address.NewAddress(0, byte(0), k)
		keys = append(keys, addr)
		amounts = append(amounts, tlb.MustFromTON("1000"))
	}
	client, err := testutils.CreateClient(ctx, bc.Out.Nodes[0].ExternalHTTPUrl)
	if err != nil {
		return fmt.Errorf("failed to create TON client: %w", err)
	}
	return testutils.FundWalletsNoT(client, keys, amounts)
}
