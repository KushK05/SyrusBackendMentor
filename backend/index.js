import cors from "cors";
import dotenv from "dotenv";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits
} from "discord.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env, then fallback to project root .env
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const PORT = process.env.PORT || 4000;
const CHANNEL_ID =
  process.env.DISCORD_GENERAL_CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;

const app = express();
app.use(express.json());
app.use(
  cors({
    origin:
      process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()) ||
      "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let botReady = false;
const REQUESTS = new Map(); // In-memory store; replace with DB in production (stateless ka jarurat nhi lagra)

const mentorRequestLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 1 requests per window (baad me change kar denge )
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many mentor requests. Please wait a moment and try again."
  }
});

client.once("ready", () => {
  botReady = true;
  console.log("Discord Bot Ready");
});

const buildDiscordMessage = ({ requestId, teamName, tableNumber, queryCategory, details }) => {
  const detailLine = details ? `\nDetails: ${details}` : "";
  return (
    `🆘 **Mentor Needed**\n` +
    `Team: ${teamName}\n` +
    `Table: ${tableNumber}\n` +
    `Category: ${queryCategory}${detailLine}\n\n` +
    `Request ID: ${requestId}`
  );
};

const getMentorName = (interaction) => {
  const memberName = interaction?.member?.nickname || interaction?.member?.displayName;
  const userName = interaction?.user?.globalName || interaction?.user?.username;
  return memberName || userName || "Mentor";
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, requestId] = interaction.customId.split(":");
  if (action !== "mentor-accept") return;

  const request = REQUESTS.get(requestId);
  if (!request) {
    await interaction.reply({
      content: "This request was not found or was already handled.",
      ephemeral: true
    });
    return;
  }

  if (request.status === "accepted") {
    const acceptedName =
      request.acceptedBy?.name || request.acceptedBy?.tag || "another mentor";
    await interaction.reply({
      content: `Already accepted by ${acceptedName}.`,
      ephemeral: true
    });
    return;
  }

  const mentorName = getMentorName(interaction);
  request.status = "accepted";
  request.acceptedBy = {
    id: interaction.user.id,
    tag: interaction.user.tag,
    name: mentorName
  };
  request.acceptedAt = new Date().toISOString();
  REQUESTS.set(requestId, request);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(interaction.customId)
      .setLabel("Request claimed")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  try {
    await interaction.update({
      content: `${request.messageContent}\n\n✅ Accepted by ${mentorName}`,
      components: [disabledRow]
    });
    await interaction.followUp({
      content: "You claimed this mentor request. Thank you!",
      ephemeral: true
    });
  } catch (err) {
    console.error("Error updating mentor request interaction", err);
  }
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Syrus mentor backend running",
    health: "/health",
    mentorRequests: "/api/mentor-requests"
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, botReady });
});

app.post("/api/mentor-requests", mentorRequestLimiter, async (req, res) => {
  const { teamName, tableNumber, queryCategory, details = "" } = req.body || {};

  if (!teamName || !tableNumber || !queryCategory) {
    return res.status(400).json({
      message: "teamName, tableNumber, and queryCategory are required"
    });
  }

  if (!botReady) {
    return res
      .status(503)
      .json({ message: "Discord bot not ready. Please try again." });
  }

  if (!CHANNEL_ID) {
    return res
      .status(500)
      .json({ message: "Missing DISCORD_GENERAL_CHANNEL_ID in env" });
  }

  try {
    const requestId = uuidv4();
    const messageContent = buildDiscordMessage({
      requestId,
      teamName,
      tableNumber,
      queryCategory,
      details
    });

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mentor-accept:${requestId}`)
        .setLabel("Accept request")
        .setStyle(ButtonStyle.Success)
    );

    const channel = await client.channels.fetch(CHANNEL_ID);
    const message = await channel.send({
      content: messageContent,
      components: [actionRow]
    });

    REQUESTS.set(requestId, {
      id: requestId,
      teamName,
      tableNumber,
      queryCategory,
      details,
      status: "pending",
      messageId: message.id,
      channelId: CHANNEL_ID,
      messageContent
    });

    res.json({ requestId, status: "pending" });
  } catch (err) {
    console.error("Failed to send mentor request to Discord", err);
    res
      .status(500)
      .json({ message: "Unable to send mentor request. Please try again." });
  }
});

app.get("/api/mentor-requests/:id", (req, res) => {
  const request = REQUESTS.get(req.params.id);
  if (!request) {
    return res.status(404).json({ message: "Request not found" });
  }

  res.json({
    requestId: request.id,
    status: request.status,
    acceptedBy: request.acceptedBy,
    acceptedAt: request.acceptedAt,
    teamName: request.teamName,
    tableNumber: request.tableNumber,
    queryCategory: request.queryCategory,
    details: request.details
  });
});

if (!process.env.DISCORD_BOT_TOKEN) {
  console.warn("DISCORD_BOT_TOKEN is missing. Discord bot will not start.");
} else {
  client
    .login(process.env.DISCORD_BOT_TOKEN)
    .catch((err) => console.error("Failed to login to Discord", err));
}


app.listen(4000);

export default app;
