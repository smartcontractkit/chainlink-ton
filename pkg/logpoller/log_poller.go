package logpoller

import "context"

type LogPoller interface {
	Start(context.Context) error
	Ready() error
	Close() error
	// TODO(NONEVM-1460): add remaining functions
}
