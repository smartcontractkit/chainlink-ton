import "./db";

/// Counter contract
message(1) PrepareSetValue {
    queryId: Int as uint64;
    transactionId: Int as uint64;
    newValue: Int as uint32;
}

message(2) CounterCommit {
    transactionId: Int as uint64;
}

// This message is used to acknowledge the prepare request manually to use in tests.
// The normal protocol involves autoAck on true.
message(3) SendAck {}

contract Counter {
    id: Int as uint32;
    value: Int as uint32;
    autoAck: Bool;
    awaitingCommit: Bool;
    transactionId: Int as uint64;
    preparedValue: Int as uint32;
    queryIdToAck: Int as uint64;
    addressToAck: Address;

    init(
        id: Int as uint32,
        value: Int as uint32,
        autoAck: Bool,
    ) {
        self.id = id;
        self.value = value;
        self.autoAck = autoAck;
        self.awaitingCommit = false;
        self.transactionId = 0;
        self.preparedValue = 0;
        self.queryIdToAck = 0;
        self.addressToAck = newAddress(0, 0);
    }

    receive(msg: PrepareSetValue) {
        emit("PrepareSetValue".asComment());
        if (self.awaitingCommit) {
            throw(600);
        }
        emit(beginComment().concat("TransactionId: ").concat(msg.transactionId.toString()).toCell());
        emit(beginComment().concat("NewValue: ").concat(msg.newValue.toString()).toCell());
        self.transactionId = msg.transactionId;
        self.preparedValue = msg.newValue;
        if (self.autoAck) {
            emit("Auto-acknowledging".asComment());
            self.reply(Ack { queryId: msg.queryId }.toCell());
            self.awaitingCommit = true;
            return;
        }
        emit("Manual acknowledgment required".asComment());
        self.queryIdToAck = msg.queryId;
        self.addressToAck = sender();
    }

    receive(msg: CounterCommit) {
        emit("CounterCommit".asComment());
        if (!self.awaitingCommit) {
            throw(601);
        }
        if (msg.transactionId != self.transactionId) {
            throw(602);
        }
        emit(beginComment().concat("self.preparedValue: ").concat(self.preparedValue.toString()).toCell());
        self.value = self.preparedValue;
        emit(beginComment().concat("self.value: ").concat(self.value.toString()).toCell());

        self.awaitingCommit = false;
        self.transactionId = 0;
        self.preparedValue = 0;
    }

    receive(msg: SendAck) {
        emit("SendAck".asComment());
        if (self.awaitingCommit) {
            emit("Already awaiting commit".asComment());
            throw(603);
        }
        emit("Sending Ack".asComment());
        message(MessageParameters {
            to: self.addressToAck,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: Ack { queryId: self.queryIdToAck }.toCell(),
        });
        self.awaitingCommit = true;
        self.queryIdToAck = 0;
        self.addressToAck = newAddress(0, 0);
    }

    get fun value(): Int {
        return self.value;
    }

    get fun id(): Int {
        return self.id;
    }
}
