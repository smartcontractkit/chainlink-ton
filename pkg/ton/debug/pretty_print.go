package debug

import (
	"encoding/hex"
	"errors"
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/ccipsendexecutor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/jetton/minter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/visualizations/tree"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
	tt "github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type DebuggerEnvironment struct {
	existingAddresses map[string]cldf.TypeAndVersion
	contracts         map[cldf.ContractType]lib.ContractDecoder
	writerFactory     func(DebuggerEnvironment) lib.DebuggerVisualization
}

func NewDebuggerTreeTrace(addresses map[string]cldf.TypeAndVersion) DebuggerEnvironment {
	return DebuggerEnvironment{
		existingAddresses: addresses,
		contracts:         defaultDecoders(),
		writerFactory: func(d DebuggerEnvironment) lib.DebuggerVisualization {
			writer := tree.NewTreeDiagram()
			for addr, typeAndVersion := range d.existingAddresses {
				writer.NewActor(addr, typeAndVersion.Type, "")
			}
			return writer
		},
	}
}

func NewDebuggerSequenceTrace(addresses map[string]cldf.TypeAndVersion, outputFmt sequence.OutputFmt) DebuggerEnvironment {
	return DebuggerEnvironment{
		existingAddresses: addresses,
		contracts:         defaultDecoders(),
		writerFactory: func(d DebuggerEnvironment) lib.DebuggerVisualization {
			writer := sequence.NewVisualization(outputFmt)
			for addr, typeAndVersion := range d.existingAddresses {
				writer.NewActor(addr, typeAndVersion.Type, "")
			}
			return writer
		},
	}
}

func defaultDecoders() map[cldf.ContractType]lib.ContractDecoder {
	t := make(map[cldf.ContractType]lib.ContractDecoder)
	registerDecoder(t, wallet.NewDecoder(t))
	registerDecoder(t, minter.NewDecoder(t))
	registerDecoder(t, router.NewDecoder(t))
	registerDecoder(t, onramp.NewDecoder(t))
	registerDecoder(t, feequoter.NewDecoder())
	registerDecoder(t, ccipsendexecutor.NewDecoder(t))
	return t
}

func registerDecoder(t map[cldf.ContractType]lib.ContractDecoder, decoder lib.ContractDecoder) {
	t[decoder.ContractType()] = decoder
}

func (d DebuggerEnvironment) RegisterDecoders(decoders ...lib.ContractDecoder) {
	for _, v := range decoders {
		d.contracts[v.ContractType()] = v
	}
}

func (d DebuggerEnvironment) NewInstance() debugger {
	return debugger{
		environment: d,
		Writer:      d.writerFactory(d),
	}
}

type debugger struct {
	environment DebuggerEnvironment
	Writer      lib.DebuggerVisualization
}

func (d DebuggerEnvironment) DumpSent(m *tt.SentMessage, verbose ...bool) string {
	instance := d.NewInstance()
	var verboseFlag bool
	if len(verbose) == 1 {
		verboseFlag = verbose[0]
	}
	return instance.dumpSent(m, verboseFlag)
}

func (d debugger) dumpSent(m *tt.SentMessage, verbose bool) string {
	info, err := d.environment.describeSentMessage(m, verbose)
	if err != nil {
		return fmt.Sprintf("error describing sent message: %v", err)
	}
	_ = d.Writer.NewSentMessage(m, info)
	return d.Writer.ToString()
}

// Outputs a nicely indented string representation of the trace tree, with the exit codes, bounced tags and sender-receiver
func (d DebuggerEnvironment) DumpReceived(m *tt.ReceivedMessage, verbose ...bool) string {
	instance := d.NewInstance()
	var verboseFlag bool
	if len(verbose) == 1 {
		verboseFlag = verbose[0]
	}
	val, err := instance.dumpReceived(m, verboseFlag)
	if err != nil {
		return fmt.Sprintf("error dumping received message: %v", err)
	}
	return val
}

func (d debugger) dumpReceived(m *tt.ReceivedMessage, verbose bool) (string, error) {
	err := d.dumpRec(m, verbose)
	if err != nil {
		return "", fmt.Errorf("error dumping received message: %w", err)
	}
	return d.Writer.ToString(), nil
}

func (d debugger) dumpRec(m *tt.ReceivedMessage, verbose bool) error {
	var subcontext lib.DebuggerVisualization
	info, err := d.environment.describeReceivedMessage(m, verbose)
	if err != nil {
		return fmt.Errorf("error describing received message: %w", err)
	}
	subcontext = d.Writer.NewReceivedMessage(m, *info) // TODO rm reference
	subD := d.withSubcontext(subcontext)
	for _, received := range m.OutgoingInternalReceivedMessages {
		err = subD.dumpRec(received, verbose)
		if err != nil {
			return fmt.Errorf("error describing received message: %w", err)
		}
	}
	for _, sentMessage := range m.OutgoingInternalSentMessages {
		msgInfo, err := subD.environment.describeSentMessage(sentMessage, verbose)
		if err != nil {
			return fmt.Errorf("error describing sent message: %w", err)
		}
		subD.Writer.NewSentMessage(sentMessage, msgInfo)
	}
	for _, externalMessage := range m.OutgoingExternalMessages {
		msgInfo, err := subD.environment.describeExternalOutMsg(externalMessage, verbose)
		if err != nil {
			return fmt.Errorf("error describing external message: %w", err)
		}
		subD.Writer.NewEvent(&externalMessage, *msgInfo) // TODO rm reference
	}
	return nil
}

func (d debugger) withSubcontext(subcontext lib.DebuggerVisualization) debugger {
	return debugger{
		environment: d.environment,
		Writer:      subcontext,
	}
}

func (d DebuggerEnvironment) describeReceivedMessage(m *tt.ReceivedMessage, verbose bool) (*lib.TxInfo, error) {
	var msgInfo *lib.MessageInfo
	var exitCodeDescription *string
	var err error
	for _, contract := range d.contracts {
		if msgInfo == nil {
			var t lib.MessageInfo
			if m.InternalMsg != nil {
				t, err = contract.InternalMessageInfo(m.InternalMsg.Body)
			} else if m.ExternalMsg != nil {
				t, err = contract.ExternalMessageInfo(m.ExternalMsg.Body)
			}
			if err == nil {
				msgInfo = &t
			} else if e := (&lib.UnknownMessageError{}); !errors.As(err, &e) {
				return nil, err
			}
		}
		if exitCodeDescription == nil {
			newVar, err := contract.ExitCodeInfo(m.ExitCode)
			if err == nil {
				exitCodeDescription = &newVar
			} else if e := &(lib.UnknownMessageError{}); !errors.As(err, &e) {
				return nil, err
			}
		}
	}
	if msgInfo == nil {
		if m.InternalMsg != nil {
			basicDescription := describeBody(m.InternalMsg.Body, verbose)
			msgInfo = &basicDescription
		} else {
			basicDescription := describeBody(m.ExternalMsg.Body, verbose)
			msgInfo = &basicDescription
		}
	}
	if exitCodeDescription == nil {
		newVar := describeExitCode(&m.ExitCode)
		exitCodeDescription = &newVar
	}
	return &lib.TxInfo{
		Msg:      *msgInfo,
		ExitCode: *exitCodeDescription,
	}, nil
}

func (d DebuggerEnvironment) describeSentMessage(m *tt.SentMessage, verbose bool) (lib.MessageInfo, error) {
	var info lib.MessageInfo
	var err error
	for _, contract := range d.contracts {
		info, err = contract.InternalMessageInfo(m.InternalMsg.Body)
		if err == nil {
			return info, nil
		}
		if e := &(lib.UnknownMessageError{}); !errors.As(err, &e) {
			return nil, err
		}
	}
	basicDescription := describeBody(m.InternalMsg.Body, verbose)
	return basicDescription, nil
}

func (d DebuggerEnvironment) describeExternalOutMsg(m tt.OutgoingExternalMessages, verbose bool) (*lib.MessageInfo, error) {
	var info lib.MessageInfo
	var err error
	for _, contract := range d.contracts {
		info, err = contract.EventInfo(m.DstAddr, m.Body)
		if err == nil {
			return &info, nil
		}
		if e := &(lib.UnknownMessageError{}); !errors.As(err, &e) {
			return nil, err
		}
	}
	simpleDescription := describeEmitBody(m.DstAddr, m.Body, verbose)
	return &simpleDescription, nil
}

func describeExitCode(exitCode *tvm.ExitCode) string {
	if exitCode == nil {
		return "pending"
	}
	if *exitCode == 0 {
		return "exit code 0"
	}
	return fmt.Sprintf("exit code: %d (%s)", *exitCode, exitCode.Describe())
}

type SimpleInfo struct {
	name string
	body string
}

func (i SimpleInfo) Name() string {
	return i.name
}

func (i SimpleInfo) Body() lib.BodyInfo {
	return SimpleBody(i.body)
}

type SimpleBody string

func (b SimpleBody) Compact() string {
	return string(b)
}

func (b SimpleBody) Describe() string {
	return string(b)
}

func NewSimpleInfo(name, body string) SimpleInfo {
	return SimpleInfo{
		name: name,
		body: body,
	}
}

func NewSimpleInfoUnknown(body string) SimpleInfo {
	return SimpleInfo{
		name: "unknown",
		body: body,
	}
}

func describeBody(body *cell.Cell, verbose bool) lib.MessageInfo {
	slice := body.BeginParse()
	if slice.BitsLeft() == 0 {
		return NewSimpleInfoUnknown("empty")
	}
	if !verbose {
		opcode, err := slice.LoadUInt(32)
		if err == nil {
			return NewSimpleInfoUnknown(fmt.Sprintf("opcode: 0x %x", opcode))
		}
	}
	strSnake, err := body.BeginParse().LoadStringSnake()
	if err == nil {
		return NewSimpleInfoUnknown(fmt.Sprintf("stringSnake: %x", strSnake))
	}
	opcode, err := slice.LoadUInt(32)
	if err != nil {
		return NewSimpleInfoUnknown(fmt.Sprintf("opcode: %x, body: %s", opcode, hex.EncodeToString(body.ToBOC())))
	}
	return NewSimpleInfoUnknown("body:" + hex.EncodeToString(body.ToBOC()))
}

func describeEmitBody(dstAddr *address.Address, body *cell.Cell, verbose bool) lib.MessageInfo {
	extOutLogBucket := event.NewExtOutLogBucket(dstAddr)
	var eventName string
	{
		eventTopic, err := extOutLogBucket.DecodeEventTopic()
		if err == nil {
			eventName = fmt.Sprintf("topic: 0x%x", eventTopic)
		} else {
			eventName = fmt.Sprintf("topic: unknown (%s)", dstAddr.String())
		}
	}

	slice := body.BeginParse()
	if slice.BitsLeft() == 0 {
		return NewSimpleInfo(eventName, "empty")
	}

	strSnake, err := body.BeginParse().LoadStringSnake()
	if err == nil {
		return NewSimpleInfo(eventName, fmt.Sprintf("stringSnake: %x", strSnake))
	}
	opcode, err := slice.LoadUInt(32)
	if err != nil {
		return NewSimpleInfo(eventName, "body:"+hex.EncodeToString(body.ToBOC()))
	}
	if !verbose {
		return NewSimpleInfo(eventName, fmt.Sprintf("opcode: %x", opcode))
	}
	return NewSimpleInfo(eventName, fmt.Sprintf("opcode: %x, body: %s", opcode, hex.EncodeToString(body.ToBOC())))
}
