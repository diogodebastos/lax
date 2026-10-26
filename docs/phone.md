# Lax on the phone

Pairing, the layouts for each screen, hearing you, and the Life menu. Back to the [README](../README.md).

## Phone

1. Open `http://localhost:7777/pair` on the Mac and scan the QR code with the phone. Open it in **Chrome** on Android, or **Safari** on an iPhone (below); Brave has no speech recognition.
2. Tap "wake", then tap Lax to talk. (Through your own domain, Access asks for your email and a PIN the first time.)
3. The Android app adds a background link, approvals that wake the phone, and the Flip's cover screen: [android/README.md](../android/README.md).

### iPhone

Safari, no app to install. It needs **iOS 16.4 or newer** (older Safari can't read Lax's page). On the pairing page, the "iPhone / browser" QR.

- **Talking** in Safari works as in Chrome, with Dictation on (Settings, General, Keyboard, Enable Dictation).
- **The Home Screen app:** Share, Add to Home Screen gives a full-screen Lax with its own icon. Worth it: Safari forgets a site's storage (the pairing) after 7 days without a visit; a Home Screen app doesn't. It has storage of its own, so it starts unpaired: in Safari, **LAX ≡**, "copy link for the Home Screen app"; open the icon, tap, paste, OK.
- **Talking in the Home Screen app:** iOS has no speech recognition there, so Lax records you and Whisper on your computer writes it down (below): tap Lax, talk, tap again (or hold and let go). Without Whisper you type.
- **Approvals** reach the iPhone only while Lax is on screen: iOS pauses a page in the background. Coming back, it relinks and shows what you missed, and anything still waiting for you.
- The ringer switch on silent mutes Lax's tunes.
- The Android app checks that its page was signed by your computer; a browser can't, so on an iPhone the page's integrity rests on TLS to your own Worker. What you and Lax say is still sealed end to end.

### Hearing: Whisper on the Mac

The app records you itself and feeds the same audio to Android's recognizer (Android 13+), so your words still show live and it still decides when you're done. Then the recording goes to the Mac (`/api/hear`) and Whisper (whisper.cpp, the `small` model) writes it down, with your names as its prompt; the vocabulary's fixes apply on top. It's better on names and Portuguese: "come eat and push" becomes "commit and push".

- When Whisper's words differ, they show for 1.5 s; tap or swipe to keep the phone's. Quick actions skip it.
- The phone's words go as they are if Whisper isn't up, fails or takes over 10 s.
- Free, and nothing leaves the Mac. `npm run whisper` builds it into `~/.lax-tools` (no Homebrew), then restart Lax. It runs next to Lax on port 7778, kept loaded (~600 MB, 1.5-2.5 s for a short message on an Intel Mac). `LAX_WHISPER_BIN` / `LAX_WHISPER_MODEL` point elsewhere.

## Bodies

One URL. The layout follows the screen, and `?layout=wide|tall|big` forces one:
- **wide** (closed phone, 512×260 cover strip): Lax on the left, bubble and terminal on the right
- **tall** (cover screen held sideways, 260×512): Lax on top, terminal below
- **big** (open / Flex mode): Lax above the fold; session chips, terminal and buttons below it

## Life menu

Tap **LAX ≡** to open the menu. It reads top to bottom:
- **Settings**: name, species (what it hatched as; "pick it myself" while the bars get tuned), theme (system / light / dark), voice and pitch, whether it reads every "done", where talk goes, phone approvals and the wait time
- **♥ Lax's life** (read-only): stats (level, stage, XP, streak, mood, traits…), tools (this week, each trait's tools added up as the traits count them, Bash a tenth, against what it needs; the worn one marked), milestones
- **What Lax knows**: how many notes and episodes, its skills (install or decline a draft after reading it; forget an installed one), its newest episodes (forget one: tap twice). Milestones and episodes show the newest 5; "show all" opens the rest
- **Rebirth**: hold for 2s to start a new life. Its life (`life.db`) is wiped; your settings stay. What it knows stays too, unless you switch on "forget what it knows too" (notes, episodes and skills go; how it learns stays)
