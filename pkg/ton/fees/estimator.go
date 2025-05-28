package fees

import "context"

type Estimator interface {
	Start(context.Context) error
	Close() error
	// TODO(NONEVM-1460): add remaining interface functions required for fee calculation
}
