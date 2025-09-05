package devenv

import (
	"fmt"

	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-testing-framework/framework"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/jd"

	ns "github.com/smartcontractkit/chainlink-testing-framework/framework/components/simple_node_set"
)

type Cfg struct {
	TON         *TON                `toml:"ton" validate:"required"`
	JD          *jd.Input           `toml:"jd"`
	Blockchains []*blockchain.Input `toml:"blockchains"      validate:"required"`
	NodeSets    []*ns.Input         `toml:"nodesets"         validate:"required"`
}

// NewEnvironment creates a new datafeeds environment either locally in Docker or remotely in K8s.
func NewEnvironment() (*Cfg, error) {
	if err := framework.DefaultNetwork(nil); err != nil {
		return nil, err
	}
	in, err := Load[Cfg]()
	if err != nil {
		return nil, fmt.Errorf("failed to load configuration: %w", err)
	}
	track := NewTimeTracker(Plog)
	eg := &errgroup.Group{}
	for _, b := range in.Blockchains {
		eg.Go(func() error {
			_, err = blockchain.NewBlockchainNetwork(b)
			if err != nil {
				return fmt.Errorf("failed to create blockchain network: %w", err)
			}
			return nil
		})
	}
	// TODO: add roles to pull JD in your repository in Atlantis
	//eg.Go(func() error {
	//	_, err = jd.NewJD(in.JD)
	//	if err != nil {
	//		return fmt.Errorf("failed to create job distributor: %w", err)
	//	}
	//	return nil
	//})
	if err := eg.Wait(); err != nil {
		return nil, err
	}
	track.Record("[infra] deploying blockchains")
	if err := DefaultProductConfiguration(in, ConfigureNodesNetwork); err != nil {
		return nil, fmt.Errorf("failed to setup default CLDF orchestration: %w", err)
	}
	track.Record("[changeset] configured nodes network")
	_, err = ns.NewSharedDBNodeSet(in.NodeSets[0], nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create new shared db node set: %w", err)
	}
	track.Record("[infra] deployed CL nodes")
	if err := DefaultProductConfiguration(in, ConfigureProductContractsJobs); err != nil {
		return nil, fmt.Errorf("failed to setup default CLDF orchestration: %w", err)
	}
	track.Record("[changeset] deployed product contracts")
	track.Print()
	return in, Store[Cfg](in)
}
