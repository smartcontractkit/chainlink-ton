package config

import (
	"errors"
	"slices"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/config"

	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

// Name of the chain family (e.g., "ethereum", "solana", "ton")
const ChainFamilyName = "ton"

var DefaultConfigSet = Chain{
	TransactionManager: &txm.DefaultConfigSet,
	ClientTTL:          10 * time.Minute,
}

type Chain struct {
	TransactionManager *txm.Config
	ClientTTL          time.Duration
}

type Node struct {
	Name *string
	URL  *config.URL
}

func (n *Node) ValidateConfig() (err error) {
	if n.Name == nil {
		err = errors.Join(err, config.ErrMissing{Name: "Name", Msg: "required for all nodes"})
	} else if *n.Name == "" {
		err = errors.Join(err, config.ErrEmpty{Name: "Name", Msg: "required for all nodes"})
	}
	if n.URL == nil {
		err = errors.Join(err, config.ErrMissing{Name: "URL", Msg: "required for all nodes"})
	} else if n.URL.String() == "" {
		err = errors.Join(err, config.ErrEmpty{Name: "URL", Msg: "required for all nodes"})
	}
	return err
}

type Nodes []*Node

func (ns *Nodes) SetFrom(fs *Nodes) {
	for _, f := range *fs {
		if f.Name == nil {
			*ns = append(*ns, f)
		} else if i := slices.IndexFunc(*ns, func(n *Node) bool {
			return n.Name != nil && *n.Name == *f.Name
		}); i == -1 {
			*ns = append(*ns, f)
		} else {
			setFromNode((*ns)[i], f)
		}
	}
}

func setFromNode(n, f *Node) {
	if f.Name != nil {
		n.Name = f.Name
	}
	if f.URL != nil {
		n.URL = f.URL
	}
}
