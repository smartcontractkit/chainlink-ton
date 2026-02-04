// SPDX-License-Identifier: MIT
// Small contract that bounces all incoming messages to test onBouncedMessage handler

fun onInternalMessage(in: InMessage) {
    throw 0xFFFF;
}