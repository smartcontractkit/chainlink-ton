package tracetracking

import (
	"fmt"
	"strings"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func (m *SentMessage) Dump() string {
	if m.InternalMsg != nil {
		return describeInternalMsg(m.InternalMsg, nil)
	}
	return "event?"
}

// Outputs a nicely indented string representation of the trace tree, with the exit codes, bouced tags and sender-receiver
func (m *ReceivedMessage) Dump() string {
	lines := dumpRec(m)
	return strings.Join(lines, "\n")
}

func dumpRec(m *ReceivedMessage) []string {
	output := make([]string, 1)
	if m.InternalMsg != nil {
		output[0] = describeInternalMsg(m.InternalMsg, &m.ExitCode)
	} else if m.ExternalMsg != nil {
		output[0] = describeExternalInMsg(m.ExternalMsg, &m.ExitCode)
	}
	for _, sentMessage := range m.OutgoingInternalReceivedMessages {
		for j, line := range dumpRec(sentMessage) {
			if j == 0 {
				output = append(output, "└ "+line)
			} else {
				output = append(output, "│ "+line)
			}
		}
	}
	for _, sentMessage := range m.OutgoingInternalSentMessages {
		output = append(output, "└ "+sentMessage.Dump())
	}
	var from string
	if m.InternalMsg != nil {
		from = m.InternalMsg.DstAddr.String()
	} else if m.ExternalMsg != nil {
		from = m.ExternalMsg.DstAddr.String()
	}
	for _, externalMessage := range m.OutgoingExternalMessages {
		output = append(output, "└ "+describeExternalOutMsg(from, externalMessage))
	}
	return output
}

func describeExternalInMsg(msg *tlb.ExternalMessageIn, exitCode *tvm.ExitCode) string {
	description := describeBody(msg.Body)
	description += ", " + describeExitCode(exitCode)
	return fmt.Sprintf("%s -- (%s) --> %s",
		msg.SrcAddr.String(), description, msg.DstAddr.String())
}

func describeExternalOutMsg(src string, msg OutgoingExternalMessages) string {
	description := describeEmitBody(msg.Body)
	return fmt.Sprintf("%s emit: (%s)", src, description)
}

func describeInternalMsg(msg *tlb.InternalMessage, exitCode *tvm.ExitCode) string {
	description := describeBody(msg.Body)
	description += ", amount: " + msg.Amount.String()
	if msg.Bounced {
		description += ", bounce"
	}
	description += ", " + describeExitCode(exitCode)
	srcAddr := msg.SrcAddr.String()
	if srcAddr == "NONE" {
		srcAddr = "external"
	}
	return fmt.Sprintf("%s -- (%s) --> %s",
		srcAddr, description, msg.DstAddr.String())
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

func describeBody(body *cell.Cell) string {
	slice := body.BeginParse()
	if slice.BitsLeft() == 0 {
		return "empty"
	}
	opcode, err := slice.LoadUInt(32)
	if err == nil {
		return fmt.Sprintf("opcode: 0x %x", opcode)
	}
	strSnake, err := body.BeginParse().LoadStringSnake()
	if err == nil {
		return fmt.Sprintf("stringSnake: %x", strSnake)
	}
	return "body: %s" + body.DumpBits()
}

func describeEmitBody(body *cell.Cell) string {
	slice := body.BeginParse()
	if slice.BitsLeft() == 0 {
		return "empty"
	}
	strSnake, err := body.BeginParse().LoadStringSnake()
	if err == nil {
		return fmt.Sprintf("stringSnake: %x", strSnake)
	}
	opcode, err := slice.LoadUInt(32)
	if err == nil {
		return fmt.Sprintf("opcode: %x", opcode)
	}
	return "body: %s" + body.DumpBits()
}
