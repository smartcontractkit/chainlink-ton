package router

import "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"

var GetRMNOwner = ownable2step.GetOwner("rmn")
var GetRMNPendingOwner = ownable2step.GetPendingOwner("rmn")
