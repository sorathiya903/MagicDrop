# ✨ MagicDrop

> Simple local-network file and text sharing between your **terminal and browser**.

MagicDrop lets you share files and text between:

- 💻 Terminal → 📱 Browser
- 📱 Browser → 💻 Terminal
- 📱 Browser → 📱 Browser


**No cloud storage is required.** Start MagicDrop, open the local URL or scan the QR code, and start sharing.

## 🚀 Installation

Install MagicDrop globally with npm:

```bash
npm install -g magicdrop-cli
```

### ▶️ Start MagicDrop

Run:

```
md start
```

MagicDrop starts a local server and displays a QR code.

Example:
```
✨ MagicDrop 0.0.1
by Aditya Sorathiya

🌐 http://-.-.-.-:8765

📱 Scan the QR code or open the URL.

[QR CODE HERE]

📁 Downloads: /path/to/MagicDrop/downloads


Commands:

  devices

  send <file>

  send-text <text>

  y
  n

  help
  exit

```

Scan the QR code with another device or open the displayed URL in a browser connected to the same local network.

### 📱 Connect a Device

1. Start MagicDrop with:

```
md start
```

2. Scan the QR code or open the displayed URL.


3. Enter a device name.


4. Connect.



Connected devices can then share files and text with each other.

## 📁 Send a File

Use:

```
send <filename>
```

Example:

```
md> send photo.jpg
```

The receiving device will get an approval request.

After the receiver accepts the transfer, the file is sent automatically.

Files received by the terminal are saved in:

downloads/

## 💬 Send Text

Use:

```
send-text <text>
```

Example:

```
md> send-text Hello from MagicDrop!
```

You don't need single or double quotes.

Example:

```
md> send-text Hello this is a test
```

The receiver gets the text after accepting the transfer.

## 📱 Browser Sharing

From the browser you can:

- 📁 Send files

- 💬 Send text

- 📥 Receive files

- 📥 Receive text

- 🔄 Share between **multiple connected devices**


Browser-to-browser file transfers are sent in **chunks** and combined into a single file when the transfer finishes.

## 💻 Terminal Commands

Command	Description

`md start` - Start MagicDrop

`md start --limit <NUMBER><KB/MB/GB>` - Start MagicDrop with a custom file-size limit

`md -v` -	Show the installed version

`devices` -	Show connected devices

`send <file>` -	Send a file

`send-text` - <text>	Send text

`y`	- Accept the oldest pending transfer

`n` -	Reject the oldest pending transfer

`help` -	Show available commands

`exit` -	Stop MagicDrop


## 🔢 Check Version

Run:

```
md -v
```

Example:

```
MagicDrop 0.0.1 by Aditya Sorathiya
```
## 🔐 Local Network

MagicDrop runs on your local network.

Make sure the devices you want to connect are on the **same Wi-Fi/local network**.

The displayed IP address is only an example and will be different depending on your network.

## 📦 Downloads

Files received by the terminal are stored inside:

downloads/

The folder is created automatically when MagicDrop starts.

## 🎉 Releases

### MagicDrop 0.0.2 - The second release of MagicDrop.

✨ Improvements

- 🎨 Improved browser UI
- 
- 📦 Added configurable maximum file-size limit
- 
- ⚙️ Added --limit option to md start
- 
- 🛡️ Added server-side and client-side file-size validation

### MagicDrop 0.0.1 — First Release

This is the first release of MagicDrop.

Included

- 📁 File sharing

- 💬 Text sharing

- 💻 Terminal interface

- 🌐 Browser interface

- 📱 Browser ↔ Browser sharing

- 💻 Terminal ↔ Browser sharing

- 📱 Multiple connected devices

- 📷 QR code connection

- ✅ Transfer approval

- ❌ Transfer rejection

- 📦 Chunk-based file transfers

- 📥 Automatic terminal downloads

- 🔢 Version command


## 👨‍💻 Author

Aditya Sorathiya

## 📄 License

MIT License

