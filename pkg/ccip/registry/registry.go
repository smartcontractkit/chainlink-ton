package registry

import (
	"context"
	"fmt"
	"reflect"
	"sync"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
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
	methodRegistry[t] = methodName
}

// FetchResult fetches and unmarshals the result of a registered method for the given contract address.
func FetchResult(
	ctx context.Context,
	client ton.APIClientWrapped,
	block *ton.BlockIDExt,
	contractAddr *address.Address,
	config tvm.ResultUnmarshaler,
	opts []interface{},
) error {
	registryMu.RLock()
	t := reflect.TypeOf(config)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	methodName, ok := methodRegistry[t]
	registryMu.RUnlock()

	if !ok {
		return fmt.Errorf("no method registered for type %s", t.Name())
	}

	var result *ton.ExecutionResult
	var err error
	if opts == nil {
		result, err = client.RunGetMethod(ctx, block, contractAddr, methodName)
	} else {
		result, err = client.RunGetMethod(ctx, block, contractAddr, methodName, opts...)
	}

	if err != nil {
		return err
	}

	return tvm.LoadFromResult(config, result)
}
