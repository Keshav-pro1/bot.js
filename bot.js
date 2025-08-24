const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");

// List of authorized owner WhatsApp numbers in international format with domain
const OWNER_NUMBERS = [
    "919810796194@s.whatsapp.net", // Your number
    "918595872876@s.whatsapp.net",
    "919971382945@s.whatsapp.net",
    "919818879172@s.whatsapp.net"// Another authorized owner
    // Add more numbers as needed
];

// Example hackathon links, update with current sources as needed
const latestHackathons = [
    "https://devfolio.co/hackathons",
    "https://dorahacks.io/hackathon",
    "https://unstop.com/hackathons",
    "https://mlh.io",
];

async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } =
        await useMultiFileAuthState("auth_info_baileys");

    const sock = makeWASocket({
        auth: state,
        version,
        logger: P({ level: "silent" }),
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) startBot();
        }
        if (connection === "open") {
            console.log("Connected to WhatsApp");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg.message) return; // Ignore empty messages
        if (!msg.key.remoteJid.endsWith("@g.us")) return; // Only respond in groups

        const sender = jidNormalizedUser(
            msg.key.participant || msg.key.remoteJid,
        );
        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const trimmedText = text.trim();

        // Ping command
        if (trimmedText.toLowerCase() === ".ping") {
            await sock.sendMessage(
                msg.key.remoteJid,
                { text: "Pong!" },
                { quoted: msg },
            );
            return;
        }

        // Tagall command restricted to authorized owners
        if (trimmedText.toLowerCase() === ".tagall") {
            if (!OWNER_NUMBERS.includes(sender)) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    { text: "You are not authorized to use this command." },
                    { quoted: msg },
                );
                return;
            }
            const groupMeta = await sock.groupMetadata(msg.key.remoteJid);
            const participants = groupMeta.participants;

            const mentionText = participants
                .map((p) => {
                    const isAdmin =
                        p.admin === "admin" || p.admin === "superadmin";
                    const username = `@${p.id.split("@")[0]}`;
                    return isAdmin ? `${username} 👑` : username;
                })
                .join("\n");

            const mentionIDs = participants.map((p) => p.id);

            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `Tagging everyone:\n${mentionText}`,
                    mentions: mentionIDs,
                },
                { quoted: msg },
            );
            return;
        }

        // Garuda Hackathon command
        if (trimmedText.toLowerCase() === ".hackathon") {
            const message =
                "Here are some links for the latest hackathons:\n" +
                latestHackathons.map((link) => `- ${link}`).join("\n");
            await sock.sendMessage(
                msg.key.remoteJid,
                { text: message },
                { quoted: msg },
            );
            return;
        }

        // Spam message command — format: '.spamMessage your message here'
        if (trimmedText.toLowerCase().startsWith(".spammessage ")) {
            if (!OWNER_NUMBERS.includes(sender)) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    { text: "You are not authorized to use this command." },
                    { quoted: msg },
                );
                return;
            }
            const spamMsg = trimmedText.slice(12).trim();
            if (!spamMsg) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        text: "Please provide a message to spam. Usage: .spamMessage your message",
                    },
                    { quoted: msg },
                );
                return;
            }
            // Send the message 5 times with a small delay to avoid flooding issues
            for (let i = 0; i < 5; i++) {
                await sock.sendMessage(msg.key.remoteJid, { text: spamMsg });
                await new Promise((res) => setTimeout(res, 1000)); // 1-second delay
            }
            return;
        }

        // Garuda Help command
        if (trimmedText.toLowerCase() === "garuda -h") {
            const helpText = `Garuda Bot Commands:
- .ping : Check if bot is responsive
- .tagall : Tag all members (owners only)
- .Hackathon : Get latest hackathon links
- .spamMessage <message> : Bot spams the message (owners only)
- Garuda -h : Show this help message`;
            await sock.sendMessage(
                msg.key.remoteJid,
                { text: helpText },
                { quoted: msg },
            );
            return;
        }
    });
}

startBot();
