"""appointments.data_source / heavy_rain / fee_lkr and predictions.model_version

Revision ID: b1c2d3e4f5a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-03 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b1c2d3e4f5a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('appointments', sa.Column('data_source', sa.Text(), nullable=True))
    op.create_index('ix_appointments_data_source', 'appointments', ['data_source'])
    op.add_column('appointments', sa.Column('heavy_rain', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('appointments', sa.Column('fee_lkr', sa.Float(), nullable=True))
    op.add_column('predictions', sa.Column('model_version', sa.Text(), nullable=True))
    op.execute(sa.text("UPDATE predictions SET model_version = explanation->>'model_version' WHERE model_version IS NULL"))


def downgrade() -> None:
    op.drop_column('predictions', 'model_version')
    op.drop_column('appointments', 'fee_lkr')
    op.drop_column('appointments', 'heavy_rain')
    op.drop_index('ix_appointments_data_source', table_name='appointments')
    op.drop_column('appointments', 'data_source')
