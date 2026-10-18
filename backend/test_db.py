import asyncio

from database import client, database


async def main():
    try:
        await client.admin.command("ping")
        print("Connected to MongoDB Atlas!")
        print("Database:", database.name)
    except Exception as error:
        print("MongoDB connection failed:", error)
    finally:
        await client.close()


asyncio.run(main())