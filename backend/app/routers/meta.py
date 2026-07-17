from fastapi import APIRouter, Depends

from ..auth import require_user
from ..db import fetch_all, owner

router = APIRouter(prefix="/api/meta", tags=["meta"], dependencies=[Depends(require_user)])


@router.get("/filiais")
def filiais():
    return fetch_all(
        f"""SELECT codigo AS codfilial, razaosocial
            FROM {owner()}.pcfilial
            ORDER BY codigo""",
        cache_key="meta:filiais",
    )
