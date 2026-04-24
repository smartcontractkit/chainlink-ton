package test_logger

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

// This logger prevents testing framework from printing the path and line number inside the logger package, which is not useful and clutters the logs. Instead, it will print the caller of the logger (i.e. the line in this test file where the log was called).
func New() logger.Logger {
	cfg := zap.NewDevelopmentEncoderConfig()
	cfg.EncodeTime = zapcore.TimeEncoderOfLayout("15:04:05.000000000")
	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(cfg),
		zapcore.Lock(os.Stderr),
		zapcore.DebugLevel,
	)
	return logger.WithOptions(logger.NewWithCores(core), zap.AddCaller())
}
