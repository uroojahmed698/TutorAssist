
import os

from dotenv import load_dotenv
from pymongo import AsyncMongoClient

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI is missing from the .env file")

client = AsyncMongoClient(MONGODB_URI)

database = client["tutorprep"]
reports_collection = database["reports"]
students_collection = database["students"]

