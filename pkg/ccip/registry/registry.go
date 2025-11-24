package registry

import (
	"context"
	"fmt"
	"reflect"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var (
	methodRegistry = make(map[reflect.Type]string)
	registryMu     sync.RWMutex
)

// RegisterMethod registers a method name for a given ResultUnmarshaler type.
func RegisterMethod(config tvm.ResultUnmarshaler, methodName string) {
	registryMu.Lock()
	defer registryMu.Unlock()

	t := reflect.TypeOf(config)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}

	if existing, exists := methodRegistry[t]; exists {
		if existing != methodName {
			panic(fmt.Sprintf("duplicate registration: type %s already mapped to %s, cannot remap to %s",
				t.String(), existing, methodName))
		}
		return
	}
	// Idempotent operation: re-registering the same type with the same method name is safe.
	// This allows multiple init() functions to call RegisterMethod() without conflicts,
	// as long as they register identical mappings. No-op on duplicate identical registrations.

	methodRegistry[t] = methodName
}

// FetchResult fetches and unmarshal the result of a registered method for the given contract address.
func FetchResult(
	ctx context.Context,
	client ton.APIClientWrapped,
	block *ton.BlockIDExt,
	contractAddr *address.Address,
	sourceStruct tvm.ResultUnmarshaler,
	opts []interface{},
) error {
	t := reflect.TypeOf(sourceStruct)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	methodName, ok := methodRegistry[t]
	if !ok {
		return fmt.Errorf("no method registered for type %s", t.Name())
	}

	return tvm.RunGetLoad(ctx, client, block, contractAddr, methodName, sourceStruct, opts)
}
