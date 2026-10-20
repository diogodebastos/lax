// Lax in the Mac menu bar: the tiny Lax, awake while the server runs and asleep (faded, eyes shut) while it doesn't,
// and a menu to turn the server on or off. It only loads and unloads the launchd agent scripts/install-launchd.mjs wrote;
// the tunnel is left alone. Built and installed by scripts/install-menubar.mjs.
import AppKit

let label = "digi-lax.server"
let domain = "gui/\(getuid())"
let plist = NSHomeDirectory() + "/Library/LaunchAgents/\(label).plist"
let log = NSHomeDirectory() + "/.lax/logs/server.log"

@discardableResult
func launchctl(_ args: String...) -> Int32 {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
  p.arguments = args
  p.standardOutput = FileHandle.nullDevice
  p.standardError = FileHandle.nullDevice
  do { try p.run() } catch { return -1 }
  p.waitUntilExit()
  return p.terminationStatus
}

func running() -> Bool { launchctl("print", "\(domain)/\(label)") == 0 }

// The tiny Lax from public/mind-view.js (Mind.lax), facing you, as a template image so macOS paints it like the other
// menu bar icons: a solid body with its eyes cut out (open, or shut dashes and faded while asleep).
// 9 × 8, 4 px per pixel at @2x → 18 × 16 pt.
func tinyLax(awake: Bool) -> NSImage {
  var rows = ["..xxxxx..", ".xxxxxxx.", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", ".xxxxxxx.", "..xx.xx.."].map { Array($0) }
  if awake { for e in [2, 6] { rows[3][e] = "."; rows[4][e] = "." } } else { for e in [1, 2, 6, 7] { rows[4][e] = "." } }
  let s = 4, w = 9, h = 8
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w * s, pixelsHigh: h * s, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSColor(white: 0, alpha: awake ? 1 : 0.45).setFill()
  for (j, r) in rows.enumerated() {
    for (i, c) in r.enumerated() where c == "x" { NSRect(x: i * s, y: (h - 1 - j) * s, width: s, height: s).fill() }
  }
  NSGraphicsContext.restoreGraphicsState()
  let img = NSImage(size: NSSize(width: Double(w * s) / 2, height: Double(h * s) / 2))
  img.addRepresentation(rep)
  img.isTemplate = true
  return img
}

class Bar: NSObject, NSApplicationDelegate, NSMenuDelegate {
  let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  let toggle = NSMenuItem(title: "", action: #selector(flip), keyEquivalent: "")
  let state = NSMenuItem(title: "", action: nil, keyEquivalent: "")
  let awake = tinyLax(awake: true), asleep = tinyLax(awake: false)

  func applicationDidFinishLaunching(_ n: Notification) {
    let menu = NSMenu()
    menu.delegate = self
    state.isEnabled = false
    toggle.target = self
    let restart = NSMenuItem(title: "Restart Lax", action: #selector(restart), keyEquivalent: "")
    restart.target = self
    let logs = NSMenuItem(title: "Open the log", action: #selector(openLog), keyEquivalent: "")
    logs.target = self
    let quit = NSMenuItem(title: "Hide from the menu bar", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
    [state, toggle, restart, .separator(), logs, quit].forEach(menu.addItem)
    item.menu = menu
    refresh()
    // Someone else (npm run install-service, launchctl) may start or stop it too.
    Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in self.refresh() }
  }

  func menuWillOpen(_ m: NSMenu) { refresh() }

  func refresh() {
    let on = running()
    item.button?.image = on ? awake : asleep
    item.button?.toolTip = on ? "Lax is on" : "Lax is off"
    state.title = on ? "Lax is on" : "Lax is off"
    toggle.title = on ? "Turn off" : "Turn on"
    toggle.isEnabled = FileManager.default.fileExists(atPath: plist)
  }

  @objc func flip() {
    if running() { launchctl("bootout", "\(domain)/\(label)") } else { launchctl("bootstrap", domain, plist) }
    refresh()
  }

  @objc func restart() {
    if running() { launchctl("kickstart", "-k", "\(domain)/\(label)") } else { launchctl("bootstrap", domain, plist) }
    refresh()
  }

  @objc func openLog() { NSWorkspace.shared.open(URL(fileURLWithPath: log)) }
}

let app = NSApplication.shared
let bar = Bar()
app.delegate = bar
app.setActivationPolicy(.accessory) // no Dock icon
app.run()
