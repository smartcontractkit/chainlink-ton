package e2e

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	"github.com/smartcontractkit/chainlink-testing-framework/wasp"
)

type TONGun struct {
	rpc   string
	addrs []datastore.AddressRef
}

func NewTONGun(rpc string, addrs []datastore.AddressRef) *TONGun {
	fmt.Printf("%-30s %-30s %-40s %-30s\n", "Selector", "Type", "Address", "Version")
	fmt.Println("--------------------------------------------------------------------------------------------------------------")
	for _, ref := range addrs {
		fmt.Printf("%-30d %-30s %-40s %-30s\n", ref.ChainSelector, ref.Type, ref.Address, ref.Version)
	}
	return &TONGun{
		rpc:   rpc,
		addrs: addrs,
	}
}

// Call implements example gun call, assertions on response bodies should be done here
func (m *TONGun) Call(_ *wasp.Generator) *wasp.Response {
	// TODO: call real client contract and publish messages
	return &wasp.Response{Data: ""}
}
