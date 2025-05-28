package chainwriter

import (
	"context"
	"math/big"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/types"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/client"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/fees"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/txm"
)

const ServiceName = "TONChainWriter"

type TONChainWriterService struct {
	lggr   logger.Logger
	client client.MultiClient
	txm    txm.TxManager
	fe     fees.Estimator
	config ChainWriterConfig
	// TODO(NONEVM-1460): implement remaining members (codec and encoder)

	services.StateMachine
}

var (
	_ services.Service     = &TONChainWriterService{}
	_ types.ContractWriter = &TONChainWriterService{}
)

// nolint // ignoring naming suggestion
type ChainWriterConfig struct {
	Programs map[string]ProgramConfig `json:"programs"`
}

type ProgramConfig struct {
	Methods map[string]MethodConfig `json:"methods"`
	IDL     string                  `json:"idl"`
}

type MethodConfig struct {
	FromAddress string `json:"fromAddress"`
	// TODO(NONEVM-1460): implement remaining members
}

func NewTONChainWriterService(logger logger.Logger, client client.MultiClient, txm txm.TxManager, fe fees.Estimator, config ChainWriterConfig) (*TONChainWriterService, error) {
	cws := TONChainWriterService{
		lggr:   logger,
		client: client,
		txm:    txm,
		fe:     fe,
		config: config,
	}

	cws.lggr.Info("TONChainWriterService initialized")
	return &cws, nil
}

func (s *TONChainWriterService) Start(_ context.Context) error {
	return s.StartOnce(ServiceName, func() error {
		return nil
	})
}

func (s *TONChainWriterService) Close() error {
	return s.StopOnce(ServiceName, func() error {
		return nil
	})
}

func (s *TONChainWriterService) HealthReport() map[string]error {
	return map[string]error{s.Name(): s.Healthy()}
}

func (s *TONChainWriterService) Name() string {
	return s.lggr.Name()
}

func (s *TONChainWriterService) Ready() error {
	return s.StateMachine.Ready()
}

func (s *TONChainWriterService) SubmitTransaction(ctx context.Context, contractName, method string, args any, transactionID types.IdempotencyKey, toAddress string, meta *types.TxMeta, value *big.Int) error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (s *TONChainWriterService) GetTransactionStatus(ctx context.Context, transactionID types.IdempotencyKey) (types.TransactionStatus, error) {
	// TODO(NONEVM-1460): implement
	return types.Finalized, nil
}

func (s *TONChainWriterService) GetFeeComponents(ctx context.Context) (*types.ChainFeeComponents, error) {
	// TODO(NONEVM-1460): implement
	// Dummy fee components
	feeComponents := &types.ChainFeeComponents{
		ExecutionFee:        big.NewInt(1000),
		DataAvailabilityFee: big.NewInt(0),
	}
	return feeComponents, nil
}

func (s *TONChainWriterService) GetEstimateFee(ctx context.Context, contract, method string, args any, toAddress string, meta *types.TxMeta, val *big.Int) (types.EstimateFee, error) {
	// TODO(NONEVM-1460): implement
	// Dummy estimate
	estimate := types.EstimateFee{
		Fee:      big.NewInt(2),
		Decimals: 18,
	}
	return estimate, nil
}
