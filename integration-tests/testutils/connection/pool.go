package connection

import (
	"reflect"
	"testing"
	"unsafe"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
)

// UnwrapToConnectionPool uses reflection to traverse through unexported LiteClient wrapper
// types (retryClient, waiterClient, timeoutClient) in tonutils-go until it finds the
// underlying *liteclient.ConnectionPool.
func UnwrapToConnectionPool(t *testing.T, client ton.LiteClient) *liteclient.ConnectionPool {
	t.Helper()
	v := reflect.ValueOf(client)
	poolPtrType := reflect.TypeOf((*liteclient.ConnectionPool)(nil))
	for {
		for v.Kind() == reflect.Interface {
			v = v.Elem()
		}
		if v.Type() == poolPtrType {
			return (*liteclient.ConnectionPool)(v.UnsafePointer())
		}
		for v.Kind() == reflect.Ptr {
			v = v.Elem()
		}
		f := v.FieldByName("original")
		if !f.IsValid() {
			break
		}
		// Use unsafe to bypass the unexported field restriction so subsequent
		// reflect operations (Elem, Type, etc.) don't panic.
		v = reflect.NewAt(f.Type(), unsafe.Pointer(f.UnsafeAddr())).Elem()
	}
	require.Fail(t, "failed to unwrap LiteClient to *liteclient.ConnectionPool", "final type: %s", v.Type())
	return nil
}
