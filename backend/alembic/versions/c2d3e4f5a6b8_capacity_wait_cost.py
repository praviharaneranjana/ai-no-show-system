"""capacity_settings.wait_cost_lkr (cost of each overflow patient in the exact overbooking maths)

Revision ID: c2d3e4f5a6b8
Revises: b1c2d3e4f5a7
Create Date: 2026-10-03 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c2d3e4f5a6b8'
down_revision: Union[str, None] = 'b1c2d3e4f5a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('capacity_settings', sa.Column('wait_cost_lkr', sa.Float(), nullable=False, server_default='10000'))


def downgrade() -> None:
    op.drop_column('capacity_settings', 'wait_cost_lkr')
