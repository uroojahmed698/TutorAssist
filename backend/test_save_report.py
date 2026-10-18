import asyncio

from database import client, database
from report_storage import save_report


async def main():
    try:
        report_id = await save_report({
            "student": "Test Student",
            "grade": "Grade 5",
            "subject": "Math",
            "topic": "Fractions",
            "report": "This is a test tutoring report.",
        })

        print("Report saved successfully!")
        print("Report ID:", report_id)
        print("Database:", database.name)

    except Exception as error:
        print("Error saving report:", error)

    finally:
        await client.close()


asyncio.run(main())