const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")
const cookieParser = require("cookie-parser")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const { MongoClient, ObjectId } = require("mongodb")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 5001

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
)
app.use(bodyParser.json())
app.use(cookieParser())

// MongoDB Configuration
const MONGO_URI = process.env.MONGO_URI
const DB_NAME = process.env.DB_NAME || "news"
const client = new MongoClient(MONGO_URI)

let db = null

// JWT Secret
const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production"

// ==================== MongoDB Connection ====================
const connectToMongoDB = async () => {
  try {
    if (!db) {
      console.log("Connecting to MongoDB...")
      await client.connect()
      db = client.db(DB_NAME)
      console.log(`Connected to MongoDB: ${DB_NAME}`)
    }
    return db
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message)
    throw new Error("Failed to connect to MongoDB")
  }
}

// ==================== Auth Middleware ====================
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1]

  if (!token) {
    return res.status(401).json({ message: "Kein Token bereitgestellt" })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Ungültiger Token" })
    }
    req.user = user
    next()
  })
}

// ==================== ADMIN ROUTES ====================

// Admin Login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Benutzername und Passwort erforderlich" })
    }

    const database = await connectToMongoDB()
    const adminsCollection = database.collection("admins")
    const admin = await adminsCollection.findOne({ username })

    if (!admin) {
      return res.status(401).json({ message: "Ungültige Anmeldedaten" })
    }

    const isValidPassword = await bcrypt.compare(password, admin.password)

    if (!isValidPassword) {
      return res.status(401).json({ message: "Ungültige Anmeldedaten" })
    }

    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      JWT_SECRET,
      { expiresIn: "24h" }
    )

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    })

    res.json({
      message: "Erfolgreich angemeldet",
      username: admin.username,
    })
  } catch (error) {
    console.error("Login-Fehler:", error)
    res.status(500).json({ message: "Fehler beim Login" })
  }
})

// Admin Logout
app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("token")
  res.json({ message: "Erfolgreich abgemeldet" })
})

// Token validieren
app.get("/api/admin/verify", authenticateToken, (req, res) => {
  res.json({ valid: true, username: req.user.username })
})

// ==================== STÖRER ROUTES ====================

// Störer abrufen (öffentlich)
app.get("/api/stoerer", async (req, res) => {
  try {
    const database = await connectToMongoDB()
    const stoererCollection = database.collection("stoerer")
    let stoerer = await stoererCollection.findOne()

    if (!stoerer) {
      stoerer = { line1: "", line2: "", isActive: false }
      await stoererCollection.insertOne(stoerer)
    }

    if (stoerer.isActive) {
      res.json({
        line1: stoerer.line1,
        line2: stoerer.line2,
        isActive: true,
      })
    } else {
      res.json({ line1: "", line2: "", isActive: false })
    }
  } catch (error) {
    console.error("Fehler beim Abrufen des Störers:", error)
    res.status(500).json({ message: "Fehler beim Abrufen des Störers" })
  }
})

// Störer aktualisieren (Admin only)
app.put("/api/admin/stoerer", authenticateToken, async (req, res) => {
  try {
    const { line1, line2, isActive } = req.body
    const database = await connectToMongoDB()
    const stoererCollection = database.collection("stoerer")

    let stoerer = await stoererCollection.findOne()

    if (stoerer) {
      await stoererCollection.updateOne(
        { _id: stoerer._id },
        {
          $set: {
            line1: line1 || "",
            line2: line2 || "",
            isActive: isActive !== undefined ? isActive : false,
            updatedAt: new Date(),
          },
        }
      )
    } else {
      await stoererCollection.insertOne({
        line1: line1 || "",
        line2: line2 || "",
        isActive: isActive !== undefined ? isActive : false,
        updatedAt: new Date(),
      })
    }

    res.json({ message: "Störer erfolgreich aktualisiert" })
  } catch (error) {
    console.error("Fehler beim Aktualisieren:", error)
    res.status(500).json({ message: "Fehler beim Aktualisieren des Störers" })
  }
})

// Störer löschen (Admin only)
app.delete("/api/admin/stoerer", authenticateToken, async (req, res) => {
  try {
    const database = await connectToMongoDB()
    const stoererCollection = database.collection("stoerer")

    await stoererCollection.updateMany(
      {},
      {
        $set: {
          line1: "",
          line2: "",
          isActive: false,
          updatedAt: new Date(),
        },
      }
    )

    res.json({ message: "Störer erfolgreich gelöscht" })
  } catch (error) {
    console.error("Fehler beim Löschen:", error)
    res.status(500).json({ message: "Fehler beim Löschen des Störers" })
  }
})

// ==================== NEWS ROUTES ====================

// GET all news
app.get("/news", async (req, res) => {
  try {
    const database = await connectToMongoDB()
    const collection = database.collection("news")
    const news = await collection.find().toArray()
    res.status(200).json(news)
  } catch (error) {
    console.error("Error fetching news:", error.message)
    res.status(500).send("Error fetching news: " + error.message)
  }
})

// POST a new news item
app.post("/news", async (req, res) => {
  const newNews = req.body
  try {
    const database = await connectToMongoDB()
    const collection = database.collection("news")

    if (newNews.display) {
      await collection.updateMany({}, { $set: { display: false } })
    }

    newNews.createdAt = new Date().toISOString()
    await collection.insertOne(newNews)
    res.status(200).send("News added successfully")
  } catch (error) {
    console.error("Error adding news:", error.message)
    res.status(500).send("Error adding news: " + error.message)
  }
})

// PUT (update) a news item by ID
app.put("/news/:id", async (req, res) => {
  const { id } = req.params
  const updatedNews = req.body
  try {
    const database = await connectToMongoDB()
    const collection = database.collection("news")

    if (updatedNews.display) {
      await collection.updateMany({}, { $set: { display: false } })
    }

    await collection.updateOne({ _id: new ObjectId(id) }, { $set: updatedNews })
    res.status(200).send("News updated successfully")
  } catch (error) {
    console.error("Error updating news:", error.message)
    res.status(500).send("Error updating news: " + error.message)
  }
})

// DELETE a news item by ID
app.delete("/news/:id", async (req, res) => {
  const { id } = req.params
  try {
    const database = await connectToMongoDB()
    const collection = database.collection("news")
    await collection.deleteOne({ _id: new ObjectId(id) })
    res.status(200).send("News deleted successfully")
  } catch (error) {
    console.error("Error deleting news:", error.message)
    res.status(500).send("Error deleting news: " + error.message)
  }
})

// ==================== INIT ADMIN ====================
const createFirstAdmin = async () => {
  try {
    const database = await connectToMongoDB()
    const adminsCollection = database.collection("admins")

    const adminExists = await adminsCollection.findOne({ username: "admin" })

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin123", 10)
      await adminsCollection.insertOne({
        username: "admin",
        password: hashedPassword,
        createdAt: new Date(),
      })
      console.log("👤 Erster Admin erstellt: admin / admin123")
      console.log("⚠️  WICHTIG: Passwort nach dem ersten Login ändern!")
    }
  } catch (error) {
    console.error("Fehler beim Erstellen des Admin-Accounts:", error)
  }
}

// ==================== START SERVER ====================
app.listen(PORT, async (err) => {
  if (err) {
    console.error("Error starting server:", err)
    process.exit(1)
  }
  console.log(`Server running on http://localhost:${PORT}`)
  await createFirstAdmin()
})
