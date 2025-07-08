tolk 1.0

import "./op.tolk";
import "./error.tolk";
import "./params.tolk";

struct RBACTimelockAdmin {
    minDelay: int,
    timestampCount: int,
    timestamps: dict,
}

@inline
fun RBACTimelockAdmin.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    val op = msgBody.loadMessageOp();
    val queryID = msgBody.loadMessageQueryId();

    if (op == OP_UPDATE_DELAY) {
        val delay = msgBody.loadUint(32);
        msgBody.assertEnd();
        self.minDelay = delay;
        return -1;
    }

    if (op == OP_CLEAR_TIMESTAMPS) {
        val length = msgBody.loadUint(32);
        
        repeat(length) {
            val id = msgBody.loadUint(256);
            val (_, exists) = self.timestamps.uDictGet(256, id);
            if (exists) {
                self.timestamps.uDictDelete(256, id);
                self.timestampCount -= 1;
            }  
        }

        return -1;
    }

    return 0;
}
