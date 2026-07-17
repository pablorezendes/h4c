"""Gera o hash pbkdf2 para ADMIN_PASSWORD_HASH do .env. Uso: python scripts/hash_password.py <senha>"""
import sys

sys.path.insert(0, ".")
from app.auth import hash_password  # noqa: E402

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("uso: python scripts/hash_password.py <senha>")
    print(hash_password(sys.argv[1]))
