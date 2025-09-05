package e2e

import (
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	de "github.com/smartcontractkit/chainlink-ton/devenv"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-testing-framework/framework/chaos"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/rpc"
	"github.com/smartcontractkit/chainlink-testing-framework/wasp"
)

type ChaosTestCase struct {
	name     string
	run      func() error
	validate func() error
}

type GasTestCase struct {
	name             string
	chainURL         string
	increase         *big.Int
	waitBetweenTests time.Duration
	gasFunc          func(t *testing.T, r *rpc.RPCClient, blockPace time.Duration)
	validate         func() error
}

func gasControlFunc(t *testing.T, r *rpc.RPCClient, blockPace time.Duration) {
	startGasPrice := big.NewInt(2e9)
	// ramp
	for i := 0; i < 10; i++ {
		err := r.PrintBlockBaseFee()
		require.NoError(t, err)
		err = r.AnvilSetNextBlockBaseFeePerGas(startGasPrice)
		require.NoError(t, err)
		startGasPrice = startGasPrice.Add(startGasPrice, big.NewInt(1e9))
		time.Sleep(blockPace)
	}
	// hold
	for i := 0; i < 10; i++ {
		err := r.PrintBlockBaseFee()
		require.NoError(t, err)
		time.Sleep(blockPace)
		err = r.AnvilSetNextBlockBaseFeePerGas(startGasPrice)
		require.NoError(t, err)
	}
	// release
	for i := 0; i < 10; i++ {
		err := r.PrintBlockBaseFee()
		require.NoError(t, err)
		time.Sleep(blockPace)
	}
}

func createLoadProfile(rps int64, testDuration time.Duration, evmRPCURL, tonRPCURL string, evmBlockchainClient *ethclient.Client, evmAuth *bind.TransactOpts, addrs [][]datastore.AddressRef) *wasp.Profile {
	// TODO: CLDF is not implemented yet, make default environment deploy and return addresses
	addrs = make([][]datastore.AddressRef, len(addrs))
	addrs = append(addrs, []datastore.AddressRef{}, []datastore.AddressRef{})
	return wasp.NewProfile().
		Add(wasp.NewGenerator(&wasp.Config{
			LoadType: wasp.RPS,
			GenName:  "tx-src-chain-load",
			Schedule: wasp.Combine(
				wasp.Plain(rps, testDuration),
			),
			Gun: NewEVMGun(evmRPCURL, evmBlockchainClient, evmAuth, addrs[0]),
			Labels: map[string]string{
				"go_test_name": "load-clean-src",
				"branch":       "test",
				"commit":       "test",
			},
			LokiConfig: wasp.NewEnvLokiConfig(),
		})).
		Add(wasp.NewGenerator(&wasp.Config{
			LoadType: wasp.RPS,
			GenName:  "tx-dst-chain-load",
			Schedule: wasp.Combine(
				wasp.Plain(rps, testDuration),
			),
			Gun: NewTONGun(tonRPCURL, addrs[1]),
			Labels: map[string]string{
				"go_test_name": "load-clean-src",
				"branch":       "test",
				"commit":       "test",
			},
			LokiConfig: wasp.NewEnvLokiConfig(),
		}))
}

func TestE2ELoad(t *testing.T) {
	in, err := de.LoadOutput[de.Cfg]("../../env-out.toml")
	require.NoError(t, err)

	evmBlockchainClient, srcAuth, _, err := de.ETHClient(in.Blockchains[0].Out.Nodes[0].ExternalWSUrl, in.OnChainSettings.GasSettings)
	require.NoError(t, err)
	// TODO: add TON Client here
	evmRPCURL := in.Blockchains[0].Out.Nodes[0].ExternalHTTPUrl
	addrs, err := de.GetCLDFAddressesPerSelector(in)
	require.NoError(t, err)

	t.Run("clean", func(t *testing.T) {
		// just a clean load test to measure performance
		_, err = createLoadProfile(1, 5*time.Minute, evmRPCURL, "", evmBlockchainClient, srcAuth, addrs).Run(true)
		require.NoError(t, err)
	})

	t.Run("rpc latency", func(t *testing.T) {
		// 400ms latency for any RPC node
		_, err = chaos.ExecPumba("netem --tc-image=ghcr.io/alexei-led/pumba-debian-nettools --duration=5m delay --time=400 re2:blockchain-node-.*", 0*time.Second)
		require.NoError(t, err)
		_, err = chaos.ExecPumba("netem --tc-image=ghcr.io/alexei-led/pumba-debian-nettools --duration=5m delay --time=400 re2:ton-genesis-.*", 0*time.Second)
		require.NoError(t, err)
		_, err = createLoadProfile(1, 5*time.Minute, evmRPCURL, "", evmBlockchainClient, srcAuth, addrs).Run(true)
		require.NoError(t, err)
	})

	t.Run("gas", func(t *testing.T) {
		// test slow and fast gas spikes on both chains
		p := createLoadProfile(1, 5*time.Minute, evmRPCURL, "", evmBlockchainClient, srcAuth, addrs)
		_, err = p.Run(false)
		require.NoError(t, err)

		waitBetweenTests := 30 * time.Second

		tcs := []GasTestCase{
			{
				name:             "Slow spike src",
				chainURL:         evmRPCURL,
				waitBetweenTests: waitBetweenTests,
				increase:         big.NewInt(1e9),
				gasFunc:          gasControlFunc,
				validate:         func() error { return nil },
			},
			{
				name:             "Fast spike src",
				chainURL:         evmRPCURL,
				waitBetweenTests: waitBetweenTests,
				increase:         big.NewInt(5e9),
				gasFunc:          gasControlFunc,
				validate:         func() error { return nil },
			},
			// Control TON RPC gas if possible?
		}
		for _, tc := range tcs {
			t.Run(tc.name, func(t *testing.T) {
				t.Log(tc.name)
				r := rpc.New(tc.chainURL, nil)
				tc.gasFunc(t, r, 1*time.Second)
				err = tc.validate()
				require.NoError(t, err)
				time.Sleep(tc.waitBetweenTests)
			})
		}
		p.Wait()
	})

	t.Run("reorgs", func(t *testing.T) {
		// this requires environment with env.toml,env-geth.toml config
		p := createLoadProfile(1, 5*time.Minute, evmRPCURL, "", evmBlockchainClient, srcAuth, addrs)
		_, err = p.Run(false)
		require.NoError(t, err)
		tcs := []struct {
			name       string
			wait       time.Duration
			chainURL   string
			reorgDepth int
			validate   func() error
		}{
			{
				name:       "Reorg src with depth: 1",
				wait:       30 * time.Second,
				chainURL:   evmRPCURL,
				reorgDepth: 1,
				validate: func() error {
					// add clients and validate
					return nil
				},
			},
			{
				name:       "Reorg src with depth: 5",
				wait:       30 * time.Second,
				chainURL:   evmRPCURL,
				reorgDepth: 5,
				validate: func() error {
					return nil
				},
			},
			// Reorg local TON RPC if possible?
		}

		for _, tc := range tcs {
			t.Run(tc.name, func(t *testing.T) {
				r := rpc.New(tc.chainURL, nil)
				err := r.GethSetHead(tc.reorgDepth)
				require.NoError(t, err)
				time.Sleep(tc.wait)
				err = tc.validate()
				require.NoError(t, err)
			})
		}
		p.Wait()
	})

	t.Run("services_chaos", func(t *testing.T) {
		tcs := []ChaosTestCase{
			{
				name: "Reboot a single node",
				run: func() error {
					_, err = chaos.ExecPumba(
						"stop --duration=20s --restart re2:don-node1",
						30*time.Second,
					)
					return nil
				},
				validate: func() error { return nil },
			},
			{
				name: "Reboot two nodes",
				run: func() error {
					_, err = chaos.ExecPumba(
						"stop --duration=20s --restart re2:don-node1",
						0*time.Second,
					)
					_, err = chaos.ExecPumba(
						"stop --duration=20s --restart re2:don-node2",
						30*time.Second,
					)
					return err
				},
				validate: func() error { return nil },
			},
			{
				name: "One slow CL node",
				run: func() error {
					_, err = chaos.ExecPumba(
						"netem --tc-image=ghcr.io/alexei-led/pumba-debian-nettools --duration=1m delay --time=1000 re2:don-node1",
						30*time.Second,
					)
					return err
				},
				validate: func() error { return nil },
			},
		}
		p := createLoadProfile(1, 5*time.Minute, evmRPCURL, "", evmBlockchainClient, srcAuth, addrs)
		_, err = p.Run(false)
		require.NoError(t, err)

		for _, tc := range tcs {
			t.Run(tc.name, func(t *testing.T) {
				t.Log(tc.name)
				err = tc.run()
				require.NoError(t, err)
				err = tc.validate()
				require.NoError(t, err)
			})
		}
		p.Wait()
	})
}
