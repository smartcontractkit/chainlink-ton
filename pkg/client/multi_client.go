package client

import "context"

var _ ReaderWriter = (*MultiClient)(nil)

// MultiClient - wrapper over multiple RPCs, underlying provider can be MultiNode or LazyLoader.
// Main purpose is to eliminate need for frequent error handling on selection of a client.
type MultiClient struct {
	getClient func(context.Context) (ReaderWriter, error)
}

func NewMultiClient(getClient func(context.Context) (ReaderWriter, error)) *MultiClient {
	return &MultiClient{
		getClient: getClient,
	}
}
