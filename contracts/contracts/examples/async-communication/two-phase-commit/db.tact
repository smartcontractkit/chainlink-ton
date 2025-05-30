import "./counter.tact";

/// DB contract
message(1) BeginTransaction {
    queryId: Int as uint64;
}

message(2) SetValue {
    queryId: Int as uint64;
    address: Address;
    newValue: Int as uint32;
}

message(3) Ack {
    queryId: Int as uint64;
}

message(4) Nack {
    queryId: Int as uint64;
}

message(5) Commit {
    queryId: Int as uint64;
}

struct AddressSet {
    items: map<Int as uint32, Address>;
    count: Int as uint32;
}

fun emptyAddressSet(): AddressSet {
    return AddressSet { items: emptyMap(), count: 0 };
}

extends mutates fun add(self: AddressSet, item: Address) {
    foreach (_, storedItem in self.items) {
        if (storedItem == item) {
            emit("Item already exists".asComment());
            return;
        }
    }
    self.items.set(self.count, item);
    self.count += 1;
}

extends mutates fun remove(self: AddressSet, item: Address) {
    foreach (i, storedItem in self.items) {
        if (storedItem == item) {
            let last = self.items.get(self.count - 1)!!;
            self.items.set(i, last);
            let _ = self.items.del(self.count - 1);
            self.count -= 1;
            return;
        }
    }
}

contract DB {
    id: Int as uint32;
    transactionOngoing: Bool;
    transactionId: Int as uint64;
    pendingAcks: map<Int as uint64, Address>;
    // confirmedAcks: AddressSet;
    confirmedAcks: map<Int as uint64, Address>;
    transactionCommitRequested: Bool;

    init(id: Int as uint32) {
        self.id = id;
        self.transactionOngoing = false;
        self.transactionId = 0;
        self.pendingAcks = emptyMap();
        // self.confirmedAcks = emptyAddressSet();
        self.confirmedAcks = emptyMap();
        self.transactionCommitRequested = false;
    }

    receive(msg: BeginTransaction) {
        emit("BeginTransaction".asComment());
        if (self.transactionOngoing) {
            emit("Transaction already in progress".asComment());
            throw(500);
        }
        self.transactionOngoing = true;
        self.transactionId = msg.queryId;
    }

    receive(msg: SetValue) {
        emit("SetValue".asComment());
        if (!self.transactionOngoing) {
            emit("No transaction in progress".asComment());
            throw(501);
        }
        message(MessageParameters {
            to: msg.address,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: PrepareSetValue {
                queryId: msg.queryId,
                transactionId: self.transactionId,
                newValue: msg.newValue,
            }.toCell(),
        });
        self.pendingAcks.set(msg.queryId, msg.address);
    }

    receive(msg: Ack) {
        emit("Ack".asComment());
        if (!self.transactionOngoing) {
            emit("No transaction in progress".asComment());
            throw(502);
        }
        if (self.pendingAcks.exists(msg.queryId)) {
            emit(beginComment().concat("Removing pending ack for queryId: ").concat(msg.queryId.toString()).toCell());
            let address = self.pendingAcks.get(msg.queryId)!!;
            let _ = self.pendingAcks.del(msg.queryId);
            self.confirmedAcks.set(msg.queryId, address);
        } else {
            emit("Ack not found".asComment());
            throw(503);
        }
        self.tryCommit();
    }

    receive(msg: Nack) {
        emit("Nack not implemented".asComment());
        throw(504);
        // if (!self.transactionOngoing) {
        //     emit("No transaction in progress".asComment());
        //     throw(504);
        // }
        // if (self.pendingAcks.has(msg.queryId)) {
        //     nacker = self.pendingAcks.del(msg.queryId);
        // }
    }

    receive(msg: Commit) {
        emit("Commit".asComment());
        if (!self.transactionOngoing) {
            emit("No transaction in progress".asComment());
            throw(505);
        }
        self.transactionCommitRequested = true;
        self.tryCommit();
    }

    fun tryCommit() {
        if (!self.transactionCommitRequested) {
            emit("Transaction is not committed".asComment());
            return;
        }
        if (self.pendingAcks.isEmpty()) {
            emit("All acks received".asComment());
            foreach (queryId, addr in self.confirmedAcks) {
                emit(beginComment().concat("Sending commit for query_id:").concat(queryId.toString()).toCell());
                message(MessageParameters {
                    to: addr,
                    value: 250000000,
                    mode: SendPayFwdFeesSeparately,
                    body: CounterCommit {
                        transactionId: self.transactionId,
                    }.toCell(),
                });
            }
            // self.confirmedAcks = emptyAddressSet();
            self.confirmedAcks = emptyMap();
            self.transactionOngoing = false;
            self.transactionId = 0;
            return;
        }
        let c = beginComment().concat("Pending acks: \n");
        foreach (queryId, addr in self.pendingAcks) {
            c.append("- ");
            c.append(queryId.toString());
            c.append("\n");
        }
        emit(c.toCell());
        emit("Not all acks not received".asComment());
    }
}
