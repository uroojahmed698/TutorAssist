from datetime import datetime, timezone

from database import reports_collection


async def save_report(report_data: dict) -> str:
    """Save a tutoring report to MongoDB and return its ID."""

    document = {
        **report_data,
        "created_at": datetime.now(timezone.utc),
    }

    result = await reports_collection.insert_one(document)

    return str(result.inserted_id)