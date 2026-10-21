const path = require("node:path");
const { Client, LocalAuth, Chat } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// Create the WhatsApp client and keep the session locally.
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, ".wwebjs_auth"),
  }),
puppeteer: {
  channel: "chrome",
  headless: false,
  protocolTimeout: 300000,
},
});

// Display a QR code when linking is required.
client.on("qr", (qr) => {
  console.log("Scan using WhatsApp > Linked devices:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("WhatsApp authentication successful.");
});

client.on("loading_screen", (percent, message) => {
  console.log(`Loading: ${percent}% | ${message}`);
});

client.on("change_state", (state) => {
  console.log("Connection state:", state);
});

// Temporary workaround: read basic group details only.
client.on("ready", async () => {
  console.log("ChatLens AI: WhatsApp connected and ready.");

  try {
    const groups = await client.pupPage.evaluate(() => {
      const collections = window.require("WAWebCollections");
      const chats = collections.Chat.getModelsArray();

      return chats
        .filter((chat) => {
          const id = chat.id?._serialized;
          return typeof id === "string" && id.endsWith("@g.us");
        })
        .map((chat) => ({
          id: chat.id._serialized,
          name: chat.name || chat.formattedTitle || "Unnamed group",
          unreadCount: chat.unreadCount ?? 0,
        }));
    });

    const targetGroupName = "UOK SE 11th - Discussion group";

    const normalizeName = (name) =>
      name.trim().replace(/\s+/g, " ").toLowerCase();

    const matches = groups.filter(
      (group) =>
        normalizeName(group.name) === normalizeName(targetGroupName)
    );

    if (matches.length === 0) {
      console.log("Selected group not found. Check the group name.");
      return;
    }

    if (matches.length > 1) {
      console.log("Multiple groups have this name. Select by group ID next.");
      return;
    }

    const selectedGroup = matches[0];

    console.log("\nSelected group:", selectedGroup.name);
    console.log("Unread count:", selectedGroup.unreadCount);
    console.log("\nFetching recent messages...");

    try {
      const chat = new Chat(client, {
        id: {
          _serialized: selectedGroup.id,
        },
      });

      const messages = await chat.fetchMessages({ limit: 10 });

      console.log(`Fetched ${messages.length} messages.`);

      messages.forEach((message, index) => {
        console.log(`\n--- Message ${index + 1} ---`);
        console.log(
          "Time:",
          new Date(message.timestamp * 1000).toLocaleString()
        );
        console.log("Type:", message.type);
        console.log("Text length:", message.body?.length ?? 0);
      });
    } catch (error) {
      console.error("Selected group message fetch failed:");
      console.error(error);
    }

  } catch (error) {
    console.error("Basic group lookup failed:");
    console.error(error);
  }
});

client.on("auth_failure", () => {
  console.error("Authentication failed. Please reconnect.");
});

client.on("disconnected", () => {
  console.log("WhatsApp disconnected.");
});

// Stop the browser when Ctrl + C is pressed.
process.once("SIGINT", async () => {
  console.log("\nStopping ChatLens AI...");

  try {
    await client.destroy();
  } catch {
    console.error("Browser cleanup did not complete.");
  } finally {
    process.exit(0);
  }
});

// Start the client after registering the event handlers.
console.log("Starting WhatsApp initialization...");

let browserErrorListenerAdded = false;

client.on("authenticated", () => {
  if (browserErrorListenerAdded || !client.pupPage) return;

  browserErrorListenerAdded = true;

  client.pupPage.on("pageerror", (error) => {
    console.error("Browser page error:", error.message);
  });

  client.pupPage.on("error", (error) => {
    console.error("Browser crash:", error.message);
  });

  console.log("Browser error monitoring enabled.");
});

setTimeout(async () => {
  try {
    if (!client.pupPage || client.pupPage.isClosed()) return;

    const status = await client.pupPage.evaluate(() => {
      const result = {
        pageLoaded: document.readyState,
        hasWWebJS: typeof window.WWebJS !== "undefined",
        getChatAvailable: typeof window.WWebJS?.getChat,
        webVersion: window.Debug?.VERSION ?? "unknown",
      };

      try {
        const socket = window.require("WAWebSocketModel").Socket;

        result.socketState = socket.state;
        result.hasSynced = socket.hasSynced;
      } catch (error) {
        result.socketCheckError = String(error);
      }

      return result;
    });

    console.log("Initialization diagnostic:", status);
    console.log("Library initialization:", {
      clientInfoCreated: Boolean(client.info),
      interfaceCreated: Boolean(client.interface),
    });

  } catch (error) {
    console.error("Diagnostic failed:", error.message);
  }
}, 30000);


const originalAttachEventListeners =
  client.attachEventListeners.bind(client);

client.attachEventListeners = async function (...args) {
  console.log("Attaching WhatsApp event listeners...");

  const warningTimer = setTimeout(() => {
    console.log("Event listener setup is still pending after 30 seconds.");
  }, 30000);

  try {
    const result = await originalAttachEventListeners(...args);
    console.log("WhatsApp event listeners attached.");
    return result;
  } catch (error) {
    console.error("Event listener setup failed:");
    console.error(error);
    throw error;
  } finally {
    clearTimeout(warningTimer);
  }
};


client.initialize()
  .then(() => {
    console.log("WhatsApp initialize() completed.");
  })
  .catch((error) => {
    console.error("WhatsApp startup failed:");
    console.error(error);
    process.exitCode = 1;
  });




