const socket = new WebSocket(`ws://${location.host}`);

let myId = null;
let myName = null;

let selectedDevices = new Set();
let currentIncoming = null;

// Incoming files currently being received
const incomingFiles = new Map();

// Files waiting for receiver approval
const pendingFiles = new Map();

const joinScreen = document.getElementById("joinScreen");
const appScreen = document.getElementById("appScreen");
const deviceName = document.getElementById("deviceName");
const devicesContainer = document.getElementById("devices");
const textInput = document.getElementById("text");
const fileInput = document.getElementById("fileInput");
const transfers = document.getElementById("transfers");


// ======================================================
// JOIN
// ======================================================

document
    .getElementById("joinBtn")
    .addEventListener("click", join);


function join() {
    const name =
        deviceName.value.trim() || "Unknown";

    if (socket.readyState !== WebSocket.OPEN) {
        alert("Not connected to MagicDrop server.");
        return;
    }

    socket.send(JSON.stringify({
        type: "join",
        name
    }));
}


// ======================================================
// SOCKET OPEN
// ======================================================

socket.addEventListener("open", () => {
    console.log("Connected to MagicDrop server.");
});


// ======================================================
// SOCKET ERROR
// ======================================================

socket.addEventListener("error", () => {
    console.error("WebSocket error.");
});


// ======================================================
// SOCKET CLOSE
// ======================================================

socket.addEventListener("close", () => {
    console.log("Disconnected from MagicDrop server.");
});


// ======================================================
// RECEIVE SERVER MESSAGE
// ======================================================

socket.addEventListener("message", async event => {

    // ==================================================
    // BINARY FILE CHUNK
    // ==================================================

    if (event.data instanceof Blob) {
        receiveFileChunk(event.data);
        return;
    }

    if (event.data instanceof ArrayBuffer) {
        receiveFileChunk(
            new Blob([event.data])
        );
        return;
    }


    // ==================================================
    // JSON
    // ==================================================

    let data;

    try {
        data = JSON.parse(event.data);
    } catch (error) {
        console.error(
            "Invalid server message:",
            error
        );
        return;
    }


    // ==================================================
    // JOINED
    // ==================================================

    if (data.type === "joined") {

        myId = data.id;
        myName = data.name;

        joinScreen.hidden = true;
        appScreen.hidden = false;

        const nameElement =
            document.getElementById("myName");

        if (nameElement) {
            nameElement.textContent = myName;
        }

        return;
    }


    // ==================================================
    // DEVICES
    // ==================================================

    if (data.type === "devices") {

        showDevices(data.devices);

        return;
    }


    // ==================================================
    // INCOMING TRANSFER
    // ==================================================

    if (data.type === "incoming-transfer") {

        showIncoming(data);

        return;
    }


    // ==================================================
    // TRANSFER ACCEPTED
    // ==================================================

    if (data.type === "transfer-accepted") {

        addTransfer(
            `✅ Accepted by ${escapeHTML(
                data.receiverName || "receiver"
            )}`
        );

        return;
    }


    // ==================================================
    // TRANSFER REJECTED
    // ==================================================

    if (data.type === "transfer-rejected") {

        addTransfer(
            `❌ Rejected by ${escapeHTML(
                data.receiverName || "receiver"
            )}`
        );

        return;
    }


    // ==================================================
    // TEXT RECEIVED
    // ==================================================

    if (data.type === "text-received") {

        addTransfer(`
            💬 Text from
            <strong>
                ${escapeHTML(data.senderName || "Unknown")}
            </strong>

            <div class="received-text">
                ${escapeHTML(data.text || "")}
            </div>
        `);

        return;
    }


    // ==================================================
    // UPLOAD APPROVED
    // ==================================================

    if (data.type === "upload-approved") {

        addTransfer(`
            📤 File approved by
            <strong>
                ${escapeHTML(
                    data.receiverName || "receiver"
                )}
            </strong>
        `);

        /*
         * The server sends localId back to the sender.
         * Use it to find the original File object.
         */

        if (data.localId) {
            uploadFile(
                data.transferId,
                data.localId
            );
        }

        return;
    }


    // ==================================================
    // FILE START
    // ==================================================

    if (data.type === "file-start") {

        startIncomingFile(data);

        return;
    }


    // ==================================================
    // FILE COMPLETE
    // ==================================================

    if (data.type === "file-complete") {

        finishIncomingFile(data);

        return;
    }


    // ==================================================
    // UPLOAD COMPLETE
    // ==================================================

    if (data.type === "upload-complete") {

        addTransfer(
            "✅ File upload completed"
        );

        return;
    }


    // ==================================================
    // ERROR
    // ==================================================

    if (data.type === "error") {

        addTransfer(`
            ❌ ${escapeHTML(
                data.message || "Unknown error"
            )}
        `);

        return;
    }
});


// ======================================================
// FILE ICON
// ======================================================

function getFileIcon(name, mime) {

    const ext =
        String(name || "")
            .split(".")
            .pop()
            .toLowerCase();


    if (mime === "application/pdf")
        return "📕";

    if (mime && mime.startsWith("video/"))
        return "🎬";

    if (mime && mime.startsWith("audio/"))
        return "🎵";


    if (
        ["zip", "rar", "7z", "tar", "gz"]
            .includes(ext)
    )
        return "📦";


    if (
        ["doc", "docx"]
            .includes(ext)
    )
        return "📘";


    if (
        ["xls", "xlsx", "csv"]
            .includes(ext)
    )
        return "📊";


    if (
        ["ppt", "pptx"]
            .includes(ext)
    )
        return "📙";


    if (
        ["txt", "md"]
            .includes(ext)
    )
        return "📄";


    if (
        ["js", "html", "css", "py", "json"]
            .includes(ext)
    )
        return "💻";


    return "📎";
}


// ======================================================
// START INCOMING FILE
// ======================================================

function startIncomingFile(data) {

    activeIncomingFile = {

        transferId:
            data.transferId,

        name:
            data.name || "received-file",

        size:
            Number(data.size || 0),

        mime:
            data.mime ||
            "application/octet-stream",

        chunks: [],

        received: 0
    };


    addTransfer(`
        📥 Receiving
        <strong>
            ${escapeHTML(
                data.name || "file"
            )}
        </strong>...
    `);

    console.log(
        `📥 Started receiving ${data.name}`
    );
}


// ======================================================
// RECEIVE FILE CHUNK
// ======================================================

function receiveFileChunk(blob) {

    if (!activeIncomingFile) {

        console.warn(
            "Received binary data without active file."
        );

        return;
    }


    activeIncomingFile.chunks.push(blob);

    activeIncomingFile.received +=
        blob.size;


    const percent =
        activeIncomingFile.size
            ? Math.min(
                100,
                (
                    activeIncomingFile.received /
                    activeIncomingFile.size
                ) * 100
            )
            : 0;


    console.log(
        `📥 Receiving ${
            activeIncomingFile.name
        }: ${
            formatBytes(
                activeIncomingFile.received
            )
        } / ${
            formatBytes(
                activeIncomingFile.size
            )
        } (${
            Math.round(percent)
        }%)`
    );
}


// ======================================================
// FINISH INCOMING FILE
// ======================================================

function finishIncomingFile(data) {

    if (!activeIncomingFile) {

        console.warn(
            "file-complete received but no active file."
        );

        return;
    }


    const file =
        activeIncomingFile;


    /*
     * Make sure this completion belongs
     * to the currently receiving file.
     */

    if (
        data.transferId &&
        file.transferId !== data.transferId
    ) {

        console.warn(
            "Transfer ID mismatch."
        );

        return;
    }


    const blob =
        new Blob(
            file.chunks,
            {
                type:
                    file.mime ||
                    "application/octet-stream"
            }
        );


    const url =
        URL.createObjectURL(blob);


    // ==================================================
    // TRANSFER CARD
    // ==================================================

    const item =
        document.createElement("div");

    item.className =
        "transfer";


    const icon =
        getFileIcon(
            file.name,
            file.mime
        );


    // ==================================================
    // IMAGE PREVIEW
    // ==================================================

    let preview = `
        <div class="file-icon">
            ${icon}
        </div>
    `;


    if (
        file.mime &&
        file.mime.startsWith("image/")
    ) {

        preview = `
            <img
                src="${url}"
                class="file-thumbnail"
                alt="${escapeHTML(file.name)}"
            >
        `;
    }


    item.innerHTML = `

        <div class="received-file">

            ${preview}

            <div class="file-details">

                <strong>
                    ${escapeHTML(file.name)}
                </strong>

                <small>
                    ${formatBytes(blob.size)}
                </small>

                <a
                    class="download-btn"
                    href="${url}"
                    download="${escapeHTML(file.name)}"
                >
                    ⬇ Download
                </a>

            </div>

        </div>

    `;


    transfers.prepend(item);


    console.log(
        `✅ Received ${file.name}`
    );


    console.log(
        `📦 Size: ${formatBytes(blob.size)}`
    );


    // Important:
    // Don't revoke the object URL immediately.
    // The download button needs it.

    activeIncomingFile = null;
}


// ======================================================
// SEND FILES
// ======================================================

document
    .getElementById("sendFile")
    .addEventListener(
        "click",
        sendFiles
    );


function sendFiles() {

    const files =
        [...fileInput.files];


    if (!files.length) {

        alert(
            "Select a file first."
        );

        return;
    }


    const targets =
        getTargets();


    if (!targets.length) {

        alert(
            "Select a device first."
        );

        return;
    }


    files.forEach(file => {

        const localId =
            Math.random()
                .toString(36)
                .substring(2, 10);


        pendingFiles.set(
            localId,
            file
        );


        socket.send(
            JSON.stringify({

                type:
                    "transfer-request",

                localId,

                targets,

                kind:
                    file.type &&
                    file.type.startsWith("image/")
                        ? "image"
                        : "file",

                name:
                    file.name,

                size:
                    file.size,

                mime:
                    file.type ||
                    "application/octet-stream"

            })
        );

    });


    addTransfer(
        `📤 ${files.length} file(s) sent for approval`
    );


    fileInput.value = "";
}


// ======================================================
// UPLOAD FILE
// ======================================================

async function uploadFile(
    transferId,
    localId
) {

    const file =
        pendingFiles.get(localId);


    if (!file) {

        console.error(
            "Original file not found:",
            localId
        );

        return;
    }


    socket.send(
        JSON.stringify({

            type:
                "upload-start",

            transferId

        })
    );


    const chunkSize =
        64 * 1024;


    try {

        for (
            let offset = 0;
            offset < file.size;
            offset += chunkSize
        ) {

            const chunk =
                file.slice(
                    offset,
                    offset + chunkSize
                );


            const buffer =
                await chunk.arrayBuffer();


            socket.send(buffer);


            /*
             * Give the browser event loop
             * a chance to process messages.
             */

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        0
                    )
            );
        }


        socket.send(
            JSON.stringify({

                type:
                    "upload-finish",

                transferId

            })
        );


    } catch (error) {

        console.error(
            "Upload failed:",
            error
        );

        addTransfer(
            "❌ File upload failed"
        );

    }
}


// ======================================================
// SEND TEXT
// ======================================================

document
    .getElementById("sendText")
    .addEventListener(
        "click",
        sendText
    );


function sendText() {

    const text =
        textInput.value;


    if (!text.trim()) {

        alert(
            "Write something first."
        );

        return;
    }


    const targets =
        getTargets();


    if (!targets.length) {

        alert(
            "Select a device first."
        );

        return;
    }


    socket.send(
        JSON.stringify({

            type:
                "transfer-request",

            targets,

            kind:
                "text",

            text,

            size:
                new Blob([text]).size

        })
    );


    addTransfer(
        "📤 Text sent for approval"
    );


    textInput.value = "";
}


// ======================================================
// DEVICES
// ======================================================

function showDevices(devices) {

    devicesContainer.innerHTML = "";

    selectedDevices.clear();


    devices
        .filter(
            device =>
                device.id !== myId
        )
        .forEach(device => {

            const button =
                document.createElement("button");


            button.textContent =
                `📱 ${device.name}`;


            button.onclick = () => {

                selectedDevices.delete("all");


                if (
                    selectedDevices.has(
                        device.id
                    )
                ) {

                    selectedDevices.delete(
                        device.id
                    );

                    button.classList.remove(
                        "selected"
                    );

                } else {

                    selectedDevices.add(
                        device.id
                    );

                    button.classList.add(
                        "selected"
                    );
                }


                const everyone =
                    document.getElementById(
                        "everyoneBtn"
                    );


                if (everyone) {

                    everyone.classList.remove(
                        "selected"
                    );
                }

            };


            devicesContainer.appendChild(
                button
            );

        });


    // ==================================================
    // EVERYONE
    // ==================================================

    const all =
        document.createElement("button");


    all.id =
        "everyoneBtn";


    all.textContent =
        "🚀 Everyone";


    all.onclick = () => {

        selectedDevices.clear();

        selectedDevices.add("all");


        devicesContainer
            .querySelectorAll("button")
            .forEach(btn => {

                btn.classList.remove(
                    "selected"
                );

            });


        all.classList.add(
            "selected"
        );

    };


    devicesContainer.appendChild(
        all
    );
}


// ======================================================
// TARGETS
// ======================================================

function getTargets() {

    if (
        selectedDevices.has("all")
    ) {

        return ["all"];
    }


    return [
        ...selectedDevices
    ];
}


// ======================================================
// INCOMING MODAL
// ======================================================

function showIncoming(data) {

    currentIncoming =
        data;


    document
        .getElementById(
            "incomingSender"
        )
        .textContent =
            data.senderName || "Unknown";


    const preview =
        document.getElementById(
            "incomingPreview"
        );


    if (
        data.kind === "text"
    ) {

        preview.innerHTML = `

            <div class="incoming-text">

                ${formatTextPreview(
                    data.text || ""
                )}

            </div>

            <small>
                ${data.size || 0} bytes
            </small>

        `;

    } else {

        preview.innerHTML = `

            <div>

                ${getFileIcon(
                    data.name,
                    data.mime
                )}

                <strong>
                    ${escapeHTML(
                        data.name || "file"
                    )}
                </strong>

            </div>

            <small>
                ${formatBytes(
                    data.size || 0
                )}
            </small>

        `;
    }


    document
        .getElementById(
            "incomingModal"
        )
        .hidden = false;
}


// ======================================================
// ACCEPT
// ======================================================

document
    .getElementById("acceptBtn")
    .addEventListener(
        "click",
        () => {

            if (!currentIncoming)
                return;


            socket.send(
                JSON.stringify({

                    type:
                        "accept-transfer",

                    transferId:
                        currentIncoming.transferId

                })
            );


            addTransfer(
                "✅ Transfer accepted"
            );


            closeIncoming();

        }
    );


// ======================================================
// REJECT
// ======================================================

document
    .getElementById("rejectBtn")
    .addEventListener(
        "click",
        () => {

            if (!currentIncoming)
                return;


            socket.send(
                JSON.stringify({

                    type:
                        "reject-transfer",

                    transferId:
                        currentIncoming.transferId

                })
            );


            addTransfer(
                "❌ Transfer rejected"
            );


            closeIncoming();
        }
    );


// ======================================================
// CLOSE INCOMING
// ======================================================

function closeIncoming() {

    currentIncoming = null;


    document
        .getElementById(
            "incomingModal"
        )
        .hidden = true;
}


// ======================================================
// TRANSFER LOG
// ======================================================

function addTransfer(html) {

    const item =
        document.createElement("div");


    item.className =
        "transfer";


    item.innerHTML =
        html;


    transfers.prepend(
        item
    );
}


// ======================================================
// TEXT PREVIEW
// ======================================================

function formatTextPreview(text) {

    if (
        text.length <= 600
    ) {

        return escapeHTML(text);
    }


    return `

        <div>
            <strong>Starting...</strong>
        </div>

        <pre>
${escapeHTML(
    text.substring(0, 350)
)}
        </pre>

        <div>...</div>

        <div>
            <strong>Ending...</strong>
        </div>

        <pre>
${escapeHTML(
    text.substring(text.length - 200)
)}
        </pre>

    `;
}


// ======================================================
// HELPERS
// ======================================================

function escapeHTML(text) {

    const div =
        document.createElement("div");

    div.textContent =
        String(text ?? "");

    return div.innerHTML;
}


function formatBytes(bytes) {

    bytes =
        Number(bytes) || 0;


    if (bytes <= 0)
        return "0 B";


    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];


    const index =
        Math.min(
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            ),
            units.length - 1
        );


    return (
        bytes /
        Math.pow(1024, index)
    ).toFixed(
        index === 0 ? 0 : 1
    )
    + " "
    + units[index];
                  }
