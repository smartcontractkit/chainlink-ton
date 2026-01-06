package router

import "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"

var GetRMNOwner = ownable2step.MakeGetOwner("rmn")
var GetRMNPendingOwner = ownable2step.MakeGetPendingOwner("rmn")
