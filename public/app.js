const socket = new WebSocket(`ws://${location.host}`);

// ======================================================
// STATE
// ======================================================

let myId = null;
let myName = null;

const pendingFiles = new Map();
// localId -> File

const incomingFiles = new Map();
// transferId -> incoming file state

let currentIncoming = null;

const selectedDevices = new Set();


// ======================================================
// DOM
// ======================================================

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


// ======================================================
// CONNECTION
// ======================================================

socket.addEventListener("open", () => {

    console.log("🔌 Connected to MagicDrop server.");

});

socket.addEventListener("close", () => {

    console.log("🔌 Disconnected from MagicDrop server.");

});

socket.addEventListener("error", error => {

    console.error(
        "❌ WebSocket error:",
        error
    );

});


// ======================================================
// JOIN
// ======================================================

document
    .getElementById("joinBtn")
    .addEventListener(
        "click",
        join
    );


function join() {

    if (
        socket.readyState !==
        WebSocket.OPEN
    ) {

        alert(
            "Not connected to the server."
        );

        return;

    }


    const name =
        deviceName.value.trim() ||
        "Unknown";


    socket.send(
        JSON.stringify({

            type: "join",

            name

        })
    );

}


// ======================================================
// RECEIVE SERVER MESSAGES
// ======================================================

socket.addEventListener(
    "message",
    async event => {

        // ==================================================
        // BINARY
        // ==================================================

        if (
            event.data instanceof Blob
        ) {

            await handleIncomingBinary(
                event.data
            );

            return;

        }


        // ==================================================
        // JSON
        // ==================================================

        let data;

        try {

            data =
                JSON.parse(
                    event.data
                );

        } catch (error) {

            console.error(
                "Invalid server message:",
                error
            );

            return;

        }


        console.log(
            "📨 Server:",
            data.type,
            data
        );


        // ==================================================
        // JOINED
        // ==================================================

        if (
            data.type === "joined"
        ) {

            myId =
                data.id;

            myName =
                data.name;


            joinScreen.hidden =
                true;

            appScreen.hidden =
                false;


            const myNameElement =
                document.getElementById(
                    "myName"
                );


            if (myNameElement) {

                myNameElement.textContent =
                    myName;

            }


            return;

        }


        // ==================================================
        // DEVICES
        // ==================================================

        if (
            data.type === "devices"
        ) {

            showDevices(
                data.devices || []
            );

            return;

        }


        // ==================================================
        // INCOMING TRANSFER
        // ==================================================

        if (
            data.type ===
            "incoming-transfer"
        ) {

            showIncoming(
                data
            );

            return;

        }


        // ==================================================
        // TRANSFER ACCEPTED
        // ==================================================

        if (
            data.type ===
            "transfer-accepted"
        ) {

            addTransfer(
                `✅ Accepted by ${
                    escapeHTML(
                        data.receiverName ||
                        "receiver"
                    )
                }`
            );

            return;

        }


        // ==================================================
        // TRANSFER REJECTED
        // ==================================================

        if (
            data.type ===
            "transfer-rejected"
        ) {

            addTransfer(
                `❌ Rejected by ${
                    escapeHTML(
                        data.receiverName ||
                        "receiver"
                    )
                }`
            );

            return;

        }


        // ==================================================
        // TEXT RECEIVED
        // ==================================================

        if (
            data.type ===
            "text-received"
        ) {

            addTransfer(`

                💬 Text from
                <strong>
                    ${escapeHTML(
                        data.senderName ||
                        "Unknown"
                    )}
                </strong>

                <div class="received-text">
                    ${escapeHTML(
                        data.text || ""
                    )}
                </div>

            `);

            return;

        }


        // ==================================================
        // UPLOAD APPROVED
        // ==================================================

        if (
            data.type ===
            "upload-approved"
        ) {

            console.log(
                "🚀 Upload approved:",
                {
                    transferId:
                        data.transferId,

                    localId:
                        data.localId,

                    name:
                        data.name
                }
            );


            addTransfer(

                `📤 ${
                    escapeHTML(
                        data.name ||
                        "File"
                    )
                } approved by ${
                    escapeHTML(
                        data.receiverName ||
                        "receiver"
                    )
                }`

            );


            await uploadFile(
                data.transferId,
                data.localId
            );


            return;

        }


        // ==================================================
        // FILE START
        // ==================================================

        if (
            data.type ===
            "file-start"
        ) {

            startIncomingFile(
                data
            );

            return;

        }


        // ==================================================
        // FILE COMPLETE
        // ==================================================

        if (
            data.type ===
            "file-complete"
        ) {

            finishIncomingFile(
                data
            );

            return;

        }


        // ==================================================
        // UPLOAD COMPLETE
        // ==================================================

        if (
            data.type ===
            "upload-complete"
        ) {

            addTransfer(
                `✅ Upload complete`
            );

            return;

        }


        // ==================================================
        // ERROR
        // ==================================================

        if (
            data.type ===
            "error"
        ) {

            console.error(
                "Server error:",
                data.message
            );

            addTransfer(
                `❌ ${escapeHTML(
                    data.message ||
                    "Server error"
                )}`
            );

            return;

        }

    }
);


// ======================================================
// DEVICES
// ======================================================

function showDevices(devices) {

    devicesContainer.innerHTML = "";

    selectedDevices.clear();


    // ==================================================
    // DEVICES
    // ==================================================

    devices
        .filter(
            device =>
                device.id !== myId
        )
        .forEach(
            device => {

                const button =
                    document.createElement(
                        "button"
                    );


                button.textContent =
                    `📱 ${device.name}`;


                button.onclick = () => {

                    selectedDevices.delete(
                        "all"
                    );


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


                    console.log(
                        "Selected:",
                        [
                            ...selectedDevices
                        ]
                    );

                };


                devicesContainer.appendChild(
                    button
                );

            }
        );


    // ==================================================
    // EVERYONE
    // ==================================================

    const all =
        document.createElement(
            "button"
        );


    all.id =
        "everyoneBtn";


    all.textContent =
        "🚀 Everyone";


    all.onclick = () => {

        selectedDevices.clear();

        selectedDevices.add(
            "all"
        );


        devicesContainer
            .querySelectorAll(
                "button"
            )
            .forEach(
                button => {

                    button.classList.remove(
                        "selected"
                    );

                }
            );


        all.classList.add(
            "selected"
        );


        console.log(
            "Selected: Everyone"
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
        selectedDevices.has(
            "all"
        )
    ) {

        return [
            "all"
        ];

    }


    return [
        ...selectedDevices
    ];

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


    if (
        !text.trim()
    ) {

        alert(
            "Write something first."
        );

        return;

    }


    const targets =
        getTargets();


    if (
        !targets.length
    ) {

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
                new Blob([
                    text
                ]).size

        })
    );


    addTransfer(
        "📤 Text sent for approval"
    );


    textInput.value =
        "";

}


// ======================================================
// SEND FILE
// ======================================================

document
    .getElementById("sendFile")
    .addEventListener(
        "click",
        sendFiles
    );


function sendFiles() {

    const files =
        [
            ...fileInput.files
        ];


    if (
        !files.length
    ) {

        alert(
            "Select a file first."
        );

        return;

    }


    const targets =
        getTargets();


    if (
        !targets.length
    ) {

        alert(
            "Select a device first."
        );

        return;

    }


    files.forEach(
        file => {

            // ==========================================
            // IMPORTANT
            // ==========================================

            const localId =
                Math.random()
                    .toString(36)
                    .substring(
                        2,
                        10
                    );


            // Keep the actual File object.
            pendingFiles.set(
                localId,
                file
            );


            console.log(
                "📦 File stored:",
                {
                    localId,
                    name:
                        file.name,
                    size:
                        file.size
                }
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
                        file.type ||
                        "application/octet-stream"

                })
            );

        }
    );


    addTransfer(
        `📤 ${files.length} file(s) sent for approval`
    );


    fileInput.value =
        "";

}


// ======================================================
// UPLOAD FILE
// ======================================================

async function uploadFile(
    transferId,
    localId
) {

    console.log(
        "🚀 uploadFile() called:",
        {
            transferId,
            localId
        }
    );


    const file =
        pendingFiles.get(
            localId
        );


    if (!file) {

        console.error(
            "❌ File not found in pendingFiles:",
            {
                localId,

                available:
                    [
                        ...pendingFiles.keys()
                    ]
            }
        );


        addTransfer(
            "❌ Could not find the selected file."
        );

        return;

    }


    console.log(
        `📤 Starting upload: ${file.name} (${file.size} bytes)`
    );


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


        // Wait if WebSocket buffer gets large.
        while (
            socket.bufferedAmount >
            2 * 1024 * 1024
        ) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        10
                    )
            );

        }


        socket.send(
            buffer
        );


        const progress =
            Math.min(
                100,
                (
                    (
                        offset +
                        buffer.byteLength
                    ) /
                    file.size
                ) *
                100
            );


        console.log(
            `📤 ${file.name}: ${Math.round(
                progress
            )}%`
        );

    }


    socket.send(
        JSON.stringify({

            type:
                "upload-finish",

            transferId

        })
    );


    console.log(
        `✅ Upload sent: ${file.name}`
    );


    pendingFiles.delete(
        localId
    );

}


// ======================================================
// INCOMING TRANSFER MODAL
// ======================================================

function showIncoming(data) {

    currentIncoming =
        data;


    const sender =
        document.getElementById(
            "incomingSender"
        );


    if (sender) {

        sender.textContent =
            data.senderName ||
            "Unknown";

    }


    const preview =
        document.getElementById(
            "incomingPreview"
        );


    if (!preview)
        return;


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

    }

    else if (
        data.kind === "image"
    ) {

        preview.innerHTML = `

            <div>

                🖼️

                <strong>
                    ${escapeHTML(
                        data.name ||
                        "Image"
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

                ${getFileIcon(
                    data.name,
                    data.mime
                )}

                <strong>
                    ${escapeHTML(
                        data.name ||
                        "File"
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
        .hidden =
            false;

}


// ======================================================
// ACCEPT INCOMING
// ======================================================

document
    .getElementById("acceptBtn")
    .addEventListener(
        "click",
        () => {

            if (
                !currentIncoming
            )
                return;


            const transfer =
                currentIncoming;


            socket.send(
                JSON.stringify({

                    type:
                        "accept-transfer",

                    transferId:
                        transfer.transferId

                })
            );


            addTransfer(
                "✅ Transfer accepted"
            );


            closeIncoming();

        }
    );


// ======================================================
// REJECT INCOMING
// ======================================================

document
    .getElementById("rejectBtn")
    .addEventListener(
        "click",
        () => {

            if (
                !currentIncoming
            )
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


// ======================================================
// CLOSE MODAL
// ======================================================

function closeIncoming() {

    currentIncoming =
        null;


    const modal =
        document.getElementById(
            "incomingModal"
        );


    if (modal) {

        modal.hidden =
            true;

    }

}


// ======================================================
// START INCOMING FILE
// ======================================================

function startIncomingFile(data) {

    console.log(
        "📥 Starting incoming file:",
        data
    );


    incomingFiles.set(
        data.transferId,
        {

            transferId:
                data.transferId,

            name:
                data.name,

            size:
                data.size || 0,

            mime:
                data.mime ||
                "application/octet-stream",

            chunks: [],

            received: 0

        }
    );


    addTransfer(
        `📥 Receiving <strong>${escapeHTML(
            data.name
        )}</strong>...`
    );

}


// ======================================================
// RECEIVE BINARY
// ======================================================

async function handleIncomingBinary(
    blob
) {

    // There should normally be only one active
    // incoming file, but use the first active transfer.

    let file =
        null;


    for (
        const value
        of incomingFiles.values()
    ) {

        file =
            value;

        break;

    }


    if (!file) {

        console.warn(
            "⚠️ Received binary data but no incoming file."
        );

        return;

    }


    file.chunks.push(
        blob
    );


    file.received +=
        blob.size;


    const percent =
        file.size
            ? Math.min(
                100,
                (
                    file.received /
                    file.size
                ) *
                100
            )
            : 0;


    console.log(
        `📥 ${file.name}: ${Math.round(
            percent
        )}%`
    );


    const progress =
        document.getElementById(
            "transferProgress"
        );


    if (progress) {

        progress.textContent =
            `${Math.round(
                percent
            )}%`;

    }

}


// ======================================================
// FINISH INCOMING FILE
// ======================================================

function finishIncomingFile(data) {

    const file =
        incomingFiles.get(
            data.transferId
        );


    if (!file) {

        console.warn(
            "⚠️ No incoming file state:",
            data.transferId
        );

        return;

    }


    const blob =
        new Blob(
            file.chunks,
            {
                type:
                    file.mime
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const item =
        document.createElement(
            "div"
        );


    item.className =
        "transfer";


    let preview =
        "";


    // ==================================================
    // IMAGE
    // ==================================================

    if (
        file.mime &&
        file.mime.startsWith(
            "image/"
        )
    ) {

        preview = `

            <img
                src="${url}"
                class="file-thumbnail"
                alt="${escapeHTML(
                    file.name
                )}"
            >

        `;

    }

    // ==================================================
    // OTHER
    // ==================================================

    else {

        preview = `

            <div class="file-icon">

                ${getFileIcon(
                    file.name,
                    file.mime
                )}

            </div>

        `;

    }


    item.innerHTML = `

        <div class="received-file">

            ${preview}

            <div class="file-details">

                <strong>
                    ${escapeHTML(
                        file.name
                    )}
                </strong>

                <small>
                    ${formatBytes(
                        file.received
                    )}
                </small>

                <a
                    class="download-btn"
                    href="${url}"
                    download="${escapeHTML(
                        file.name
                    )}"
                >
                    ⬇ Download
                </a>

            </div>

        </div>

    `;


    transfers.prepend(
        item
    );


    console.log(
        `✅ Received ${file.name}`
    );


    incomingFiles.delete(
        data.transferId
    );

}


// ======================================================
// FILE ICON
// ======================================================

function getFileIcon(
    name,
    mime
) {

    const ext =
        String(
            name || ""
        )
            .split(".")
            .pop()
            .toLowerCase();


    if (
        mime ===
        "application/pdf"
    )
        return "📕";


    if (
        mime &&
        mime.startsWith(
            "video/"
        )
    )
        return "🎬";


    if (
        mime &&
        mime.startsWith(
            "audio/"
        )
    )
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


// ======================================================
// TRANSFER LOG
// ======================================================

function addTransfer(
    html
) {

    if (!transfers)
        return;


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


// ======================================================
// TEXT PREVIEW
// ======================================================

function formatTextPreview(
    text
) {

    text =
        String(
            text || ""
        );


    if (
        text.length <= 600
    ) {

        return escapeHTML(
            text
        );

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
            <strong>
                Starting...
            </strong>
        </div>

        <pre>${escapeHTML(
            start
        )}</pre>

        <div>
            ...
        </div>

        <div>
            <strong>
                Ending...
            </strong>
        </div>

        <pre>${escapeHTML(
            end
        )}</pre>

    `;

}


// ======================================================
// ESCAPE HTML
// ======================================================

function escapeHTML(
    text
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        String(
            text ?? ""
        );


    return div.innerHTML;

}


// ======================================================
// FORMAT BYTES
// ======================================================

function formatBytes(
    bytes
) {

    bytes =
        Number(
            bytes
        );


    if (
        !bytes ||
        bytes <= 0
    )
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
        Math.pow(
            1024,
            index
        )
    ).toFixed(
        index === 0
            ? 0
            : 1
    )
    + " "
    + units[index];

            }
