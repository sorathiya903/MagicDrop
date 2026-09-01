const socket =
    new WebSocket(
        `ws://${location.host}`
    );

let activeIncomingFile = null;
let myId = null;
let myName = null;
let incomingBuffers = [];
let incomingTransfer = null;
const pendingUploads = new Map();
const pendingFiles =  new Map();
let selectedDevices = new Set();

let currentIncoming = null;


const joinScreen =
    document.getElementById("joinScreen");

const appScreen =
    document.getElementById("appScreen");

const deviceName =
    document.getElementById("deviceName");

const devicesContainer =
    document.getElementById("devices");

const textInput =
    document.getElementById("text");

const fileInput =
    document.getElementById("fileInput");

const transfers =
    document.getElementById("transfers");


// =========================
// JOIN
// =========================

document
    .getElementById("joinBtn")
    .addEventListener(
        "click",
        join
    );
function getFileIcon(name, mime) {

    const ext =
        name
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
        [
            "zip",
            "rar",
            "7z",
            "tar",
            "gz"
        ].includes(ext)
    )
        return "📦";

    if (
        [
            "doc",
            "docx"
        ].includes(ext)
    )
        return "📘";

    if (
        [
            "xls",
            "xlsx",
            "csv"
        ].includes(ext)
    )
        return "📊";

    if (
        [
            "ppt",
            "pptx"
        ].includes(ext)
    )
        return "📙";

    if (
        [
            "txt",
            "md"
        ].includes(ext)
    )
        return "📄";

    if (
        [
            "js",
            "html",
            "css",
            "py",
            "json"
        ].includes(ext)
    )
        return "💻";


    return "📎";

}
function finishIncomingFile(data) {

    if (!activeIncomingFile)
        return;


    const file =
        activeIncomingFile;


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


    // =========================
    // TRANSFER CARD
    // =========================

    const item =
        document.createElement("div");

    item.className =
        "transfer";


    // Image thumbnail
    if (
        file.mime &&
        file.mime.startsWith("image/")
    ) {

        item.innerHTML = `

            <div class="received-file">

                <img
                    src="${url}"
                    class="received-thumbnail"
                    alt="${escapeHTML(file.name)}"
                >

                <div>

                    <strong>
                        ${escapeHTML(file.name)}
                    </strong>

                    <small>
                        ${formatBytes(file.size)}
                    </small>

                    <a
                        href="${url}"
                        download="${escapeHTML(file.name)}"
                        class="download-btn"
                    >
                        ⬇️ Download
                    </a>

                </div>

            </div>

        `;

    }

    // Other files
    else {

        const icon =
            getFileIcon(
                file.name,
                file.mime
            );


        item.innerHTML = `

            <div class="received-file">

                <div class="file-icon">
                    ${icon}
                </div>

                <div>

                    <strong>
                        ${escapeHTML(file.name)}
                    </strong>

                    <small>
                        ${formatBytes(file.size)}
                    </small>

                    <a
                        href="${url}"
                        download="${escapeHTML(file.name)}"
                        class="download-btn"
                    >
                        ⬇️ Download
                    </a>

                </div>

            </div>

        `;

    }


    transfers.prepend(item);


    console.log(
        `✅ Received ${file.name}`
    );


    // Release old chunks
    activeIncomingFile =
        null;

}
async function handleIncomingBinary(data) {

    if (!activeIncomingFile) {
        console.warn(
            "Received file data but no active transfer."
        );
        return;
    }


    // Convert incoming WebSocket data to Blob
    let chunk;

    if (data instanceof Blob) {

        chunk = data;

    } else if (data instanceof ArrayBuffer) {

        chunk = new Blob([data]);

    } else {

        console.warn(
            "Unknown binary data received."
        );

        return;
    }


    // Store chunk
    activeIncomingFile.chunks.push(chunk);

    activeIncomingFile.received +=
        chunk.size;


    // Update progress if available
    const progress =
        document.getElementById(
            "transferProgress"
        );

    if (progress) {

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

        progress.textContent =
            `${Math.round(percent)}%`;

    }


    // Optional log
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
        }`
    );

}
function join() {

    const name =
        deviceName.value.trim() ||
        "Unknown";


    socket.send(JSON.stringify({

        type: "join",

        name

    }));

}

function receiveFileChunk(blob) {

    if (!incomingTransfer)
        return;

    incomingBuffers.push(blob);

}
function finishIncomingFile(data) {

    if (!incomingTransfer)
        return;


    const blob =
        new Blob(
            incomingBuffers,
            {
                type:
                    data.mime ||
                    "application/octet-stream"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const item =
        document.createElement("div");

    item.className =
        "received-file";


    let preview = "";


    // IMAGE
    if (
        data.mime &&
        data.mime.startsWith("image/")
    ) {

        preview = `

            <img
                src="${url}"
                class="file-thumbnail"
                alt="${escapeHTML(data.name)}"
            >

        `;

    }

    // PDF
    else if (
        data.mime ===
        "application/pdf"
    ) {

        preview = `
            <div class="file-icon">
                📄
            </div>
        `;

    }

    // VIDEO
    else if (
        data.mime &&
        data.mime.startsWith("video/")
    ) {

        preview = `
            <div class="file-icon">
                🎬
            </div>
        `;

    }

    // AUDIO
    else if (
        data.mime &&
        data.mime.startsWith("audio/")
    ) {

        preview = `
            <div class="file-icon">
                🎵
            </div>
        `;

    }

    // ZIP
    else if (
        data.name &&
        (
            data.name.endsWith(".zip") ||
            data.name.endsWith(".rar") ||
            data.name.endsWith(".7z")
        )
    ) {

        preview = `
            <div class="file-icon">
                📦
            </div>
        `;

    }

    // OTHER
    else {

        preview = `
            <div class="file-icon">
                📁
            </div>
        `;

    }


    item.innerHTML = `

        ${preview}

        <div class="file-details">

            <strong>
                ${escapeHTML(data.name)}
            </strong>

            <small>
                ${formatBytes(data.size)}
            </small>

            <a
                class="download-btn"
                href="${url}"
                download="${escapeHTML(data.name)}"
            >
                ⬇ Download
            </a>

        </div>

    `;


    transfers.prepend(item);


    incomingBuffers = [];

    incomingTransfer = null;

                            }
// =========================
// RECEIVE SERVER MESSAGE
// =========================
async function uploadFile(
    transferId,
    localId
) {

    const file =
        pendingFiles.get(
            localId
        );


    if (!file)
        return;


    socket.send(
        JSON.stringify({

            type:
                "upload-start",

            transferId

        })
    );


    const chunkSize =
        64 * 1024;


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


        socket.send(
            buffer
        );


        // Don't flood the WebSocket.
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


    pendingFiles.delete(
        localId
    );

        }

function sendFiles() {

    const files =
        [...fileInput.files];


    if (!files.length) {
        alert("Select a file first.");
        return;
    }


    const targets =
        getTargets();


    if (!targets.length) {
        alert("Select a device first.");
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
                    file.type.startsWith(
                        "image/"
                    )
                        ? "image"
                        : "file",

                name:
                    file.name,

                size:
                    file.size,

                mime:
                    file.type

            })
        );

    });


    fileInput.value = "";

                  }
    
socket.addEventListener(
    "message",
    event => {

        // Binary file chunk
        if (event.data instanceof Blob) {

            receiveFileChunk(event.data);

            return;
        }


        const data =
            JSON.parse(event.data);
        if (data.type === "transfer-created") {

    const file =
        [...fileInput.files]
            .find(
                f =>
                    f.name === data.name
            );

    if (file) {

        pendingUploads.set(
            data.transferId,
            file
        );

    }

        }

if (data.type === "transfer-request") {

    const sender = devices.get(ws.deviceId);

    if (!sender) return;

    const transferId =
        Math.random()
            .toString(36)
            .substring(2, 12);

    const transfer = {
        transferId,
        senderId: sender.id,
        senderName: sender.name,
        kind: data.kind,
        text: data.text || null,
        name: data.name || null,
        size: data.size || 0,
        mime: data.mime || null
    };

    // Save temporarily
    transfers.set(transferId, transfer);

    let targets = [];

    if (
        data.targets &&
        data.targets.includes("all")
    ) {

        targets = [
            ...devices.values()
        ].filter(
            device =>
                device.id !== sender.id
        );

    } else {

        targets = [
            ...data.targets || []
        ]
        .map(id => devices.get(id))
        .filter(Boolean);

    }


    for (const receiver of targets) {

        if (
            receiver.ws.readyState ===
            WebSocket.OPEN
        ) {

            receiver.ws.send(
                JSON.stringify({

                    type:
                        "incoming-transfer",

                    transferId,

                    senderId:
                        sender.id,

                    senderName:
                        sender.name,

                    kind:
                        transfer.kind,

                    text:
                        transfer.text,

                    name:
                        transfer.name,

                    size:
                        transfer.size,

                    mime:
                        transfer.mime

                })
            );

        }

    }

                    }

        if (data.type === "upload-start") {

    incomingTransfer = data;
    incomingBuffers = [];

    addTransfer(
        `📥 Receiving <strong>${escapeHTML(
            data.name
        )}</strong>...`
    );

        }

        if (
    data.type === "file-complete"
) {

    finishIncomingFile(data);

}
        // =========================
// ACCEPT TRANSFER
// =========================

if (data.type === "accept-transfer") {

    const receiver =
        devices.get(ws.deviceId);

    const transfer =
        transfers.get(data.transferId);

    if (!receiver || !transfer)
        return;


    const sender =
        devices.get(
            transfer.senderId
        );


    if (!sender)
        return;


    // TEXT
    if (transfer.kind === "text") {

        sender.ws.send(
            JSON.stringify({

                type:
                    "text-received",

                senderName:
                    transfer.senderName,

                receiverName:
                    receiver.name,

                text:
                    transfer.text

            })
        );


        receiver.ws.send(
            JSON.stringify({

                type:
                    "text-received",

                senderName:
                    transfer.senderName,

                receiverName:
                    receiver.name,

                text:
                    transfer.text

            })
        );


        sender.ws.send(
            JSON.stringify({

                type:
                    "transfer-accepted",

                receiverName:
                    receiver.name

            })
        );

    }

}

// =========================
// REJECT TRANSFER
// =========================

if (data.type === "reject-transfer") {

    const receiver =
        devices.get(ws.deviceId);

    const transfer =
        transfers.get(data.transferId);

    if (!receiver || !transfer)
        return;


    const sender =
        devices.get(
            transfer.senderId
        );


    if (!sender)
        return;


    sender.ws.send(
        JSON.stringify({

            type:
                "transfer-rejected",

            receiverName:
                receiver.name

        })
    );

                            }
        // JOINED
        if (data.type === "joined") {

            myId = data.id;

            myName = data.name;


            joinScreen.hidden = true;

            appScreen.hidden = false;


            document
                .getElementById("myName")
                .textContent =
                    myName;

        }


        // DEVICES
        if (data.type === "devices") {

            showDevices(
                data.devices
            );

        }


        // INCOMING
        if (
            data.type ===
            "incoming-transfer"
        ) {

            showIncoming(data);

        }


        // ACCEPTED
        if (
            data.type ===
            "transfer-accepted"
        ) {

            addTransfer(

                `✅ Accepted by ${
                    data.receiverName
                }`

            );

        }


        // REJECTED
        if (
            data.type ===
            "transfer-rejected"
        ) {

            addTransfer(

                `❌ Rejected by ${
                    data.receiverName
                }`

            );

        }


        // TEXT RECEIVED
        if (
            data.type ===
            "text-received"
        ) {

            addTransfer(`

                💬 Text from
                <strong>
                    ${escapeHTML(
                        data.senderName
                    )}
                </strong>

                <div class="received-text">
                    ${escapeHTML(
                        data.text
                    )}
                </div>

            `);

        }


        // FILE UPLOAD APPROVED
        if (
            data.type ===
            "upload-approved"
        ) {

            addTransfer(

                `📤 ${
                    data.name ||
                    "File"
                } approved by ${
                    data.receiverName
                }`

            );
            uploadFile(
    data.transferId,
    data.localId
);

            // File upload will be
            // added in next step.

        }

    }
);


// =========================
// DEVICES
// =========================

function showDevices(devices) {

    devicesContainer.innerHTML = "";

    selectedDevices.clear();

    // =========================
    // DEVICE BUTTONS
    // =========================

    devices
        .filter(device => device.id !== myId)
        .forEach(device => {

            const button =
                document.createElement("button");

            button.textContent =
                `📱 ${device.name}`;

            button.onclick = () => {

                // If Everyone was selected,
                // remove it first.
                selectedDevices.delete("all");

                // Toggle this device
                if (
                    selectedDevices.has(device.id)
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

                // Remove Everyone selected state
                const everyone =
                    document.getElementById(
                        "everyoneBtn"
                    );

                if (everyone) {
                    everyone.classList.remove(
                        "selected"
                    );
                }

                console.log(
                    "Selected:",
                    [...selectedDevices]
                );
            };

            devicesContainer.appendChild(button);

        });


    // =========================
    // EVERYONE
    // =========================

    const all =
        document.createElement("button");

    all.id = "everyoneBtn";

    all.textContent =
        "🚀 Everyone";

    all.onclick = () => {

        selectedDevices.clear();

        selectedDevices.add("all");

        // Remove selected state from devices
        devicesContainer
            .querySelectorAll("button")
            .forEach(btn => {
                btn.classList.remove("selected");
            });

        all.classList.add("selected");

        console.log(
            "Selected: Everyone"
        );
    };

    devicesContainer.appendChild(all);
}

// =========================
// GET TARGETS
// =========================

function getTargets() {
    if (selectedDevices.has("all")) {
        return ["all"];
    }

    return [...selectedDevices];
}

// =========================
// SEND TEXT
// =========================

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


    socket.send(JSON.stringify({

        type:
            "transfer-request",

        targets,

        kind:
            "text",

        text,

        size:
            new Blob([text]).size

    }));


    addTransfer(
        "📤 Text sent for approval"
    );


    textInput.value = "";

}


// =========================
// SEND FILE
// =========================

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

        socket.send(
            JSON.stringify({

                type:
                    "transfer-request",

                targets,

                kind:
                    file.type.startsWith(
                        "image/"
                    )
                        ? "image"
                        : "file",

                name:
                    file.name,

                size:
                    file.size,

                mime:
                    file.type

            })
        );

    });


    addTransfer(
        `📤 ${files.length} file(s) sent for approval`
    );


    fileInput.value = "";

}


// =========================
// INCOMING
// =========================

function showIncoming(data) {

    currentIncoming =
        data;


    document
        .getElementById(
            "incomingSender"
        )
        .textContent =
            data.senderName;


    const preview =
        document.getElementById(
            "incomingPreview"
        );


    if (data.kind === "text") {

        preview.innerHTML = `

            <div class="incoming-text">

                ${formatTextPreview(
                    data.text
                )}

            </div>

            <small>
                ${
                    data.size
                } bytes
            </small>

        `;

    }

    else if (
        data.kind === "image"
    ) {

        preview.innerHTML = `

            <div>
                🖼️
                <strong>
                    ${escapeHTML(
                        data.name
                    )}
                </strong>
            </div>

            <small>
                ${formatBytes(
                    data.size
                )}
            </small>

        `;

    }

    else {

        preview.innerHTML = `

            <div>
                📦
                <strong>
                    ${escapeHTML(
                        data.name
                    )}
                </strong>
            </div>

            <small>
                ${formatBytes(
                    data.size
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


// =========================
// ACCEPT
// =========================
document
    .getElementById("acceptBtn")
    .addEventListener(
        "click",
        () => {

            if (!currentIncoming)
                return;


            // Start collecting binary data
            if (
                currentIncoming.kind === "image" ||
                currentIncoming.kind === "file"
            ) {

                activeIncomingFile = {

                    transferId:
                        currentIncoming.transferId,

                    name:
                        currentIncoming.name,

                    size:
                        currentIncoming.size,

                    mime:
                        currentIncoming.mime,

                    chunks: [],

                    received: 0

                };

            }


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

// =========================
// REJECT
// =========================

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
                        currentIncoming
                            .transferId

                })
            );


            addTransfer(
                "❌ Transfer rejected"
            );


            closeIncoming();

        }
    );


// =========================
// CLOSE
// =========================

function closeIncoming() {

    currentIncoming = null;


    document
        .getElementById(
            "incomingModal"
        )
        .hidden = true;

}


// =========================
// TRANSFER LOG
// =========================

function addTransfer(html) {

    const item =
        document.createElement(
            "div"
        );


    item.className =
        "transfer";


    item.innerHTML =
        html;


    transfers.prepend(
        item
    );

}


// =========================
// LONG TEXT PREVIEW
// =========================

function formatTextPreview(text) {

    if (text.length <= 600) {

        return escapeHTML(text);

    }


    const start =
        text.substring(
            0,
            350
        );


    const end =
        text.substring(
            text.length - 200
        );


    return `

        <div>
            <strong>Starting...</strong>
        </div>

        <pre>
${escapeHTML(start)}
        </pre>

        <div>
            ...
        </div>

        <div>
            <strong>Ending...</strong>
        </div>

        <pre>
${escapeHTML(end)}
        </pre>

    `;

}


// =========================
// HELPERS
// =========================

function escapeHTML(text) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        text;

    return div.innerHTML;

}


function formatBytes(bytes) {

    if (!bytes)
        return "0 B";


    const units =
        [
            "B",
            "KB",
            "MB",
            "GB"
        ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        bytes /
        Math.pow(
            1024,
            index
        )
    ).toFixed(1)
    + " "
    + units[index];

            }
