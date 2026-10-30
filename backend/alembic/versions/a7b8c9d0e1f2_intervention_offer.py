"""Interventions: structured slot offer and outbound message text.

Revision ID: a7b8c9d0e1f2
Revises: d3e4f5a6b7c9
Create Date: 2026-10-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'd3e4f5a6b7c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('interventions', sa.Column('offer', postgresql.JSONB(), nullable=True))
    op.add_column('interventions', sa.Column('message_text', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('interventions', 'message_text')
    op.drop_column('interventions', 'offer')
