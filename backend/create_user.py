"""Create or update a staff account from the command line.

    python create_user.py --email nurse@hospital.org --name "K. Perera" --role front_desk
    python create_user.py --email admin@hospital.org --role admin --reset-password

The password is read from a hidden prompt (or the SHAI_NEW_PASSWORD env var for scripts).
New accounts, and accounts whose password was reset, must change it at next login.
Roles: front_desk (desk staff), manager (+ capacity and ROI tools), admin (+ user management).
"""
import argparse
import getpass
import os
import sys

from app import models, security
from app.database import SessionLocal


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", help="Full name (required for new accounts)")
    parser.add_argument("--role", choices=security.ROLES, default="front_desk")
    parser.add_argument("--reset-password", action="store_true", help="Set a new password on an existing account")
    parser.add_argument("--deactivate", action="store_true")
    args = parser.parse_args()

    email = args.email.lower().strip()
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()

        if args.deactivate:
            if user is None:
                print(f"No such user: {email}")
                return 1
            user.is_active = False
            db.commit()
            print(f"Deactivated {email}")
            return 0

        if user is not None and not args.reset_password:
            user.role = args.role
            if args.name:
                user.full_name = args.name
            db.commit()
            print(f"Updated {email} (role={user.role}). Use --reset-password to change the password.")
            return 0

        if user is None and not args.name:
            print("--name is required when creating a new account")
            return 1

        password = os.getenv("SHAI_NEW_PASSWORD") or getpass.getpass("New password: ")
        problem = security.password_problem(password)
        if problem:
            print(problem)
            return 1

        if user is None:
            user = models.User(email=email, full_name=args.name, role=args.role, password_hash="")
            db.add(user)
        user.password_hash = security.hash_password(password)
        user.must_change_password = True
        user.is_active = True
        user.failed_attempts = 0
        user.locked_until = None
        db.commit()
        print(f"Saved {email} (role={user.role}); the password must be changed at first login.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
