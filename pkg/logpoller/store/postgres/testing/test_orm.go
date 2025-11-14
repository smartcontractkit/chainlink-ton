package testing

import (
	"context"
	"encoding/binary"

	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

type TestDSORM struct {
	ds sqlutil.DataSource
}

// NewTestORM creates a test DSORM which contains method only used by tests
func NewTestORM(ds sqlutil.DataSource) *TestDSORM {
	return &TestDSORM{
		ds: ds,
	}
}

// HasFilterByEventName checks if a filter exists for the provided event name
// It converts the event name to CRC32 signature internally
func (o *TestDSORM) HasFilterByEventName(ctx context.Context, chainID string, eventName string, addressBytes []byte) (bool, error) {
	// Convert event name to CRC32 signature
	eventSigUint32 := hash.CRC32(eventName)
	eventSig := make([]byte, 4)
	binary.BigEndian.PutUint32(eventSig, eventSigUint32)

	query := `
		SELECT COUNT(1) FROM ton.log_poller_filters 
			WHERE chain_id = $1 AND event_sig = $2 AND address = $3 AND is_deleted = false LIMIT 1`

	var exists int
	if err := o.ds.GetContext(ctx, &exists, query, chainID, eventSig, addressBytes); err != nil {
		return false, err
	}

	return exists != 0, nil
}
