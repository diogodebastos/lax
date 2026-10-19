// The Mac about to sleep, and awake again (lib/power.mjs): prints "sleep" or "wake", a line each. Before it lets the Mac
// sleep it waits a second, so Lax can tell the relay first. Built into ~/.lax/bin the first time.
import Foundation
import IOKit.pwr_mgt

var root: io_connect_t = 0
var port: IONotificationPortRef?
var notifier: io_object_t = 0
setvbuf(stdout, nil, _IOLBF, 0)
// IOMessage.h's macros don't reach Swift: iokit_common_msg(0x270), (0x280), (0x300).
let canSleep: UInt32 = 0xe0000270, willSleep: UInt32 = 0xe0000280, poweredOn: UInt32 = 0xe0000300

root = IORegisterForSystemPower(nil, &port, { _, _, type, arg in
  switch type {
  case canSleep: IOAllowPowerChange(root, Int(bitPattern: arg))
  case willSleep:
    print("sleep"); Thread.sleep(forTimeInterval: 1); IOAllowPowerChange(root, Int(bitPattern: arg))
  case poweredOn: print("wake")
  default: break
  }
}, &notifier)
guard root != 0, let port else { FileHandle.standardError.write("no power notifications\n".data(using: .utf8)!); exit(1) }
CFRunLoopAddSource(CFRunLoopGetCurrent(), IONotificationPortGetRunLoopSource(port).takeUnretainedValue(), .defaultMode)
CFRunLoopRun()
