import "./requester";

contract Bouncer() {
    receive() {
        dump("Bouncer contract initialized");
    }

    receive(msg: Request) {
        try {
            process(msg.value);
            self.reply(Success {
                queryId: msg.queryId,
            }.toCell());
        } catch (e) {
            self.reply(Bounce {
                queryId: msg.queryId,
                exitCode: e,
            }.toCell());
        }
    }
}

inline fun process(value: Int) {
    if (value == 1) {
        return;
    }
    throw(value);
}
