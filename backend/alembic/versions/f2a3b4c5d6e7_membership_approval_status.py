"""Add status, approval tracking to hospital memberships and verification to domains.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-10-01 23:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update hospital_memberships
    op.add_column('hospital_memberships', sa.Column('status', sa.String(), nullable=False, server_default='active'))
    op.add_column('hospital_memberships', sa.Column('invited_or_requested_role', sa.String(), nullable=True))
    op.add_column('hospital_memberships', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('hospital_memberships', sa.Column('approved_by_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_hospital_memberships_status', 'hospital_memberships', ['status'])

    # 2. Update hospital_email_domains
    op.add_column('hospital_email_domains', sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('hospital_email_domains', 'is_verified')
    op.drop_index('ix_hospital_memberships_status', table_name='hospital_memberships')
    op.drop_column('hospital_memberships', 'approved_by_user_id')
    op.drop_column('hospital_memberships', 'approved_at')
    op.drop_column('hospital_memberships', 'invited_or_requested_role')
    op.drop_column('hospital_memberships', 'status')
