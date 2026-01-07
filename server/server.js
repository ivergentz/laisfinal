const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")
const { MongoClient, ObjectId } = require("mongodb")
require("dotenv").config()

const app = express()
const PORT = 5001

// Middleware
app.use(cors())
app.use(bodyParser.json())

// MongoDB Configuration
const MONGO_URI = process.env.MONOG_URI
const DB_NAME = process.env.DB_NAME || "news"
const COLLECTION_NAME = "news"
const client = new MongoClient(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

let db = null

// Establish MongoDB Connection
const connectToMongoDB = async () => {
  try {
    if (!db) {
      console.log("Connecting to MongoDB...")
      await client.connect() // Ensure the client connects first
      db = client.db(DB_NAME) // Set the db object after successful connection
      console.log(`Connected to MongoDB: ${DB_NAME}`)
    }
    return db.collection(COLLECTION_NAME)
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message) // Log connection errors
    throw new Error("Failed to connect to MongoDB")
  }
}

// GET all news
app.get("/news", async (req, res) => {
  try {
    const collection = await connectToMongoDB()
    const news = await collection.find().toArray()
    res.status(200).json(news)
  } catch (error) {
    console.error("Error fetching news:", error.message) // Log errors
    res.status(500).send("Error fetching news: " + error.message)
  }
})

// POST a new news item
app.post("/news", async (req, res) => {
  const newNews = req.body
  try {
    const collection = await connectToMongoDB()
    if (newNews.display) {
      await collection.updateMany({}, { $set: { display: false } })
    }
    newNews.createdAt = new Date().toISOString()
    const result = await collection.insertOne(newNews)
    res.status(200).send("News added successfully")
  } catch (error) {
    console.error("Error adding news:", error.message) // Log errors
    res.status(500).send("Error adding news: " + error.message)
  }
})

// PUT (update) a news item by ID
app.put("/news/:id", async (req, res) => {
  const { id } = req.params
  const updatedNews = req.body
  try {
    const collection = await connectToMongoDB()
    if (updatedNews.display) {
      await collection.updateMany({}, { $set: { display: false } })
    }
    await collection.updateOne({ _id: new ObjectId(id) }, { $set: updatedNews })
    res.status(200).send("News updated successfully")
  } catch (error) {
    console.error("Error updating news:", error.message) // Log errors
    res.status(500).send("Error updating news: " + error.message)
  }
})

// DELETE a news item by ID
app.delete("/news/:id", async (req, res) => {
  const { id } = req.params
  try {
    const collection = await connectToMongoDB()
    await collection.deleteOne({ _id: new ObjectId(id) })
    res.status(200).send("News deleted successfully")
  } catch (error) {
    console.error("Error deleting news:", error.message) // Log errors
    res.status(500).send("Error deleting news: " + error.message)
  }
})

// Start the Server
app.listen(PORT, (err) => {
  if (err) {
    console.error("Error starting server:", err)
    process.exit(1)
  }
  console.log(`Server running on http://localhost:${PORT}`)
})
