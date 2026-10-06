// The macOS share sheet for Lax: share files or text through any app, not only WhatsApp.
//   share-sheet picker <item>...     the share menu: you pick the app on the Mac
//   share-sheet <service> <item>...  straight to one: airdrop | messages | mail
// Items that are existing paths are shared as files, anything else as text. Prints one line: shared | cancelled | error: …
// Built on first use by lib/share.mjs (swiftc) into ~/.lax/bin.
import AppKit

let args = Array(CommandLine.arguments.dropFirst())
let mode = args.first ?? "picker"
let items: [Any] = args.dropFirst().map { (a: String) -> Any in FileManager.default.fileExists(atPath: a) ? URL(fileURLWithPath: a) : a as NSString }

func finish(_ line: String) -> Never { print(line); fflush(stdout); exit(0) }

let services: [String: NSSharingService.Name] = [
  "airdrop": .sendViaAirDrop, "messages": .composeMessage, "mail": .composeEmail,
]

final class Sharer: NSObject, NSSharingServiceDelegate, NSSharingServicePickerDelegate {
  let window: NSWindow
  init(window: NSWindow) { self.window = window }

  func sharingServicePicker(_ picker: NSSharingServicePicker, didChoose service: NSSharingService?) {
    if let service { service.delegate = self } else { finish("cancelled") }
  }
  func sharingService(_ s: NSSharingService, sourceWindowForShareItems items: [Any], sharingContentScope: UnsafeMutablePointer<NSSharingService.SharingContentScope>) -> NSWindow? { window }
  func sharingService(_ s: NSSharingService, didShareItems items: [Any]) { finish("shared") }
  func sharingService(_ s: NSSharingService, didFailToShareItems items: [Any], error: Error) {
    let e = error as NSError
    finish(e.domain == NSCocoaErrorDomain && e.code == NSUserCancelledError ? "cancelled" : "error: \(e.localizedDescription)")
  }
}

final class Launcher: NSObject, NSApplicationDelegate {
  var window: NSWindow!, sharer: Sharer!
  func applicationDidFinishLaunching(_ note: Notification) {
    // A small window to anchor the menu and any sheet a service opens (Messages, Mail).
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 320, height: 80), styleMask: [.titled], backing: .buffered, defer: false)
    window.title = "Lax: share"
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    sharer = Sharer(window: window)
    if mode == "picker" {
      let picker = NSSharingServicePicker(items: items)
      picker.delegate = sharer
      let view = window.contentView!
      picker.show(relativeTo: NSRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1), of: view, preferredEdge: .minY)
    } else {
      guard let name = services[mode], let service = NSSharingService(named: name) else { finish("error: unknown app \(mode)") }
      guard service.canPerform(withItems: items) else { finish("error: \(mode) can't share this") }
      service.delegate = sharer
      service.perform(withItems: items)
    }
  }
}

if items.isEmpty { finish("error: nothing to share") }
let app = NSApplication.shared
let launcher = Launcher()
app.delegate = launcher
app.setActivationPolicy(.regular)
DispatchQueue.main.asyncAfter(deadline: .now() + 600) { finish("cancelled") } // left open: give up after 10 minutes
app.run()
