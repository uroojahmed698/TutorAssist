
import os

import httpx
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_tutor(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase authentication is not configured",
        )

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Please log in first",
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey": SUPABASE_PUBLISHABLE_KEY,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired login session",
            )

        user = response.json()

        if not user.get("id"):
            raise HTTPException(
                status_code=401,
                detail="Could not verify tutor account",
            )

        return user

    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Unable to verify login right now",
        )
